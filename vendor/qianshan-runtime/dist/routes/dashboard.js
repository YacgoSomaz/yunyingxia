"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_1 = require("../services/dashboard");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
/** 首页聚合数据（一次查完：stats + pipelines + todos + overview） */
router.get('/summary', async (_req, res) => {
    try {
        res.json(ok(await dashboard_1.dashboard.summary()));
    }
    catch (err) {
        logger_1.logger.error('dashboard/summary error: ' + err);
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.js.map