"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIPC = registerIPC;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const url_whitelist_1 = require("./utils/url-whitelist");
const logger_1 = require("./utils/logger");
const distribute_1 = require("./services/distribute");
const license_1 = require("./services/license");
const paid_action_auth_1 = require("./paid-action-auth");
/** 探测剪映/CapCut 在本机的常见素材缓存目录 */
function detectJianyingAudioDir() {
    const home = os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const candidates = [];
    if (process.platform === 'win32') {
        candidates.push(path.join(localAppData, 'JianyingPro', 'User Data', 'Cache', 'audio'), path.join(localAppData, 'JianyingPro', 'User Data', 'Cache'), path.join(localAppData, 'CapCut', 'User Data', 'Cache', 'audio'), path.join(localAppData, 'CapCut', 'User Data', 'Cache'), path.join(appData, 'JianyingPro', 'User Data', 'Cache', 'audio'), path.join(home, 'Documents', 'JianyingPro Drafts'), 
        // 自定义安装位置（D 盘常见）
        'D:\\JianyingPro\\Resources', 'D:\\剪映专业版\\Resources');
    }
    else if (process.platform === 'darwin') {
        candidates.push(path.join(home, 'Library', 'Containers', 'com.lemon.lvpro', 'Data', 'Library', 'Caches'), path.join(home, 'Movies', 'JianyingPro'));
    }
    for (const p of candidates) {
        try {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory())
                return p;
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
function registerIPC(_win) {
    electron_1.ipcMain.handle('dialog:selectFile', async (_event, options) => {
        const result = await electron_1.dialog.showOpenDialog({
            properties: ['openFile'],
            filters: options?.filters || [{ name: '所有文件', extensions: ['*'] }],
        });
        return result.canceled ? null : result.filePaths[0];
    });
    electron_1.ipcMain.handle('dialog:selectFiles', async (_event, options) => {
        const result = await electron_1.dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: options?.filters || [{ name: '所有文件', extensions: ['*'] }],
        });
        return result.canceled ? [] : result.filePaths;
    });
    electron_1.ipcMain.handle('dialog:selectFolder', async (_event, options) => {
        const result = await electron_1.dialog.showOpenDialog({
            properties: ['openDirectory'],
            defaultPath: options?.defaultPath,
            title: options?.title,
        });
        return result.canceled ? null : result.filePaths[0];
    });
    /** 探测剪映/CapCut 本地素材缓存路径，找不到返回 null */
    electron_1.ipcMain.handle('jianying:detectAudioDir', async () => {
        return detectJianyingAudioDir();
    });
    electron_1.ipcMain.handle('dialog:saveFile', async (_event, options) => {
        const result = await electron_1.dialog.showSaveDialog({
            defaultPath: options?.defaultPath,
        });
        return result.canceled ? null : result.filePath;
    });
    electron_1.ipcMain.handle('app:info', () => ({
        version: electron_1.app.getVersion(),
        name: electron_1.app.getName(),
        platform: process.platform,
    }));
    // ─── 授权:登录 / 心跳由 main 内部跑 ───
    electron_1.ipcMain.handle('auth:getCachedPhone', () => (0, license_1.getCachedPhone)());
    electron_1.ipcMain.handle('auth:login', async (_event, phone) => {
        // 不在 IPC 层做格式校验,任何非空输入都透传给平台 /tools/verify,
        // 让平台后端决定能不能登录(支持手机号 / 激活码 / 其他自定义认证形式)
        if (!phone || !phone.trim()) {
            return {
                ok: false,
                code: -2,
                message: '请输入手机号',
                displayMessage: '请输入手机号',
            };
        }
        const r = await (0, license_1.login)(phone.trim());
        return { ...r, displayMessage: (0, license_1.msgForCode)(r.code, r.message) };
    });
    electron_1.ipcMain.handle('auth:logout', () => {
        (0, license_1.logout)();
        return { ok: true };
    });
    electron_1.ipcMain.handle('auth:getMemberInfo', () => (0, license_1.getMemberInfo)());
    electron_1.ipcMain.handle('shell:openExternal', async (_event, url) => {
        if (!(0, url_whitelist_1.isUrlAllowed)(url)) {
            logger_1.logger.warn(`[IPC] 拒绝打开非白名单 URL: ${url}`);
            return { ok: false, error: '该 URL 不在白名单，已拒绝打开' };
        }
        await electron_1.shell.openExternal(url);
        return { ok: true };
    });
    // 在资源管理器里定位到本地文件
    electron_1.ipcMain.handle('shell:showItemInFolder', (_event, filePath) => {
        if (!filePath)
            return { ok: false, error: 'empty path' };
        // 仅允许指向应用数据目录的路径（防止通过 IPC 乱看系统文件）
        const normalized = filePath.replace(/\\/g, '/');
        if (!/packages\/main\/data\//i.test(normalized) && !/\\resources\\bin\\/i.test(filePath)) {
            logger_1.logger.warn(`[IPC] 拒绝在资源管理器打开非数据目录文件: ${filePath}`);
            return { ok: false, error: '只允许打开应用生成的文件' };
        }
        electron_1.shell.showItemInFolder(filePath);
        return { ok: true };
    });
    // ─── 平台账号：扫码登录（Express 路由也能调，这里给 IPC 多一条路） ───
    electron_1.ipcMain.handle('publisher:login', async (_event, accountId) => {
        const runtime = globalThis;
        const allowed = await (0, paid_action_auth_1.verifyPaidOperationAccess)(runtime.__WANSHAN_VERIFY_OPERATION_ACCESS, 'POST');
        if (!allowed) {
            return { ok: false, code: 'MEMBERSHIP_REQUIRED', error: '会员专属功能，请开通会员后再试。' };
        }
        return distribute_1.distribute.loginAccount(Number(accountId));
    });
}
//# sourceMappingURL=ipc.js.map
