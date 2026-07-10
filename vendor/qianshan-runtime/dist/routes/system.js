"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 系统层接口：
 * - 外部 API 凭据（Pixabay / Pexels）CRUD
 * - 环境体检：ffmpeg/ffprobe/tts/pixabay/pexels/llm 逐项状态
 * - 数据管理：一键清数据（测试/缓存/日志）、查看磁盘占用
 */
const express_1 = require("express");
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const external_credentials_1 = require("../services/external-credentials");
const happyhorse_prefs_1 = require("../services/happyhorse-prefs");
const binaries_1 = require("../utils/binaries");
const tts_edge_1 = require("../services/tts-edge");
const llm_1 = require("../services/llm");
const logger_1 = require("../utils/logger");
const paths_1 = require("../utils/paths");
const validate_1 = require("../utils/validate");
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../db/schema");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
// ─── 外部凭据 ───
const SaveCredSchema = zod_1.z.object({
    // 与 external-credentials.ts 的 SUPPORTED_PROVIDERS 对齐
    provider: zod_1.z.enum(['pexels', 'unsplash', 'siliconflow', 'happyhorse']),
    apiKey: zod_1.z.string().min(1).max(500),
    baseUrl: zod_1.z.string().url().max(500).optional(),
});
router.get('/credentials', async (_req, res) => {
    try {
        const list = await external_credentials_1.externalCreds.listStatus();
        res.json(ok(list));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/credentials', (0, validate_1.validateBody)(SaveCredSchema), async (req, res) => {
    try {
        await external_credentials_1.externalCreds.save(req.body.provider, req.body.apiKey, req.body.baseUrl);
        res.json(ok({ ok: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/credentials/:provider', async (req, res) => {
    try {
        await external_credentials_1.externalCreds.remove(req.params.provider);
        res.json(ok({ ok: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/credentials/:provider/test', async (req, res) => {
    try {
        const r = await external_credentials_1.externalCreds.test(req.params.provider);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 百炼功能开关（TTS / 视频 各自独立，与 Key 解耦）───
const HappyHorsePrefsSchema = zod_1.z.object({
    ttsEnabled: zod_1.z.boolean().optional(),
    videoEnabled: zod_1.z.boolean().optional(),
    videoResolution: zod_1.z.enum(['720P', '1080P']).optional(),
});
router.get('/happyhorse/prefs', (_req, res) => {
    try {
        res.json(ok(happyhorse_prefs_1.happyHorsePrefs.get()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.put('/happyhorse/prefs', (0, validate_1.validateBody)(HappyHorsePrefsSchema), (req, res) => {
    try {
        const next = happyhorse_prefs_1.happyHorsePrefs.set(req.body);
        res.json(ok(next));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 环境体检 ───
router.get('/env-check', async (_req, res) => {
    try {
        const ffmpeg = (0, binaries_1.checkBinary)('ffmpeg');
        const ffprobe = (0, binaries_1.checkBinary)('ffprobe');
        const creds = await external_credentials_1.externalCreds.listStatus();
        const pexels = creds.find((c) => c.provider === 'pexels');
        const unsplash = creds.find((c) => c.provider === 'unsplash');
        // LLM：看 runtime 里有几个 provider 凭据
        const llmProviders = llm_1.llm.listRegisteredProviders();
        const llmOk = llm_1.llm.hasAnyRealCredential();
        res.json(ok({
            ffmpeg: {
                ok: ffmpeg.ok,
                version: ffmpeg.version,
                path: ffmpeg.path,
                error: ffmpeg.error,
            },
            ffprobe: {
                ok: ffprobe.ok,
                version: ffprobe.version,
                path: ffprobe.path,
                error: ffprobe.error,
            },
            tts: {
                ok: null, // 同步返回 null，前端点"实际测试"按钮才真调
                hint: '点"测试 TTS"按钮真实拨测（会消耗 1-2s）',
            },
            pexels: {
                configured: pexels?.configured ?? false,
                label: pexels?.label,
                signupUrl: pexels?.signupUrl,
                docUrl: pexels?.docUrl,
            },
            unsplash: {
                configured: unsplash?.configured ?? false,
                label: unsplash?.label,
                signupUrl: unsplash?.signupUrl,
                docUrl: unsplash?.docUrl,
            },
            llm: {
                configured: llmOk,
                providersCount: llmProviders.length,
                providers: llmProviders,
            },
        }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** TTS 实际拨测 —— 比较慢，单独接口 */
router.post('/env-check/tts', async (_req, res) => {
    try {
        const r = await (0, tts_edge_1.checkTtsHealth)();
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 数据管理（一键清）───
/** 查看各类数据的"占用情况"，前端显示"你有 N 条 xxx，占 X MB" */
router.get('/data-usage', async (_req, res) => {
    try {
        const [copyCount, adCount, oneClickCount, coverCount, topicCount, taskCount, metricsCount, logsCount,] = await Promise.all([
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.copywritings),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.adVideos),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.slideshowVideos),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.covers),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.topics),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.publishTasks),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.contentMetrics),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.operationLogs),
        ]);
        // 磁盘：data/videos, data/covers, data/one-click-cache（dev → packages/main/data，prod → userData/data）
        const dirSize = (dir) => {
            if (!fs_1.default.existsSync(dir))
                return 0;
            let total = 0;
            try {
                for (const entry of fs_1.default.readdirSync(dir, { withFileTypes: true })) {
                    const full = path_1.default.join(dir, entry.name);
                    if (entry.isDirectory())
                        total += dirSize(full);
                    else {
                        try {
                            total += fs_1.default.statSync(full).size;
                        }
                        catch { }
                    }
                }
            }
            catch { }
            return total;
        };
        const videosSize = dirSize((0, paths_1.dataDir)('videos'));
        const coversSize = dirSize((0, paths_1.dataDir)('covers'));
        const cacheSize = dirSize((0, paths_1.dataDir)('one-click-cache'));
        const draftsSize = dirSize((0, paths_1.dataDir)('drafts'));
        const logsDiskSize = dirSize((0, paths_1.logsDir)());
        res.json(ok({
            counts: {
                copywritings: copyCount[0]?.n ?? 0,
                adVideos: adCount[0]?.n ?? 0,
                oneClickVideos: oneClickCount[0]?.n ?? 0,
                covers: coverCount[0]?.n ?? 0,
                topics: topicCount[0]?.n ?? 0,
                publishTasks: taskCount[0]?.n ?? 0,
                metrics: metricsCount[0]?.n ?? 0,
                logs: logsCount[0]?.n ?? 0,
            },
            diskBytes: {
                videos: videosSize,
                covers: coversSize,
                cache: cacheSize,
                drafts: draftsSize,
                logs: logsDiskSize,
                total: videosSize + coversSize + cacheSize + draftsSize + logsDiskSize,
            },
        }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/**
 * 清理指定类别的数据。
 * 可选 scope:
 *   - copywritings  文案 + 标题候选 + 平台适配
 *   - ad-videos     AI 广告视频
 *   - one-click     一键成片作品
 *   - covers        封面
 *   - topics        选题雷达历史 + AI 分析
 *   - publish-tasks 发布任务 + 数据指标
 *   - metrics       只清数据指标
 *   - logs          操作日志
 *   - cache         磁盘缓存 data/one-click-cache/
 *   - all-test      所有以上（清空测试数据，保留账号 + 凭据 + 计划）
 */
const ClearScopeSchema = zod_1.z.object({
    scope: zod_1.z.enum([
        'copywritings',
        'ad-videos',
        'one-click',
        'covers',
        'topics',
        'publish-tasks',
        'metrics',
        'logs',
        'cache',
        'all-test',
    ]),
});
router.post('/data-clear', (0, validate_1.validateBody)(ClearScopeSchema), async (req, res) => {
    const scope = req.body.scope;
    try {
        const result = {};
        const clearTable = async (name, fn) => {
            try {
                const r = await fn();
                result[name] = r?.changes ?? -1;
            }
            catch (e) {
                logger_1.logger.warn(`[DataClear] ${name} failed: ${e}`);
            }
        };
        const clearCopy = async () => {
            await db_1.db.delete(schema_1.titleCandidates);
            await db_1.db.delete(schema_1.copywritingAdaptations);
            await db_1.db.delete(schema_1.copywritings);
            result.copywritings = 1;
        };
        const clearAd = async () => { await db_1.db.delete(schema_1.adVideos); result.adVideos = 1; };
        const clearOneClick = async () => { await db_1.db.delete(schema_1.slideshowVideos); result.oneClickVideos = 1; };
        const clearCovers = async () => { await db_1.db.delete(schema_1.covers); result.covers = 1; };
        const clearTopics = async () => {
            await db_1.db.delete(schema_1.topicAnalyses);
            await db_1.db.delete(schema_1.topics);
            result.topics = 1;
        };
        const clearTasks = async () => {
            await db_1.db.delete(schema_1.contentMetrics);
            await db_1.db.delete(schema_1.publishTasks);
            result.publishTasks = 1;
        };
        const clearMetrics = async () => { await db_1.db.delete(schema_1.contentMetrics); result.metrics = 1; };
        const clearLogs = async () => { await db_1.db.delete(schema_1.operationLogs); result.logs = 1; };
        const clearCache = () => {
            const cacheDir = (0, paths_1.dataDir)('one-click-cache');
            if (fs_1.default.existsSync(cacheDir)) {
                fs_1.default.rmSync(cacheDir, { recursive: true, force: true });
                fs_1.default.mkdirSync(cacheDir, { recursive: true });
                result.cache = 1;
            }
        };
        switch (scope) {
            case 'copywritings':
                await clearCopy();
                break;
            case 'ad-videos':
                await clearAd();
                break;
            case 'one-click':
                await clearOneClick();
                break;
            case 'covers':
                await clearCovers();
                break;
            case 'topics':
                await clearTopics();
                break;
            case 'publish-tasks':
                await clearTasks();
                break;
            case 'metrics':
                await clearMetrics();
                break;
            case 'logs':
                await clearLogs();
                break;
            case 'cache':
                clearCache();
                break;
            case 'all-test':
                await clearCopy();
                await clearAd();
                await clearOneClick();
                await clearCovers();
                await clearTopics();
                await clearTasks();
                await clearLogs();
                clearCache();
                break;
        }
        res.json(ok({ scope, result }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=system.js.map