"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const topic_radar_1 = require("../services/topic-radar");
const logger_1 = require("../utils/logger");
const validate_1 = require("../utils/validate");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
const FetchSchema = zod_1.z.object({
    platform: zod_1.z.string().min(1).max(32),
});
const CalendarSchema = zod_1.z.object({
    date: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1).max(200),
    platform: zod_1.z.string().min(1).max(32),
    topicId: zod_1.z.number().int().positive().optional(),
    copywritingId: zod_1.z.number().int().positive().optional(),
    notes: zod_1.z.string().max(500).optional(),
    status: zod_1.z.enum(['planned', 'producing', 'ready', 'published']).optional(),
    timeOfDay: zod_1.z
        .string()
        .regex(/^\d{2}:\d{2}$/, 'timeOfDay 需形如 HH:mm')
        .optional(),
});
// ─── 平台元数据（source=real|llm + 说明文案 + 最后抓取时间）───
router.get('/platforms', async (_req, res) => {
    try {
        res.json(ok(await topic_radar_1.topicRadar.listPlatforms()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 热搜选题 ───
router.post('/fetch', (0, validate_1.validateBody)(FetchSchema), async (req, res) => {
    try {
        const { platform } = req.body;
        const result = await topic_radar_1.topicRadar.fetchHotTopics(platform);
        res.json(ok(result));
    }
    catch (err) {
        logger_1.logger.error('topic/fetch error: ' + err);
        res.status(500).json(fail(err));
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const r = await topic_radar_1.topicRadar.removeTopic(Number(req.params.id));
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/batch-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];
        const r = await topic_radar_1.topicRadar.removeTopicMany(ids);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/clear/:platform', async (req, res) => {
    try {
        const r = await topic_radar_1.topicRadar.clearPlatform(req.params.platform);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/list', async (req, res) => {
    try {
        const { platform, keyword, category, source, trend, pinnedOnly, sort, page = '1', pageSize = '20', } = req.query;
        const result = await topic_radar_1.topicRadar.listTopics({
            platform: platform || undefined,
            keyword: keyword || undefined,
            category: category || undefined,
            source: source || undefined,
            trend: trend || undefined,
            pinnedOnly: pinnedOnly === '1' || pinnedOnly === 'true',
            sort: sort || 'heat',
            page: Number(page),
            pageSize: Number(pageSize),
        });
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/analyze/:id', async (req, res) => {
    try {
        const result = await topic_radar_1.topicRadar.analyzeTopic(Number(req.params.id));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/analyze/:id', async (req, res) => {
    try {
        const result = await topic_radar_1.topicRadar.getAnalysis(Number(req.params.id));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 批量 AI 分析
router.post('/analyze/batch', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];
        if (ids.length === 0)
            return res.status(400).json(fail('ids 必填'));
        if (ids.length > 20)
            return res.status(400).json(fail('单次最多 20 条'));
        const result = await topic_radar_1.topicRadar.analyzeBatch(ids);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 切换收藏
router.post('/:id/pin', async (req, res) => {
    try {
        const result = await topic_radar_1.topicRadar.togglePin(Number(req.params.id));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 内容日历 ───
router.post('/calendar', (0, validate_1.validateBody)(CalendarSchema), async (req, res) => {
    try {
        const result = await topic_radar_1.topicRadar.addCalendarItem(req.body);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/calendar', async (req, res) => {
    try {
        const { month } = req.query;
        const result = await topic_radar_1.topicRadar.listCalendar(month);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 聚合月历：合并手动排期 + 发布任务 + 调度 */
router.get('/calendar/combined', async (req, res) => {
    try {
        const { month } = req.query;
        const result = await topic_radar_1.topicRadar.listCombinedCalendar(month);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.patch('/calendar/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await topic_radar_1.topicRadar.updateCalendarStatus(Number(req.params.id), status);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/calendar/:id', async (req, res) => {
    try {
        await topic_radar_1.topicRadar.removeCalendarItem(Number(req.params.id));
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=topic.js.map