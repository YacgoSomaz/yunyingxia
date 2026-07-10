"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAutoUpdate = initAutoUpdate;
/**
 * 自动更新（electron-updater）
 *
 * 检查触发时机（三路）：
 *   1. 启动 5 秒后第一次查
 *   2. 之后每 4 小时定时查（覆盖"app 一直开着不退出"的长会话用户）
 *   3. 主窗口 focus 时查（带 1 小时节流，避免来回切窗 spam）
 * 任何一路成功的查询都会刷新最近一次时间戳，节流共用同一个时间戳。
 *
 * 流程：检查 → 发现新版 → 后台下载 → 通过 IPC 通知渲染端
 *      → 用户在 UI 上选 "立即重启安装" 或 "稍后"（稍后会在下次退出时自动装）
 *
 * 更新源：阿里云 OSS（qianshan-ai bucket，updates/win-x64/）
 * IPC 通道：
 *   主→渲染:  update:checking | update:available | update:not-available
 *             | update:progress | update:downloaded | update:error
 *   渲染→主:  update:check  -> 立即查更新
 *             update:install -> 下载完后立即重启安装
 *
 * 注意：未签名安装包在 Win 上会触发 UAC 弹窗（系统行为，不是 bug）。
 */
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let started = false;
function initAutoUpdate(getMainWindow) {
    if (started)
        return;
    started = true;
    const send = (channel, payload) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    };
    // dev 模式跳过；但 IPC 还是注册（让渲染端调 checkNow 不会崩）
    if (!electron_1.app.isPackaged) {
        console.log('[AutoUpdate] dev 模式，跳过自动更新');
        electron_1.ipcMain.handle('update:check', () => ({ skipped: true, reason: 'dev mode' }));
        electron_1.ipcMain.handle('update:install', () => ({ skipped: true, reason: 'dev mode' }));
        return;
    }
    let autoUpdater;
    let logger;
    try {
        autoUpdater = require('electron-updater').autoUpdater;
        logger = require('electron-log');
    }
    catch (e) {
        console.warn('[AutoUpdate] 模块未安装，跳过：', e.message);
        return;
    }
    try {
        logger.transports.file.level = 'info';
        logger.transports.file.resolvePathFn = () => path_1.default.join(electron_1.app.getPath('userData'), 'logs', 'updater.log');
        autoUpdater.logger = logger;
    }
    catch { }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => {
        send('update:checking');
    });
    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdate] 发现新版本:', info?.version);
        send('update:available', { version: info?.version, releaseDate: info?.releaseDate });
    });
    autoUpdater.on('update-not-available', (info) => {
        send('update:not-available', { version: info?.version });
    });
    autoUpdater.on('download-progress', (p) => {
        send('update:progress', {
            percent: p?.percent ?? 0,
            transferred: p?.transferred ?? 0,
            total: p?.total ?? 0,
            bytesPerSecond: p?.bytesPerSecond ?? 0,
        });
    });
    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdate] 下载完成,版本:', info?.version);
        send('update:downloaded', { version: info?.version });
    });
    autoUpdater.on('error', (err) => {
        const msg = err?.message || String(err);
        console.warn('[AutoUpdate] 错误:', msg);
        send('update:error', { message: msg });
    });
    // IPC: 渲染端主动触发查询
    electron_1.ipcMain.handle('update:check', async () => {
        try {
            const r = await autoUpdater.checkForUpdates();
            return { ok: true, updateInfo: r?.updateInfo };
        }
        catch (err) {
            return { ok: false, error: err?.message || String(err) };
        }
    });
    // IPC: 渲染端确认立即重启安装
    electron_1.ipcMain.handle('update:install', () => {
        setImmediate(() => autoUpdater.quitAndInstall());
        return { ok: true };
    });
    // ── 周期检查 + focus 节流共享一个时间戳 ──
    let lastCheckAt = 0;
    const FOCUS_THROTTLE_MS = 60 * 60 * 1000; // focus 触发的查询最少间隔 1 小时
    const INTERVAL_MS = 4 * 60 * 60 * 1000; // 定时轮询周期 4 小时
    const safeCheck = (reason) => {
        lastCheckAt = Date.now();
        autoUpdater.checkForUpdates().catch((err) => {
            console.warn(`[AutoUpdate] checkForUpdates 失败（${reason}，已静默）:`, err?.message || err);
        });
    };
    // 启动 5s 后第一次查
    setTimeout(() => safeCheck('startup'), 5000);
    // 每 4 小时定时查（覆盖长会话用户）
    setInterval(() => safeCheck('interval'), INTERVAL_MS);
    // 窗口 focus 时查（带 1 小时节流，避免切窗 spam）
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
        win.on('focus', () => {
            if (Date.now() - lastCheckAt < FOCUS_THROTTLE_MS)
                return;
            safeCheck('focus');
        });
    }
}
//# sourceMappingURL=auto-update.js.map