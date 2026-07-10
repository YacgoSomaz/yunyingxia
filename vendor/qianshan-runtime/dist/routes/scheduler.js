"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const scheduler_1 = require("../services/scheduler");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
/** SSE 事件流：前端订阅后可实时收到
 *    - task-published   定时任务发布成功
 *    - task-failed      发布失败
 *    - task-retry-ok    失败重试成功
 *    - schedule-fired   计划触发
 *    - account-expired  账号 Cookie 过期
 *    - account-stale    账号长时间未校验
 */
router.get('/events', (_req, res) => {
    try {
        (0, scheduler_1.subscribeEvents)(res);
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 调度器日志（最近 N 条） */
router.get('/logs', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 50;
        res.json(ok(await scheduler_1.scheduler.listLogs(limit)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 立即手动触发一次 tick（给调试 / 前端「立即检查」按钮用） */
router.post('/tick', async (_req, res) => {
    try {
        await scheduler_1.scheduler.tick();
        res.json(ok({ triggered: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** cron 表达式预览：返回未来 N 次匹配时刻（最多扫 7 天） */
router.get('/preview', (req, res) => {
    try {
        const expr = String(req.query.cron || '').trim();
        const limit = Math.min(Number(req.query.limit) || 5, 20);
        if (!expr)
            return res.json(ok([]));
        const out = [];
        const cursor = new Date();
        cursor.setSeconds(0, 0);
        for (let i = 0; i < 60 * 24 * 7 && out.length < limit; i++) {
            cursor.setMinutes(cursor.getMinutes() + 1);
            if ((0, scheduler_1.cronMatches)(expr, cursor)) {
                out.push(cursor.toISOString());
            }
        }
        res.json(ok(out));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=scheduler.js.map