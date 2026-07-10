"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("./paths");
// dev → packages/main/logs；prod → userData/logs（用户可写）
const LOG_DIR = (0, paths_1.logsDir)();
exports.logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({
            filename: path_1.default.join(LOG_DIR, 'app.log'),
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 3,
        }),
    ],
});
//# sourceMappingURL=logger.js.map