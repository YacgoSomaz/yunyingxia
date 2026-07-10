"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoWorkshop = exports.VideoWorkshopService = exports.PLATFORM_COVER_SPECS = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const llm_1 = require("./llm");
const style_engine_1 = require("./style-engine");
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const ai_image_gen_1 = require("./ai-image-gen");
const drizzle_orm_1 = require("drizzle-orm");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../utils/paths");
// ─── 路径工具（统一走 paths.dataDir：dev → packages/main/data，prod → userData/data） ───
// 注意：dataDir() 只 mkdir 父目录（避免对 'qianshan.db' 这类文件路径误建文件夹），
// 所以这里的 wrapper 必须显式 mkdir 叶子目录本身——所有调用点传入的都是目录名（bgm/videos/covers/...）
function ensureDataDir(...sub) {
    const p = (0, paths_1.dataDir)(...sub);
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
    return p;
}
// ─── 平台尺寸（旧字段，仅向后兼容 generateCover 单图调用） ───
const COVER_SIZES = {
    douyin: [1080, 1920],
    xiaohongshu: [1080, 1440],
    bilibili: [1280, 720],
    weixin: [900, 500],
    weibo: [1280, 720],
};
exports.PLATFORM_COVER_SPECS = {
    douyin: [
        { key: 'cover_vertical', label: '竖封面', ratio: '3:4', width: 900, height: 1200 },
        { key: 'cover_horizontal', label: '横封面', ratio: '4:3', width: 1200, height: 900 },
    ],
    xiaohongshu: [
        { key: 'cover_vertical', label: '封面', ratio: '3:4', width: 900, height: 1200 },
    ],
    bilibili: [
        { key: 'cover_horizontal', label: '封面', ratio: '16:9', width: 1280, height: 720 },
    ],
    kuaishou: [
        { key: 'cover_vertical', label: '封面', ratio: '3:4', width: 750, height: 1000 },
    ],
    // 视频号默认用首帧，无封面
    weixin: [],
    // 微博保留向后兼容（暂走 1:1 横封面）
    weibo: [
        { key: 'cover_horizontal', label: '封面', ratio: '16:9', width: 1280, height: 720 },
    ],
};
class VideoWorkshopService {
    // ═══════════════ AI 广告视频 ═══════════════
    async generateAdVideo(input, sse) {
        try {
            // 1. 创建记录
            const [record] = await db_1.db
                .insert(schema_1.adVideos)
                .values({
                productImagePath: input.productImagePath,
                creativeDesc: input.creativeDesc,
                duration: input.duration || 5,
                status: 'prompting',
                copywritingId: input.copywritingId ?? null,
            })
                .returning();
            // 2. LLM 扩写创意描述
            sse.sendProgress('AI 扩写创意', 10);
            const expanded = await llm_1.llm.completeWithScene('video_expand_prompt', '广告创意总监', style_engine_1.styleEngine.renderPrompt('video_expand_prompt', {
                product_name: path_1.default.basename(input.productImagePath || 'product'),
                creative_desc: input.creativeDesc,
            }));
            await db_1.db
                .update(schema_1.adVideos)
                .set({ expandedPrompt: expanded })
                .where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, record.id));
            // 3. 翻译为英文
            sse.sendProgress('翻译 Prompt', 25);
            const enPrompt = await llm_1.llm.completeWithScene('video_translate_en', 'Translator', style_engine_1.styleEngine.renderPrompt('video_translate_en', { text: expanded }));
            await db_1.db
                .update(schema_1.adVideos)
                .set({ enPrompt, status: 'generating' })
                .where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, record.id));
            // 4. 调用视频生成 API（Mock 模式：模拟任务流）
            sse.sendProgress('视频生成中', 35);
            if (config_1.USE_MOCK) {
                const taskId = `mock-task-${Date.now()}`;
                await db_1.db
                    .update(schema_1.adVideos)
                    .set({ klingTaskId: taskId })
                    .where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, record.id));
                // 模拟轮询进度
                for (let i = 0; i < 6; i++) {
                    await new Promise((r) => setTimeout(r, 400));
                    sse.sendProgress('AI 视频生成中', 40 + i * 8);
                }
                // 模拟生成成功：写入一个占位符文件（扩展名保持 .mp4，避免下游扩展名校验拒绝）
                sse.sendProgress('下载视频', 92);
                const videoDir = ensureDataDir('videos');
                const localPath = path_1.default.join(videoDir, `ad-${record.id}-${Date.now()}.mp4`);
                fs_1.default.writeFileSync(localPath, `# Mock video placeholder\n# record_id=${record.id}\n# en_prompt=${enPrompt}\n`);
                const videoUrl = `mock://video/${taskId}`;
                await db_1.db
                    .update(schema_1.adVideos)
                    .set({ videoUrl, videoLocalPath: localPath, status: 'done' })
                    .where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, record.id));
                sse.sendDone({ id: record.id, outputPath: localPath, mock: true });
                return;
            }
            // ─── 真实 Kling API ─── (保留完整实现，但 Mock 模式下不会走到这里)
            const jwt = require('jsonwebtoken');
            const { config } = require('../utils/config');
            const tokenPayload = {
                iss: config.kling.accessKey,
                exp: Math.floor(Date.now() / 1000) + 1800,
                nbf: Math.floor(Date.now() / 1000) - 5,
                iat: Math.floor(Date.now() / 1000),
            };
            const token = jwt.sign(tokenPayload, config.kling.secretKey, {
                algorithm: 'HS256',
                header: { alg: 'HS256', typ: 'JWT' },
            });
            const imageBuffer = fs_1.default.readFileSync(input.productImagePath);
            const imageBase64 = imageBuffer.toString('base64');
            const klingRes = await fetch('https://api.klingai.com/v1/videos/image2video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    model_name: 'kling-v1',
                    image: imageBase64,
                    prompt: enPrompt,
                    duration: String(input.duration || 5),
                    cfg_scale: 0.5,
                }),
            });
            const klingData = (await klingRes.json());
            const taskId = klingData.data.task_id;
            await db_1.db.update(schema_1.adVideos).set({ klingTaskId: taskId }).where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, record.id));
            let videoUrl = '';
            for (let i = 0; i < 120; i++) {
                await new Promise((r) => setTimeout(r, 5000));
                const statusRes = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${token}` } });
                const statusData = (await statusRes.json());
                const task = statusData.data;
                if (task.task_status === 'succeed') {
                    videoUrl = task.task_result?.videos?.[0]?.url || '';
                    break;
                }
                else if (task.task_status === 'failed') {
                    throw new Error(task.task_status_msg || 'Kling generation failed');
                }
                sse.sendProgress('AI 视频生成中', Math.min(50 + i, 85));
            }
            if (!videoUrl)
                throw new Error('Kling 任务超时');
            sse.sendProgress('下载视频', 92);
            const videoDir = ensureDataDir('videos');
            const localPath = path_1.default.join(videoDir, `ad-${record.id}-${Date.now()}.mp4`);
            const videoRes = await fetch(videoUrl);
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            fs_1.default.writeFileSync(localPath, videoBuffer);
            await db_1.db
                .update(schema_1.adVideos)
                .set({ videoUrl, videoLocalPath: localPath, status: 'done' })
                .where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, record.id));
            sse.sendDone({ id: record.id, videoPath: localPath });
        }
        catch (err) {
            logger_1.logger.error('Ad video error: ' + String(err));
            sse.sendError(String(err));
        }
    }
    async getAdVideo(id) {
        const [row] = await db_1.db.select().from(schema_1.adVideos).where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, id));
        return row;
    }
    async listAdVideos(page = 1, pageSize = 20) {
        const [items, totalRow] = await Promise.all([
            db_1.db
                .select()
                .from(schema_1.adVideos)
                .orderBy((0, drizzle_orm_1.desc)(schema_1.adVideos.id))
                .limit(pageSize)
                .offset((page - 1) * pageSize),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.adVideos),
        ]);
        return { items, page, pageSize, total: totalRow[0]?.n ?? 0 };
    }
    // ═══════════════ 封面生成 ═══════════════
    /**
     * 文件级别合成（不入库）：把背景图按 attention 智能裁切到目标尺寸，再叠加 SVG 文字层。
     *
     * 关键：背景缩放用 sharp.strategy.attention，主体不会被居中裁切丢掉；
     *       文字层是按目标 (w, h) 现场排版的，不会因尺寸变化而错位/被切掉。
     */
    async _composeCoverImage(args) {
        const { width: w, height: h, style } = args;
        if (config_1.USE_MOCK) {
            const placeholderContent = `# Mock cover\n# title=${args.title}\n# subtitle=${args.subtitle || ''}\n# style=${style}\n# ${w}x${h}\n`;
            fs_1.default.writeFileSync(args.outputPath, placeholderContent);
            return;
        }
        try {
            const sharp = require('sharp');
            let base;
            if (args.effectiveBgPath && fs_1.default.existsSync(args.effectiveBgPath)) {
                // attention 智能裁切：按图像显著性找主体，而不是默认居中切
                logger_1.logger.info(`[Cover] 背景缩放: ${w}x${h} via attention (sharp ver=${sharp.versions?.sharp || 'unknown'})`);
                base = await sharp(args.effectiveBgPath)
                    .resize(w, h, {
                    fit: 'cover',
                    position: sharp.strategy.attention,
                })
                    .toBuffer();
            }
            else {
                base = await sharp({
                    create: {
                        width: w,
                        height: h,
                        channels: 4,
                        background: { r: 26, g: 26, b: 46, alpha: 1 },
                    },
                })
                    .png()
                    .toBuffer();
            }
            // 文字层按目标尺寸现场排版（每个 spec 自己一份，不会被裁丢）
            const svgText = this.buildCoverSvg(w, h, style, args.title, args.subtitle);
            await sharp(base)
                .composite([{ input: Buffer.from(svgText), top: 0, left: 0 }])
                .png()
                .toFile(args.outputPath);
        }
        catch (e) {
            logger_1.logger.warn('[Cover] sharp failed, writing placeholder: ' + String(e));
            fs_1.default.writeFileSync(args.outputPath, `# Cover fallback\n${args.title}\n`);
        }
    }
    /**
     * 用 sharp.strategy.attention 从 master 智能裁切派生（按图像显著性自动找主体位置裁切，
     * 比 fit:cover 默认的居中裁切更不容易把主体切掉）。
     * 同比例时退化为纯 resize，无裁切损失。
     */
    async _deriveFromMaster(args) {
        if (config_1.USE_MOCK) {
            // mock：直接 copy master，避免依赖 sharp
            fs_1.default.copyFileSync(args.masterPath, args.outputPath);
            return;
        }
        try {
            const sharp = require('sharp');
            // 显式记录使用的策略，便于排查"attention 没生效"
            logger_1.logger.info(`[Cover] 派生裁切: ${args.width}x${args.height} via sharp.strategy.attention (sharp ver=${sharp.versions?.sharp || 'unknown'})`);
            const info = await sharp(args.masterPath)
                .resize(args.width, args.height, {
                fit: 'cover',
                position: sharp.strategy.attention,
            })
                .png()
                .toFile(args.outputPath);
            logger_1.logger.info(`[Cover] 派生完成: ${args.outputPath} 实际尺寸=${info.width}x${info.height} bytes=${info.size}`);
        }
        catch (e) {
            logger_1.logger.warn('[Cover] sharp attention crop failed, fallback to copy: ' + String(e));
            fs_1.default.copyFileSync(args.masterPath, args.outputPath);
        }
    }
    /**
     * 单图合成 + 入库的内部实现（旧 API 用）。
     */
    async _generateOneCoverImage(args) {
        const coverDir = ensureDataDir('covers');
        const outputPath = path_1.default.join(coverDir, `cover-${Date.now()}-${args.spec || 'single'}.png`);
        await this._composeCoverImage({
            title: args.title,
            subtitle: args.subtitle,
            style: args.style,
            width: args.width,
            height: args.height,
            effectiveBgPath: args.effectiveBgPath,
            outputPath,
        });
        const [row] = await db_1.db
            .insert(schema_1.covers)
            .values({
            title: args.title,
            subtitle: args.subtitle,
            templateId: args.templateId,
            backgroundPath: args.effectiveBgPath,
            outputPath,
            platform: args.platform,
            resolution: `${args.width}x${args.height}`,
            spec: args.spec || null,
            copywritingId: args.copywritingId ?? null,
        })
            .returning();
        return row;
    }
    /**
     * AI 生成或选用本地/原有背景图，返回最终背景图绝对路径（可能未生成 → undefined）。
     * 抽出来给批量生成复用——一次封面套图共用同一张 AI 背景，避免每张都花钱。
     *
     * visualStyleId（可选）：让封面 AI 背景跟着视觉风格预设走
     *   - 拼 fixedSuffix 到 prompt 末尾（"，胶片颗粒感" / "，1:24微缩模型质感" 等）
     *   - 用 visualStyle.negativePrompt 给 AI 文生图（不同风格抑制不同元素）
     *   - 不传 / 找不到 → 退化为 DEFAULT_VISUAL_STYLE（电影写实，跟老行为一致）
     */
    async _resolveBackground(args) {
        let effectiveBgPath = args.backgroundPath;
        let aiBgCost = 0;
        if (!effectiveBgPath && args.bgPromptCN?.trim()) {
            if (!(0, ai_image_gen_1.hasAnyImageProvider)()) {
                throw new Error('AI 生成背景需要配置 SiliconFlow 或 即梦 API，请先到"设置"配置');
            }
            try {
                // 加载视觉风格（不传走默认电影写实，向后兼容）
                const visualStyle = await style_engine_1.styleEngine.getVisualStyle(args.visualStyleId).catch(() => null);
                // 构图约束：保证 master 图人物完整，否则 attention crop 派生横版时会缺头/缺脚
                // 模型对中文「全身构图、留白」类提示效果稳定，比纯英文 cinematography 词要好
                const COMPOSITION_HINT = '，全身构图，人物头顶到脚完整呈现，头顶留有充足空间，不要切到任何身体部位';
                // 构图约束在前 + 风格招牌句在后；招牌句最后追加才能"钉死"画面调性
                const styleSuffix = visualStyle?.fixedSuffix || '';
                const finalPromptCN = args.bgPromptCN.trim() + COMPOSITION_HINT + styleSuffix;
                logger_1.logger.info(`[Cover] AI 生成背景: "${args.bgPromptCN.slice(0, 50)}..." ` +
                    `(visualStyle=${args.visualStyleId ?? '默认电影写实'}, 已附加构图约束 + 风格后缀)`);
                const provider = (0, ai_image_gen_1.pickAvailableImageProvider)();
                const aspect = args.height > args.width * 1.2
                    ? '9:16'
                    : args.width > args.height * 1.2
                        ? '16:9'
                        : '1:1';
                const bgDir = ensureDataDir('covers', 'bg');
                const bgResult = await (0, ai_image_gen_1.generateImage)({
                    promptCN: finalPromptCN,
                    promptEN: finalPromptCN,
                    aspect,
                    // 把视觉风格的"不要画什么"也带进去；不传走 ai-image-gen 的 DEFAULT_NEGATIVE
                    negativePrompt: visualStyle?.negativePrompt,
                }, bgDir, provider);
                effectiveBgPath = bgResult.localPath;
                aiBgCost = bgResult.costCny;
                logger_1.logger.info(`[Cover] AI 背景生成完成: ${bgResult.localPath} (¥${aiBgCost.toFixed(3)})`);
            }
            catch (err) {
                logger_1.logger.warn('[Cover] AI 背景失败，回退纯色: ' + String(err));
            }
        }
        return { effectiveBgPath, aiBgCost };
    }
    async generateCover(input) {
        const [w, h] = COVER_SIZES[input.platform] || [1280, 720];
        const style = input.style || 'centered';
        const { effectiveBgPath, aiBgCost } = await this._resolveBackground({
            backgroundPath: input.backgroundPath,
            bgPromptCN: input.bgPromptCN,
            width: w,
            height: h,
            visualStyleId: input.visualStyleId,
        });
        const row = await this._generateOneCoverImage({
            title: input.title,
            subtitle: input.subtitle,
            style,
            width: w,
            height: h,
            effectiveBgPath,
            platform: input.platform,
            templateId: input.templateId,
            copywritingId: input.copywritingId,
        });
        return { ...row, aiBgCost };
    }
    /**
     * 按平台规格批量生成封面套图（每规格独立合成，共享 1 张 AI 背景）。
     *
     * 关键设计：
     *   1. AI 背景只调用 1 次（按 3:4 比例生成，主体最容易完整呈现），所有规格共用
     *   2. 每个规格各自走一次 _composeCoverImage：
     *        bg → sharp.strategy.attention 缩放裁切到目标 (w, h) → 叠加按 (w, h) 现场排版的文字层
     *   3. 这样每张图的文字位置都是专为该尺寸排版的，不会出现"文字被裁掉"或"文字位置错位"
     *   4. 主体也不会被居中裁切误切掉（attention 找显著性，对人/物/建筑都有效）
     */
    async generateCoverSet(input) {
        const specs = exports.PLATFORM_COVER_SPECS[input.platform];
        if (!specs || specs.length === 0) {
            throw new Error(`平台 ${input.platform} 无封面规格（视频号默认用首帧，无需上传封面）`);
        }
        const style = input.style || 'centered';
        // AI 背景按 3:4 生成（最通用的比例，attention 裁切到任何目标都不会缺主体）
        const { effectiveBgPath, aiBgCost } = await this._resolveBackground({
            backgroundPath: input.backgroundPath,
            bgPromptCN: input.bgPromptCN,
            width: 900,
            height: 1200,
            visualStyleId: input.visualStyleId,
        });
        const items = [];
        for (const spec of specs) {
            const row = await this._generateOneCoverImage({
                title: input.title,
                subtitle: input.subtitle,
                style,
                width: spec.width,
                height: spec.height,
                effectiveBgPath,
                platform: input.platform,
                templateId: input.templateId,
                copywritingId: input.copywritingId,
                spec: spec.key,
            });
            items.push(row);
            // 时间戳错开 50ms，避免文件名同名
            await new Promise((r) => setTimeout(r, 50));
        }
        return { items, aiBgCost };
    }
    /**
     * 根据样式预设构建 SVG 叠加层
     */
    buildCoverSvg(w, h, style, title, subtitle) {
        const escape = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fontFamily = 'PingFang SC, Microsoft YaHei, sans-serif';
        const subRaw = subtitle || '';
        const sEsc = escape(subRaw);
        // ── 字符宽度估算（CJK 全角 ≈ font-size，西文/数字 ≈ 0.58×，标点 ≈ 0.4×）
        const widthOf = (ch, fs) => {
            if (/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/.test(ch))
                return fs;
            if (/[a-zA-Z0-9]/.test(ch))
                return fs * 0.58;
            return fs * 0.4;
        };
        // 按可用宽度贪心折行（不依赖语言断词，CJK 全字符级折行）
        const wrapToWidth = (text, usableWidth, fs) => {
            const out = [];
            let cur = '';
            let curW = 0;
            for (const ch of text) {
                const cw = widthOf(ch, fs);
                if (curW + cw > usableWidth && cur.length > 0) {
                    out.push(cur);
                    cur = ch;
                    curW = cw;
                }
                else {
                    cur += ch;
                    curW += cw;
                }
            }
            if (cur)
                out.push(cur);
            return out;
        };
        /**
         * 把标题折行到 usableWidth 内。超过 maxLines 行就缩字号（每次 7%，最多缩到 70%）；
         * 缩到极限还超出 → 截断最后一行并加省略号。
         * 返回 { lines: 折行后的纯文本数组, size: 最终字号, lineH: 行高 }
         */
        const wrapAndFit = (rawTitle, usableWidth, baseSize, maxLines = 3) => {
            let size = baseSize;
            let lines = wrapToWidth(rawTitle, usableWidth, size);
            const minSize = Math.max(12, Math.round(baseSize * 0.7));
            while (lines.length > maxLines && size > minSize) {
                size = Math.max(minSize, Math.round(size * 0.93));
                lines = wrapToWidth(rawTitle, usableWidth, size);
            }
            if (lines.length > maxLines) {
                lines = lines.slice(0, maxLines);
                const last = lines[maxLines - 1];
                lines[maxLines - 1] = last.length > 1 ? last.slice(0, -1) + '…' : '…';
            }
            return { lines, size, lineH: Math.round(size * 1.25) };
        };
        /**
         * 多行文本：用绝对 y 的 tspan 渲染（不依赖 dy + dominant-baseline，
         * sharp 用的 librsvg/resvg 对 dominant-baseline + dy 的组合支持有差异）
         */
        const renderMultilineText = (params) => {
            const { lines, x, firstBaselineY, lineH, size, fill, anchor, weight = 'normal', letterSpacing, extraAttrs = '' } = params;
            const tspans = lines
                .map((ln, i) => `<tspan x="${x}" y="${firstBaselineY + i * lineH}">${escape(ln)}</tspan>`)
                .join('');
            const ls = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
            return `<text fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="${fontFamily}" text-anchor="${anchor}"${ls} ${extraAttrs}>${tspans}</text>`;
        };
        switch (style) {
            // ① 居中 · 半透明遮罩 + 白字粗体（默认，稳）
            case 'centered': {
                const baseTitleSize = Math.round(w * 0.07);
                const subSize = Math.round(w * 0.04);
                const padX = Math.round(w * 0.06);
                const usable = w - padX * 2;
                const fit = wrapAndFit(title, usable, baseTitleSize);
                // 多行整体在画面中部居中（有副标题时上抬一点）
                const centerY = subRaw ? h * 0.45 : h * 0.5;
                const blockH = (fit.lines.length - 1) * fit.lineH + fit.size;
                // 第一行 baseline = 块顶 + size（baseline 在文字底部偏上）
                const firstBaselineY = Math.round(centerY - blockH / 2 + fit.size * 0.85);
                const subY = subRaw
                    ? firstBaselineY + (fit.lines.length - 1) * fit.lineH + fit.size + 24
                    : 0;
                return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.42)" />
  ${renderMultilineText({
                    lines: fit.lines,
                    x: '50%',
                    firstBaselineY,
                    lineH: fit.lineH,
                    size: fit.size,
                    fill: 'white',
                    anchor: 'middle',
                    weight: 900,
                    extraAttrs: 'stroke="black" stroke-width="3" paint-order="stroke"',
                })}
  ${subRaw ? `<text x="50%" y="${subY}" text-anchor="middle"
        fill="#ffd566" font-size="${subSize}" font-weight="600" font-family="${fontFamily}">${sEsc}</text>` : ''}
</svg>`;
            }
            // ② 左下角 · 带左侧竖线装饰（干净高级感）
            case 'bottom-left': {
                const baseTitleSize = Math.round(w * 0.08);
                const subSize = Math.round(w * 0.038);
                const paddingL = Math.round(w * 0.08);
                const paddingR = Math.round(w * 0.08);
                const paddingB = Math.round(h * 0.1);
                const usable = w - paddingL - paddingR;
                const fit = wrapAndFit(title, usable, baseTitleSize);
                // 标题块底锚点：原本"底部 paddingB" — 多行时整块向上叠
                const subOffset = subRaw ? subSize + 24 : 0;
                const lastBaselineY = h - paddingB - subOffset;
                const firstBaselineY = lastBaselineY - (fit.lines.length - 1) * fit.lineH;
                // 装饰竖线：包住整块标题
                const barTop = firstBaselineY - Math.round(fit.size * 0.85);
                const barH = (fit.lines.length - 1) * fit.lineH + fit.size + 6;
                const barX = paddingL - Math.round(w * 0.02);
                const subY = subRaw ? h - paddingB + 10 : 0;
                return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0%" y1="60%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.75)" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#fade)" />
  <rect x="${barX}" y="${barTop}" width="6" height="${barH}" fill="#ffd566" />
  ${renderMultilineText({
                    lines: fit.lines,
                    x: paddingL,
                    firstBaselineY,
                    lineH: fit.lineH,
                    size: fit.size,
                    fill: 'white',
                    anchor: 'start',
                    weight: 900,
                })}
  ${subRaw ? `<text x="${paddingL}" y="${subY}" text-anchor="start"
        fill="#ccc" font-size="${subSize}" font-family="${fontFamily}">${sEsc}</text>` : ''}
</svg>`;
            }
            // ③ 顶部黑色色块 + 白字（新闻资讯/清单 style）
            case 'top-block': {
                const baseTitleSize = Math.round(w * 0.075);
                const subSize = Math.round(w * 0.04);
                const paddingL = Math.round(w * 0.06);
                const paddingR = Math.round(w * 0.06);
                const usable = w - paddingL - paddingR;
                const fit = wrapAndFit(title, usable, baseTitleSize);
                // 黑色色块高度跟随标题行数动态扩展
                const titleBlockH = (fit.lines.length - 1) * fit.lineH + fit.size;
                const subBlockH = subRaw ? subSize + 20 : 0;
                const innerPadV = Math.round(h * 0.04);
                const blockH = titleBlockH + subBlockH + innerPadV * 2 + 10;
                // 标题块在色块内垂直居中（如果没有副标题）；有副标题时整体上移
                const titleAreaTop = innerPadV;
                const firstBaselineY = titleAreaTop + Math.round(fit.size * 0.9);
                const subY = subRaw
                    ? firstBaselineY + (fit.lines.length - 1) * fit.lineH + fit.size + 14
                    : 0;
                return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w}" height="${blockH}" fill="rgba(0,0,0,0.88)" />
  ${renderMultilineText({
                    lines: fit.lines,
                    x: paddingL,
                    firstBaselineY,
                    lineH: fit.lineH,
                    size: fit.size,
                    fill: 'white',
                    anchor: 'start',
                    weight: 900,
                })}
  ${subRaw ? `<text x="${paddingL}" y="${subY}" text-anchor="start"
        fill="#ffd566" font-size="${subSize}" font-family="${fontFamily}">${sEsc}</text>` : ''}
</svg>`;
            }
            // ④ 底部渐变遮罩 · 大字标题（电影感）
            case 'gradient': {
                const baseTitleSize = Math.round(w * 0.095);
                const subSize = Math.round(w * 0.042);
                const paddingX = Math.round(w * 0.06);
                const paddingB = Math.round(h * 0.08);
                const usable = w - paddingX * 2;
                const fit = wrapAndFit(title, usable, baseTitleSize);
                const subOffset = subRaw ? subSize + 24 : 0;
                const lastBaselineY = h - paddingB - subOffset;
                const firstBaselineY = lastBaselineY - (fit.lines.length - 1) * fit.lineH;
                const subY = subRaw ? h - paddingB + 10 : 0;
                return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cine" x1="0%" y1="40%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="60%" stop-color="rgba(0,0,0,0.55)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.95)" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#cine)" />
  ${renderMultilineText({
                    lines: fit.lines,
                    x: '50%',
                    firstBaselineY,
                    lineH: fit.lineH,
                    size: fit.size,
                    fill: 'white',
                    anchor: 'middle',
                    weight: 900,
                    letterSpacing: 2,
                })}
  ${subRaw ? `<text x="50%" y="${subY}" text-anchor="middle"
        fill="#ffd566" font-size="${subSize}" font-family="${fontFamily}">${sEsc}</text>` : ''}
</svg>`;
            }
        }
    }
    /** 主线 A：按 copywritingId 列出所有衍生视频/封面 */
    async listByCopywritingId(copywritingId) {
        const [ad, slides, cvs] = await Promise.all([
            db_1.db.select().from(schema_1.adVideos).where((0, drizzle_orm_1.eq)(schema_1.adVideos.copywritingId, copywritingId)).orderBy((0, drizzle_orm_1.desc)(schema_1.adVideos.id)),
            db_1.db.select().from(schema_1.slideshowVideos).where((0, drizzle_orm_1.eq)(schema_1.slideshowVideos.copywritingId, copywritingId)).orderBy((0, drizzle_orm_1.desc)(schema_1.slideshowVideos.id)),
            db_1.db.select().from(schema_1.covers).where((0, drizzle_orm_1.eq)(schema_1.covers.copywritingId, copywritingId)).orderBy((0, drizzle_orm_1.desc)(schema_1.covers.id)),
        ]);
        return {
            adVideos: ad,
            // 字段名跟随产品路线改为 oneClickVideos（底层表仍是 slideshow_videos）
            oneClickVideos: slides.map((r) => ({ ...r, images: safeParseImages(r.images) })),
            covers: cvs,
        };
    }
    async listCovers() {
        return db_1.db.select().from(schema_1.covers).orderBy((0, drizzle_orm_1.desc)(schema_1.covers.id));
    }
    async listCoverTemplates() {
        return db_1.db.select().from(schema_1.coverTemplates);
    }
    // ─── 删除 ───
    async removeAdVideo(id) {
        await db_1.db.delete(schema_1.adVideos).where((0, drizzle_orm_1.eq)(schema_1.adVideos.id, id));
        return { removed: true, id };
    }
    async removeAdVideoMany(ids) {
        let n = 0;
        for (const id of ids) {
            try {
                await this.removeAdVideo(id);
                n++;
            }
            catch (err) {
                logger_1.logger.warn(`[Video] remove ad #${id} failed: ${err}`);
            }
        }
        return { removed: n };
    }
    async removeCover(id) {
        await db_1.db.delete(schema_1.covers).where((0, drizzle_orm_1.eq)(schema_1.covers.id, id));
        return { removed: true, id };
    }
    async removeCoverMany(ids) {
        let n = 0;
        for (const id of ids) {
            try {
                await this.removeCover(id);
                n++;
            }
            catch (err) {
                logger_1.logger.warn(`[Video] remove cover #${id} failed: ${err}`);
            }
        }
        return { removed: n };
    }
    // ═══════════════ 背景音乐库 ═══════════════
    async listBgm() {
        const rows = await db_1.db.select().from(schema_1.bgmLibrary);
        // 补充曲目的"下载状态"信息：isBuiltin = 2 表示 OSS 已注册但未下载
        // filePath 为 URL（http://...）表示待下载
        return rows.map((r) => ({
            ...r,
            isLocal: !!r.filePath && !/^https?:\/\//.test(r.filePath),
            isOssCatalog: !!r.filePath && /^https?:\/\//.test(r.filePath),
        }));
    }
    /** 扫描本地文件夹：递归把所有 mp3/wav/m4a/ogg/aac 注册到 BGM 库
     *
     * 支持嵌套目录（剪映/CapCut 的 audio cache 通常按 hash 分多层子目录）。
     * 默认最大深度 5，避免误选根目录后扫穿整个磁盘。
     */
    async scanBgmFolder(folderPath, mood, maxDepth = 5) {
        if (!fs_1.default.existsSync(folderPath))
            throw new Error(`文件夹不存在：${folderPath}`);
        const stat = fs_1.default.statSync(folderPath);
        if (!stat.isDirectory())
            throw new Error(`不是文件夹：${folderPath}`);
        const AUDIO_RE = /\.(mp3|wav|m4a|ogg|aac|flac)$/i;
        const collected = [];
        // 跳过常见的无意义大目录，防止用户不小心选了 C:\
        const SKIP_DIRS = new Set([
            'node_modules',
            '.git',
            '.svn',
            '$RECYCLE.BIN',
            'System Volume Information',
            'Windows',
            'Program Files',
            'Program Files (x86)',
        ]);
        const walk = (dir, depth) => {
            if (depth > maxDepth)
                return;
            let entries;
            try {
                entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return; // 权限不足等直接跳过
            }
            for (const e of entries) {
                if (e.name.startsWith('.') || SKIP_DIRS.has(e.name))
                    continue;
                const full = path_1.default.join(dir, e.name);
                if (e.isDirectory()) {
                    walk(full, depth + 1);
                }
                else if (e.isFile() && AUDIO_RE.test(e.name)) {
                    collected.push(full);
                }
                // 单次扫描兜底上限：50000 个音频，防止极端情况卡死
                if (collected.length >= 50000)
                    return;
            }
        };
        walk(folderPath, 0);
        const existing = await db_1.db.select().from(schema_1.bgmLibrary);
        const existingPaths = new Set(existing.map((b) => b.filePath));
        const added = [];
        for (const full of collected) {
            if (existingPaths.has(full))
                continue;
            const name = path_1.default.basename(full, path_1.default.extname(full));
            const [row] = await db_1.db
                .insert(schema_1.bgmLibrary)
                .values({
                name,
                filePath: full,
                duration: 0, // 运行时读
                mood: mood || 'neutral',
                isBuiltin: 0,
            })
                .returning();
            added.push(row);
        }
        return { scanned: collected.length, added: added.length, tracks: added };
    }
    /** 注册单个音频文件到 BGM 库 */
    async addBgmFile(input) {
        if (!fs_1.default.existsSync(input.audioPath))
            throw new Error(`文件不存在：${input.audioPath}`);
        const existing = await db_1.db
            .select()
            .from(schema_1.bgmLibrary)
            .where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.filePath, input.audioPath));
        if (existing.length > 0)
            return existing[0]; // 已存在，幂等
        const name = input.name?.trim() || path_1.default.basename(input.audioPath, path_1.default.extname(input.audioPath));
        const [row] = await db_1.db
            .insert(schema_1.bgmLibrary)
            .values({
            name,
            filePath: input.audioPath,
            duration: 0,
            mood: input.mood || 'neutral',
            isBuiltin: 0,
        })
            .returning();
        return row;
    }
    /** 从 OSS manifest.json 同步曲库目录（元数据注册，音频不下载） */
    async syncOssCatalog(manifestUrl) {
        const res = await fetch(manifestUrl);
        if (!res.ok)
            throw new Error(`拉取 manifest 失败：HTTP ${res.status}`);
        const manifest = (await res.json());
        const tracks = Array.isArray(manifest?.tracks) ? manifest.tracks : [];
        if (tracks.length === 0)
            throw new Error('manifest.json 里没有曲目（tracks 字段为空）');
        const existing = await db_1.db.select().from(schema_1.bgmLibrary);
        // 通过 audioUrl 索引（OSS 曲目的 filePath 暂存 audioUrl，下载后变成本地路径，
        // 所以 OSS 同步也要靠 name 兜底匹配，给已下载的曲目回填 coverUrl）
        const existingByUrl = new Map(existing.filter((b) => /^https?:\/\//.test(b.filePath)).map((b) => [b.filePath, b]));
        const existingByName = new Map(existing.map((b) => [b.name, b]));
        const added = [];
        let updated = 0;
        for (const t of tracks) {
            const audioUrl = String(t.audioUrl || '').trim();
            if (!audioUrl || !/^https?:\/\//.test(audioUrl))
                continue;
            const coverUrl = String(t.coverUrl || '').trim() || null;
            const trackName = String(t.title || t.id || '未命名').slice(0, 100);
            // 已存在：按需回填 coverUrl
            const matched = existingByUrl.get(audioUrl) || existingByName.get(trackName);
            if (matched) {
                if (coverUrl && matched.coverUrl !== coverUrl) {
                    await db_1.db
                        .update(schema_1.bgmLibrary)
                        .set({ coverUrl })
                        .where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, matched.id));
                    updated++;
                }
                continue;
            }
            // 新增
            const [row] = await db_1.db
                .insert(schema_1.bgmLibrary)
                .values({
                name: trackName,
                filePath: audioUrl, // 先存 URL，下载后会改为本地路径
                duration: Number(t.duration) || 0,
                mood: String(t.mood || 'neutral').slice(0, 32),
                bpm: Number(t.bpm) || null,
                isBuiltin: 2, // 2 = OSS 目录条目
                coverUrl,
            })
                .returning();
            added.push(row);
        }
        return {
            totalInManifest: tracks.length,
            added: added.length,
            updated,
            tracks: added,
        };
    }
    /** 下载 OSS 曲目到本地 */
    async downloadOssTrack(id) {
        const [row] = await db_1.db.select().from(schema_1.bgmLibrary).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, id));
        if (!row)
            throw new Error(`BGM #${id} 不存在`);
        if (!/^https?:\/\//.test(row.filePath))
            return row; // 已是本地
        const bgmDir = ensureDataDir('bgm');
        const url = row.filePath;
        const ext = (url.match(/\.(mp3|wav|m4a|ogg|aac)(\?|$)/i)?.[1] || 'mp3').toLowerCase();
        const safeName = row.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
        const localPath = path_1.default.join(bgmDir, `${safeName}-${id}.${ext}`);
        logger_1.logger.info(`[BGM] 下载 OSS: ${url} → ${localPath}`);
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`下载失败：HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs_1.default.writeFileSync(localPath, buf);
        // 更新 DB：filePath 改为本地路径
        await db_1.db.update(schema_1.bgmLibrary).set({ filePath: localPath }).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, id));
        return { ...row, filePath: localPath };
    }
    async removeBgm(id) {
        const [row] = await db_1.db.select().from(schema_1.bgmLibrary).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, id));
        if (!row)
            return { ok: false };
        // 如果是本地文件且不是用户原本地存（我们下载下来的 data/bgm/*），删文件
        const isInDataBgm = row.filePath.includes('data/bgm') || row.filePath.includes('data\\bgm');
        if (isInDataBgm && fs_1.default.existsSync(row.filePath)) {
            try {
                fs_1.default.unlinkSync(row.filePath);
            }
            catch {
                /* ignore */
            }
        }
        await db_1.db.delete(schema_1.bgmLibrary).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, id));
        return { ok: true };
    }
    async updateBgm(input) {
        const updates = {};
        if (input.mood)
            updates.mood = input.mood;
        if (input.name)
            updates.name = input.name;
        if (Object.keys(updates).length === 0)
            return { ok: false };
        await db_1.db.update(schema_1.bgmLibrary).set(updates).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, input.id));
        return { ok: true };
    }
    /**
     * 初始化内置资源：
     * - 清理掉老版本 seed 的 "(builtin) xxx.mp3" 假路径 BGM（真跑 ffmpeg 会失败）
     * - 扫描 assets/bgm/ 下真实存在的音频文件做 seed
     * - 封面模板仍 seed（layoutConfig 是 JSON，不涉及磁盘）
     */
    async seedBuiltinAssets() {
        // 1. 清理假路径 BGM（isBuiltin=1 且 filePath 以 "(builtin)" 开头的全部删掉）
        try {
            await db_1.db.delete(schema_1.bgmLibrary).where((0, drizzle_orm_1.like)(schema_1.bgmLibrary.filePath, '(builtin)%'));
        }
        catch (e) {
            logger_1.logger.warn('[Video] cleanup legacy bgm failed: ' + String(e));
        }
        // 2. 从 assets/bgm/ 扫描真实文件 seed
        // dev → packages/main/assets/bgm；prod → resources/assets/bgm（extraResources）
        const bgmAssetsDir = (0, paths_1.assetsDir)('bgm');
        if (fs_1.default.existsSync(bgmAssetsDir)) {
            const files = fs_1.default
                .readdirSync(bgmAssetsDir)
                .filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));
            const existing = await db_1.db.select().from(schema_1.bgmLibrary);
            const existingPaths = new Set(existing.map((b) => b.filePath));
            for (const f of files) {
                const full = path_1.default.join(bgmAssetsDir, f);
                if (existingPaths.has(full))
                    continue;
                await db_1.db.insert(schema_1.bgmLibrary).values({
                    name: path_1.default.basename(f, path_1.default.extname(f)),
                    filePath: full,
                    duration: 0, // 运行时动态读，避免 seed 时依赖 ffprobe
                    mood: 'neutral',
                    isBuiltin: 1,
                });
            }
        }
        // 3. 封面模板
        const ctExisting = await db_1.db.select().from(schema_1.coverTemplates).limit(1);
        if (ctExisting.length === 0) {
            const samples = [
                {
                    name: '大字中心标题',
                    category: 'tech',
                    layoutConfig: JSON.stringify({ layout: 'big-text-center' }),
                },
                {
                    name: '左下角标题',
                    category: 'vlog',
                    layoutConfig: JSON.stringify({ layout: 'bottom-left' }),
                },
            ];
            for (const s of samples) {
                await db_1.db.insert(schema_1.coverTemplates).values({ ...s, isBuiltin: 1 });
            }
        }
    }
}
exports.VideoWorkshopService = VideoWorkshopService;
/** 容错解析 slideshowVideos.images 字段（存的是 JSON 字符串） */
function safeParseImages(raw) {
    if (!raw)
        return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    }
    catch {
        return [];
    }
}
exports.videoWorkshop = new VideoWorkshopService();
//# sourceMappingURL=video-workshop.js.map