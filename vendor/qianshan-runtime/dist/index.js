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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// 扩展 NO_PROXY：确保国内 API 域名不走 VPN 代理
// 用户若设了 HTTP_PROXY=127.0.0.1:10808（V2Ray/Clash 等），
// 这些国内服务不应该走代理，否则会 fetch failed
// 必须在任何 fetch/undici 初始化之前执行
// ============================================================
const DOMESTIC_API_HOSTS = [
    'siliconflow.cn',
    'dashscope.aliyuncs.com',
    'aliyuncs.com',
    'deepseek.com',
    'api.deepseek.com',
    'klingai.com',
    // 千山授权服务器
    'qianshanai.cn',
    'api.qianshanai.cn',
];
const existingNoProxy = (process.env.NO_PROXY || process.env.no_proxy || '').trim();
const mergedNoProxy = [existingNoProxy, ...DOMESTIC_API_HOSTS].filter(Boolean).join(',');
process.env.NO_PROXY = mergedNoProxy;
process.env.no_proxy = mergedNoProxy;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ⭐ 顶层 import — 把全局 fetch 替换成 Electron net.fetch(走 Chrome 网络栈,
//   解决 undici 不识别系统代理 / TUN VPN 导致国内域名 fetch failed 的问题)
const install_electron_fetch_1 = require("./utils/install-electron-fetch");
// ============== 启动调试探针 ==============
// prod 下 stderr 不可见，把启动各阶段写到 temp 文件方便诊断
const _bootLogPath = path_1.default.join(electron_1.app.getPath('temp'), 'qianshan-boot.log');
function bootLog(msg) {
    try {
        fs_1.default.appendFileSync(_bootLogPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
    }
    catch {
        /* noop */
    }
}
bootLog('=== boot start ===');
bootLog(`isPackaged=${electron_1.app.isPackaged}`);
bootLog(`userData=${electron_1.app.getPath('userData')}`);
bootLog(`exec=${process.execPath}`);
bootLog(`__dirname=${__dirname}`);
// 让任何 import 阶段或异步链路里的错误都进 boot log
process.on('uncaughtException', (err) => {
    bootLog('uncaughtException: ' + String(err) + '\n' + (err?.stack || ''));
});
process.on('unhandledRejection', (reason) => {
    bootLog('unhandledRejection: ' + String(reason) + '\n' + (reason?.stack || ''));
});
const server_1 = require("./server");
const logger_1 = require("./utils/logger");
const ipc_1 = require("./ipc");
const style_engine_1 = require("./services/style-engine");
const video_workshop_1 = require("./services/video-workshop");
const distribute_1 = require("./services/distribute");
const llm_config_1 = require("./services/llm-config");
const llm_tier_config_1 = require("./services/llm-tier-config");
const external_credentials_1 = require("./services/external-credentials");
const scheduler_1 = require("./services/scheduler");
const content_audit_1 = require("./services/content-audit");
let mainWindow = null;
async function createWindow() {
    bootLog('createWindow() entered');
    // 先启动后端 API
    try {
        await (0, server_1.startServer)();
        bootLog('startServer ok');
    }
    catch (err) {
        bootLog('startServer FAIL: ' + String(err) + '\n' + (err?.stack || ''));
        throw err;
    }
    logger_1.logger.info('[Electron] Server started');
    // 初始化内置风格预设 & Mock 资源
    try {
        await style_engine_1.styleEngine.seedBuiltinPresets();
        await video_workshop_1.videoWorkshop.seedBuiltinAssets();
        await distribute_1.distribute.seedMockAccounts();
        logger_1.logger.info('[Electron] Builtin assets seeded');
    }
    catch (err) {
        logger_1.logger.warn('[Electron] Seed presets failed: ' + String(err));
    }
    // 初始化 LLM 路由 & 凭据（从 DB 读到 runtime llm service）
    try {
        await llm_config_1.llmConfig.init();
        logger_1.logger.info('[Electron] LLM config initialized');
    }
    catch (err) {
        logger_1.logger.warn('[Electron] LLM config init failed: ' + String(err));
    }
    // 初始化档位配置（5 类 × 3 档）
    try {
        await llm_tier_config_1.llmTierConfig.init();
        await llm_tier_config_1.llmTierConfig.syncRoutingTable();
        logger_1.logger.info('[Electron] LLM tier config initialized');
    }
    catch (err) {
        logger_1.logger.warn('[Electron] LLM tier config init failed: ' + String(err));
    }
    // 初始化外部 API 凭据（Pixabay / Pexels）
    try {
        await external_credentials_1.externalCreds.init();
    }
    catch (err) {
        logger_1.logger.warn('[Electron] External credentials init failed: ' + String(err));
    }
    // 初始化数字人形象素材库(seed 内置预设)
    // 用 require 而不是 await import:dev 模式 native ts 解 dynamic import 找不到 .ts
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { avatarAssetService } = require('./services/avatar-asset');
        await avatarAssetService.init();
        logger_1.logger.info('[Electron] Avatar asset service initialized');
    }
    catch (err) {
        logger_1.logger.warn('[Electron] Avatar asset init failed: ' + String(err));
    }
    // 启动调度器（主线 C）
    try {
        scheduler_1.scheduler.start();
        logger_1.logger.info('[Electron] Scheduler started');
    }
    catch (err) {
        logger_1.logger.warn('[Electron] Scheduler start failed: ' + String(err));
    }
    // 内容审核词库：加载用户自定义违禁词
    try {
        await content_audit_1.contentAudit.init();
    }
    catch (err) {
        logger_1.logger.warn('[Electron] Content audit init failed: ' + String(err));
    }
    // 窗口图标：dev 走 repo 顶层 resources/icon.png；
    // prod 由 electron-builder 通过 build.icon 配置（resources/icon.ico/.icns）注入
    // __dirname:
    //   dev (tsx run src):  packages/main/src    → 3 个 .. → weMediaAi
    //   prod (compiled):    packages/main/dist   → 3 个 .. → weMediaAi
    const candidates = [
        path_1.default.join(__dirname, '..', '..', '..', 'resources', 'icon.png'),
        path_1.default.join(process.cwd(), 'resources', 'icon.png'),
        path_1.default.join(process.resourcesPath || '', 'icon.png'),
    ];
    const winIcon = candidates.find((p) => p && fs_1.default.existsSync(p));
    if (winIcon) {
        logger_1.logger.info(`[Electron] 使用窗口图标: ${winIcon}`);
    }
    else {
        logger_1.logger.warn(`[Electron] 未找到 icon.png，候选路径: ${candidates.join(' | ')}`);
    }
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: '千山自媒体助手',
        icon: winIcon,
        show: false, // 先隐藏，等页面加载完再显示，避免黑屏
        backgroundColor: '#0D1117', // 深色背景，避免白闪
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // 页面渲染完毕后再显示窗口，消除启动黑屏
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    (0, ipc_1.registerIPC)(mainWindow);
    // 开发模式加载 Vite dev server，生产模式加载打包文件
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // DevTools 改为手动开：F12 / Ctrl+Shift+I
    }
    else {
        // prod 打包结构 (electron-builder + pnpm deploy):
        //   app.asar/dist/index.js (main 入口)
        //   app.asar/renderer/dist/index.html (渲染进程页面)
        // __dirname = app.asar/dist → 上一级 = app.asar 根 → renderer/dist/index.html
        mainWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// Windows 任务栏图标分组 + 提示用 AUMID（让任务栏不再聚合到 electron.exe 名下，
// 也提升自定义 icon 在某些 Windows 版本下被识别的概率）
if (process.platform === 'win32') {
    electron_1.app.setAppUserModelId('com.qianshan.ai');
}
// 隐藏顶部默认菜单栏（File / Edit / View / Window / Help）
// macOS 保留系统菜单（习惯不同，且 macOS 应用菜单是必备项）
if (process.platform !== 'darwin') {
    electron_1.Menu.setApplicationMenu(null);
}
bootLog('about to call app.whenReady()');
electron_1.app.whenReady().then(async () => {
    // ⭐ 关键:替换全局 fetch 为 electron.net.fetch(必须在 createWindow / 登录心跳 / cloud 拉取前装好)
    (0, install_electron_fetch_1.installElectronFetch)();
    await createWindow();
    // 自动更新（仅 prod；dev 内部会自己跳过）
    try {
        const { initAutoUpdate } = await Promise.resolve().then(() => __importStar(require('./auto-update.js')));
        initAutoUpdate(() => mainWindow);
    }
    catch (err) {
        bootLog('initAutoUpdate FAIL (ignored): ' + String(err));
    }
}).catch((err) => {
    bootLog('whenReady().then FAIL: ' + String(err) + '\n' + (err?.stack || ''));
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
//# sourceMappingURL=index.js.map