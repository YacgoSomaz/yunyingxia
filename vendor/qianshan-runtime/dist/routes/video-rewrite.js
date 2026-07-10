"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 视频洗稿路由（3 步独立）
 *   POST   /api/video-rewrite              创建任务
 *   GET    /api/video-rewrite              列表
 *   GET    /api/video-rewrite/:id          详情
 *   DELETE /api/video-rewrite/:id          删除
 *   POST   /api/video-rewrite/:id/download SSE（如果是 url 模式）
 *   POST   /api/video-rewrite/:id/asr      SSE
 *   POST   /api/video-rewrite/:id/rewrite  SSE
 *   POST   /api/video-rewrite/:id/promote  升级为 copywriting
 *   POST   /api/video-rewrite/probe        URL 探活（取标题/时长/封面）
 */
const express_1 = require("express");
const zod_1 = require("zod");
const video_rewrite_1 = require("../services/video-rewrite");
const video_downloader_1 = require("../services/video-downloader");
const sse_manager_1 = require("../services/sse-manager");
const validate_1 = require("../utils/validate");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
const CreateSchema = zod_1.z.object({
    sourceType: zod_1.z.enum(['url', 'local']),
    sourceUrl: zod_1.z.string().url().max(2000).optional(),
    sourcePath: zod_1.z.string().max(1000).optional(),
    stylePresetId: zod_1.z.number().int().positive().optional(),
    targetPlatform: zod_1.z.string().max(32).optional(),
});
const ProbeSchema = zod_1.z.object({
    url: zod_1.z.string().url().max(2000),
});
// ─── 列表 / 详情 / 删除 ───
router.get('/', async (_req, res) => {
    try {
        res.json(ok(await video_rewrite_1.videoRewrite.list()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/:id', async (req, res) => {
    try {
        const row = await video_rewrite_1.videoRewrite.get(Number(req.params.id));
        if (!row)
            return res.status(404).json(fail('not found'));
        res.json(ok(row));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/:id', async (req, res) => {
    try {
        res.json(ok(await video_rewrite_1.videoRewrite.remove(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 创建 ───
router.post('/', (0, validate_1.validateBody)(CreateSchema), async (req, res) => {
    try {
        const row = await video_rewrite_1.videoRewrite.create(req.body);
        res.json(ok(row));
    }
    catch (err) {
        res.status(400).json(fail(err));
    }
});
// ─── 探活（不创建任务）───
router.post('/probe', (0, validate_1.validateBody)(ProbeSchema), async (req, res) => {
    try {
        const info = await video_downloader_1.videoDownloader.probe(req.body.url);
        res.json(ok(info));
    }
    catch (err) {
        res.status(400).json(fail(err));
    }
});
// ─── Step 1 SSE ───
router.post('/:id/download', async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await video_rewrite_1.videoRewrite.runDownload(Number(req.params.id), sse);
    }
    catch (err) {
        sse.sendError(String(err));
    }
});
// ─── Step 2 SSE ───
router.post('/:id/asr', async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await video_rewrite_1.videoRewrite.runAsr(Number(req.params.id), sse);
    }
    catch (err) {
        sse.sendError(String(err));
    }
});
// ─── Step 3 SSE ───
router.post('/:id/rewrite', async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await video_rewrite_1.videoRewrite.runRewrite(Number(req.params.id), sse);
    }
    catch (err) {
        sse.sendError(String(err));
    }
});
// ─── 升级为 copywriting ───
router.post('/:id/promote', async (req, res) => {
    try {
        const copyId = await video_rewrite_1.videoRewrite.promoteToCopywriting(Number(req.params.id));
        res.json(ok({ copywritingId: copyId }));
    }
    catch (err) {
        res.status(400).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=video-rewrite.js.map