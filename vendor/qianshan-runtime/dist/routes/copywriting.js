"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const copywriting_1 = require("../services/copywriting");
const sse_manager_1 = require("../services/sse-manager");
const logger_1 = require("../utils/logger");
const validate_1 = require("../utils/validate");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
const GenerateSchema = zod_1.z.object({
    topic: zod_1.z.string().min(1).max(200),
    platform: zod_1.z.string().min(1).max(32),
    style: zod_1.z.string().optional(),
    duration: zod_1.z.number().int().min(10).max(600).optional(),
    presetId: zod_1.z.number().int().positive().optional(),
    notes: zod_1.z.string().max(1000).optional(),
    // 主线 A：来源选题 id（可选）
    topicId: zod_1.z.number().int().positive().optional(),
    sourceKeyword: zod_1.z.string().max(200).optional(),
});
const AdaptSchema = zod_1.z.object({
    platform: zod_1.z.string().min(1).max(32),
});
const TextRewriteSchema = zod_1.z.object({
    sourceText: zod_1.z.string().min(10).max(30000),
    mode: zod_1.z.enum(['polish', 'expand', 'compress', 'rewrite']),
    platform: zod_1.z.string().min(1).max(32),
    presetId: zod_1.z.number().int().positive().optional(),
    notes: zod_1.z.string().max(500).optional(),
    sourceTitle: zod_1.z.string().max(200).optional(),
    sourceCopywritingId: zod_1.z.number().int().positive().optional(),
});
const BatchReauditSchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.number().int().positive()).min(1).max(50),
    useLLM: zod_1.z.boolean().optional(),
});
const BatchAdaptSchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.number().int().positive()).min(1).max(20),
    platforms: zod_1.z.array(zod_1.z.string().min(1).max(32)).min(1).max(5),
});
// ─── SSE：从零生成 ───
router.post('/generate-stream', (0, validate_1.validateBody)(GenerateSchema), async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await copywriting_1.copywriting.generateFromScratch(req.body, sse);
    }
    catch (err) {
        logger_1.logger.error('copy/generate-stream error: ' + err);
        sse.sendError(String(err));
    }
});
// ─── SSE：文稿加工（润色 / 扩写 / 压缩 / 改写）───
router.post('/text-rewrite-stream', (0, validate_1.validateBody)(TextRewriteSchema), async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await copywriting_1.copywriting.rewriteFromText(req.body, sse);
    }
    catch (err) {
        logger_1.logger.error('copy/text-rewrite-stream error: ' + err);
        sse.sendError(String(err));
    }
});
// ─── 平台适配 ───
router.post('/:id/adapt', (0, validate_1.validateBody)(AdaptSchema), async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.adaptToPlatform(Number(req.params.id), req.body.platform);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 标题 ───
router.post('/:id/titles/regenerate', async (req, res) => {
    try {
        const titles = await copywriting_1.copywriting.regenerateTitles(Number(req.params.id));
        res.json(ok(titles));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/:id/titles/:titleId/select', async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.selectTitle(Number(req.params.id), Number(req.params.titleId));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── CRUD ───
router.get('/list', async (req, res) => {
    try {
        const { keyword, platform, auditLevel, generationMode, dateFrom, dateTo, sort, page = '1', pageSize = '20', } = req.query;
        const result = await copywriting_1.copywriting.list({
            keyword: keyword || undefined,
            platform: platform || undefined,
            auditLevel: auditLevel || undefined,
            generationMode: generationMode || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            sort: sort || 'updated',
            page: Number(page) || 1,
            pageSize: Number(pageSize) || 20,
        });
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 主线 A：按 topicId 列所有衍生文案 */
router.get('/by-topic/:topicId', async (req, res) => {
    try {
        const rows = await copywriting_1.copywriting.listByTopicId(Number(req.params.topicId));
        res.json(ok(rows));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/:id', async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.getDetail(Number(req.params.id));
        if (!result)
            return res.status(404).json(fail('copywriting not found'));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.patch('/:id', async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.update(Number(req.params.id), req.body);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.remove(Number(req.params.id));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 批量删除：body { ids: [1,2,3] }
router.post('/batch-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];
        const result = await copywriting_1.copywriting.removeMany(ids);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 批量重审：body { ids: [...], useLLM?: boolean }
router.post('/batch-reaudit', (0, validate_1.validateBody)(BatchReauditSchema), async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.batchReaudit(req.body.ids, req.body.useLLM === true);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 批量多平台适配：body { ids: [...], platforms: [...] }
router.post('/batch-adapt', (0, validate_1.validateBody)(BatchAdaptSchema), async (req, res) => {
    try {
        const result = await copywriting_1.copywriting.batchAdapt(req.body.ids, req.body.platforms);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/templates/list', async (req, res) => {
    try {
        const { category, platform } = req.query;
        const result = await copywriting_1.copywriting.listTemplates(category, platform);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=copywriting.js.map