"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_1 = require("../services/analytics");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
/** 顶栏汇总（总浏览/点赞/已发布） */
router.get('/summary', async (_req, res) => {
    try {
        res.json(ok(await analytics_1.analytics.summary()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 日趋势 GET /api/analytics/daily-trend?days=14&platform=douyin */
router.get('/daily-trend', async (req, res) => {
    try {
        const days = Number(req.query.days) || 14;
        const platform = req.query.platform ? String(req.query.platform) : undefined;
        res.json(ok(await analytics_1.analytics.dailyTrend({ days, platform })));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 平台对比 GET /api/analytics/platform-comparison?days=14 */
router.get('/platform-comparison', async (req, res) => {
    try {
        const days = Number(req.query.days) || 14;
        res.json(ok(await analytics_1.analytics.platformComparison({ days })));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 爆款 TopN GET /api/analytics/top-content?limit=10&metric=views&days=30 */
router.get('/top-content', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 10;
        const metric = String(req.query.metric || 'views');
        const days = Number(req.query.days) || 30;
        res.json(ok(await analytics_1.analytics.topContent({ limit, metric, days })));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 小时热度 GET /api/analytics/hour-heatmap?days=30 */
router.get('/hour-heatmap', async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        res.json(ok(await analytics_1.analytics.hourHeatmap({ days })));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** AI 数据洞察 POST /api/analytics/ai-insight  { days?, platform? } */
router.post('/ai-insight', async (req, res) => {
    try {
        const days = Number(req.body?.days) || 14;
        const platform = req.body?.platform || undefined;
        res.json(ok(await analytics_1.analytics.aiInsight({ days, platform })));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** CSV 导出 GET /api/analytics/export.csv?days=30&platform=douyin */
router.get('/export.csv', async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        const platform = req.query.platform ? String(req.query.platform) : undefined;
        const csv = await analytics_1.analytics.buildCsv({ days, platform });
        const filename = `analytics_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=analytics.js.map