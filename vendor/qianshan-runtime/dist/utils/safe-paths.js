"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPathAllowed = isPathAllowed;
exports.ensureSafePath = ensureSafePath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_1 = require("electron");
/**
 * 安全路径白名单：/api/video/file 和将来任何「读本地文件下发给前端」的接口都必须通过这层校验，
 * 避免被恶意前端请求读任意文件（C:/Windows/System32/... 之类）。
 *
 * 允许的根目录：
 *   - userData 目录（Electron 托管，存 DB / 日志 / 发布截图）
 *   - packages/main/data（内置素材/BGM）
 *   - packages/main/logs
 *   - packages/main/uploads（未来用户上传）
 *   - userData/publisher-logs（发布截图）
 */
function getAllowedRoots() {
    const roots = [];
    try {
        if (electron_1.app && electron_1.app.isReady && electron_1.app.isReady()) {
            roots.push(path_1.default.resolve(electron_1.app.getPath('userData')));
            roots.push(path_1.default.resolve(electron_1.app.getPath('temp')));
        }
    }
    catch {
        /* 启动阶段 app 可能未 ready */
    }
    // 代码所在 packages/main 下的 data/logs/uploads
    const mainRoot = path_1.default.resolve(__dirname, '..', '..');
    for (const sub of ['data', 'logs', 'uploads']) {
        roots.push(path_1.default.join(mainRoot, sub));
    }
    return roots;
}
/**
 * 判断 filePath 是否在允许的目录树下（防 `..` 穿越）。
 */
function isPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string')
        return false;
    try {
        const normalized = path_1.default.resolve(filePath);
        const roots = getAllowedRoots();
        return roots.some((root) => {
            const rel = path_1.default.relative(root, normalized);
            // rel 不以 .. 开头、不是绝对路径 —— 说明 normalized 在 root 下
            return rel && !rel.startsWith('..') && !path_1.default.isAbsolute(rel);
        });
    }
    catch {
        return false;
    }
}
/**
 * 验证并返回规范化路径；非法时抛错。
 */
function ensureSafePath(filePath) {
    const normalized = path_1.default.resolve(filePath);
    if (!isPathAllowed(normalized)) {
        throw new Error('Path not allowed');
    }
    if (!fs_1.default.existsSync(normalized)) {
        throw new Error('File not found');
    }
    return normalized;
}
//# sourceMappingURL=safe-paths.js.map