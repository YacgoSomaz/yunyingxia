"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const shared_1 = require("@qianshan/shared");
const routes_1 = require("./routes");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
// ─── 中间件 ───
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ─── 请求日志 ───
app.use((req, _res, next) => {
    logger_1.logger.info(`${req.method} ${req.path}`);
    next();
});
// ─── 注册路由 ───
(0, routes_1.registerRoutes)(app);
// ─── 健康检查 ───
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ─── 错误处理 ───
app.use((err, _req, res, _next) => {
    logger_1.logger.error('Unhandled error: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
});
function startServer() {
    return new Promise((resolve) => {
        // 只绑本机回环，防止同网段其他设备调用本应用的 API。
        app.listen(shared_1.API_PORT, '127.0.0.1', () => {
            logger_1.logger.info(`[Server] Running on http://127.0.0.1:${shared_1.API_PORT}`);
            resolve();
        });
    });
}
//# sourceMappingURL=server.js.map