"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoRewrite = exports.VideoRewriteService = void 0;
/**
 * 视频洗稿 —— 3 步独立（每步可单独重试）
 *
 *   Step 1 · 获取视频：URL → yt-dlp 下载 | 本地上传 → 直接用
 *   Step 2 · 语音识别：ffmpeg 抽音频 → SiliconFlow ASR → SRT + 纯文本
 *   Step 3 · LLM 洗稿：风格预设 + 目标平台规则 → 原创文案 → 合规审核
 *
 * 每步产物都入 video_rewrites 表 + 落盘缓存，用户可从任何一步重跑。
 */
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const video_downloader_1 = require("./video-downloader");
const asr_1 = require("./asr");
const llm_1 = require("./llm");
const style_engine_1 = require("./style-engine");
const content_audit_1 = require("./content-audit");
const logger_1 = require("../utils/logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ADAPTATION_RULES 复用：不 import copywriting.ts（避免循环依赖），就地再写一份。
const ADAPTATION_RULES = {
    douyin: '前 3 秒必须有钩子；多用口语和语气词；总长控制在 300 字内；多用 emoji',
    xiaohongshu: '标题必须包含数字；正文结尾加 10-15 个标签；文风真诚亲和；使用分隔符和 emoji',
    bilibili: '可以较长（500-1000 字）；内容有深度；开头引入弹幕互动引导；用词可以更专业',
    weixin: '图文形式；段落清晰；可以较长；语调正式一点',
    weibo: '短平快，280 字内，有话题标签 #xxx#',
};
class VideoRewriteService {
    // ────── CRUD ──────
    async list(limit = 30) {
        return db_1.db.select().from(schema_1.videoRewrites).orderBy((0, drizzle_orm_1.desc)(schema_1.videoRewrites.id)).limit(limit);
    }
    async get(id) {
        const [row] = await db_1.db.select().from(schema_1.videoRewrites).where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
        return row || null;
    }
    async remove(id) {
        await db_1.db.delete(schema_1.videoRewrites).where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
        return { ok: true };
    }
    async create(input) {
        if (input.sourceType === 'url' && !input.sourceUrl) {
            throw new Error('URL 模式必须提供 sourceUrl');
        }
        if (input.sourceType === 'local' && !input.sourcePath) {
            throw new Error('本地模式必须提供 sourcePath');
        }
        const [row] = await db_1.db
            .insert(schema_1.videoRewrites)
            .values({
            sourceType: input.sourceType,
            sourceUrl: input.sourceUrl ?? null,
            sourcePath: input.sourcePath ?? null,
            stylePresetId: input.stylePresetId ?? null,
            targetPlatform: input.targetPlatform ?? null,
            step: input.sourceType === 'url' ? 'download' : 'asr',
            status: 'pending',
        })
            .returning();
        return row;
    }
    // ────── Step 1：获取视频 ──────
    async runDownload(id, sse) {
        const job = await this.get(id);
        if (!job)
            throw new Error('任务不存在');
        try {
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({ step: 'download', status: 'running', errorMsg: null })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            if (job.sourceType === 'local') {
                // 本地上传：跳过下载，直接用 sourcePath
                const p = job.sourcePath || '';
                if (!fs_1.default.existsSync(p))
                    throw new Error(`本地视频文件不存在：${p}`);
                sse.sendProgress('本地视频已就位', 100);
                await db_1.db
                    .update(schema_1.videoRewrites)
                    .set({
                    title: path_1.default.basename(p),
                    platform: 'local',
                    status: 'done',
                    step: 'asr',
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
                sse.sendDone({ id });
                return;
            }
            const r = await video_downloader_1.videoDownloader.download(job.sourceUrl, {
                quality: '720',
                onProgress: (info) => sse.sendProgress(info.stage, info.percent),
            });
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({
                sourcePath: r.filePath,
                platform: r.platform,
                title: r.title,
                uploader: r.uploader ?? null,
                duration: r.duration,
                thumbnail: r.thumbnail ?? null,
                step: 'asr',
                status: 'done',
            })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            sse.sendDone({ id, cached: r.cached });
        }
        catch (err) {
            const msg = String(err?.message || err);
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({ status: 'failed', errorMsg: msg })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            sse.sendError(msg);
        }
    }
    // ────── Step 2：语音识别 ──────
    async runAsr(id, sse) {
        const job = await this.get(id);
        if (!job)
            throw new Error('任务不存在');
        if (!job.sourcePath || !fs_1.default.existsSync(job.sourcePath)) {
            throw new Error('视频文件不存在，请先完成 Step 1 下载');
        }
        try {
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({ step: 'asr', status: 'running', errorMsg: null })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            const result = await asr_1.asr.transcribeVideo(job.sourcePath, (p) => sse.sendProgress(p.stage, p.percent));
            // 落盘 SRT
            const srtDir = path_1.default.join(path_1.default.dirname(job.sourcePath), 'asr');
            const srtPath = path_1.default.join(srtDir, 'transcript.srt');
            fs_1.default.writeFileSync(srtPath, asr_1.asr.toSrt(result));
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({
                transcriptText: result.fullText,
                transcriptSegments: JSON.stringify(result.segments),
                srtPath,
                step: 'rewrite',
                status: 'done',
            })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            sse.sendDone({ id, segCount: result.segments.length, chars: result.fullText.length });
        }
        catch (err) {
            const msg = String(err?.message || err);
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({ status: 'failed', errorMsg: msg })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            sse.sendError(msg);
        }
    }
    // ────── Step 3：LLM 洗稿 ──────
    async runRewrite(id, sse) {
        const job = await this.get(id);
        if (!job)
            throw new Error('任务不存在');
        if (!job.transcriptText) {
            throw new Error('还没有字幕，请先完成 Step 2 语音识别');
        }
        try {
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({ step: 'rewrite', status: 'running', errorMsg: null })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            const style = job.stylePresetId
                ? await style_engine_1.styleEngine.getPreset(job.stylePresetId)
                : undefined;
            const platform = job.targetPlatform || 'douyin';
            const rules = ADAPTATION_RULES[platform] || '';
            sse.sendProgress('正在洗稿', 20);
            const prompt = style_engine_1.styleEngine.renderPrompt('copy_video_rewrite', {
                subtitles: job.transcriptText,
                platform,
                adaptation_rules: rules,
            }, style);
            const result = await llm_1.llm.chatStreamWithScene('copy_rewrite', {
                messages: [
                    { role: 'system', content: '视频洗稿专家。要求：保留原意、语句原创、不抄袭，适配目标平台语感。' },
                    { role: 'user', content: prompt },
                ],
            }, (chunk) => sse.sendChunk(chunk.content));
            sse.sendProgress('合规审核', 90);
            let auditLevel = 'pending';
            let auditResultJson = null;
            try {
                const audit = await content_audit_1.contentAudit.autoAudit(result);
                auditLevel = audit.level;
                auditResultJson = JSON.stringify(audit);
            }
            catch (e) {
                logger_1.logger.warn('[VideoRewrite] audit failed (non-fatal): ' + String(e));
            }
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({
                rewrittenText: result,
                step: 'done',
                status: 'done',
                auditLevel,
                auditResult: auditResultJson,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            sse.sendDone({ id, chars: result.length, auditLevel });
        }
        catch (err) {
            const msg = String(err?.message || err);
            await db_1.db
                .update(schema_1.videoRewrites)
                .set({ status: 'failed', errorMsg: msg })
                .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
            sse.sendError(msg);
        }
    }
    // ────── 升级为 copywriting（进入常规流水线）──────
    async promoteToCopywriting(id) {
        const { copywritings } = await Promise.resolve().then(() => __importStar(require('../db/schema')));
        const job = await this.get(id);
        if (!job)
            throw new Error('任务不存在');
        if (!job.rewrittenText)
            throw new Error('尚未完成洗稿');
        const [row] = await db_1.db
            .insert(copywritings)
            .values({
            title: job.title || '视频洗稿',
            topic: '视频洗稿',
            platform: job.targetPlatform || 'douyin',
            finalText: job.rewrittenText,
            wordCount: job.rewrittenText.length,
            generationMode: 'video_rewrite',
            status: 'done',
            auditLevel: job.auditLevel || 'pending',
            auditResult: job.auditResult,
        })
            .returning();
        await db_1.db
            .update(schema_1.videoRewrites)
            .set({ copywritingId: row.id })
            .where((0, drizzle_orm_1.eq)(schema_1.videoRewrites.id, id));
        return row.id;
    }
}
exports.VideoRewriteService = VideoRewriteService;
exports.videoRewrite = new VideoRewriteService();
//# sourceMappingURL=video-rewrite.js.map