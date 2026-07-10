"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataDir = dataDir;
exports.logsDir = logsDir;
exports.appRoot = appRoot;
exports.resourcesRoot = resourcesRoot;
exports.assetsDir = assetsDir;
/**
 * 应用路径管理（dev / prod 路径切换）
 *
 * dev:
 *   APP_ROOT  = packages/main         （__dirname 在 packages/main/src/utils → 上两级）
 *   data/     = packages/main/data    （直接 git 项目里）
 *   logs/     = packages/main/logs
 *
 * prod (electron-builder 打包后):
 *   APP_ROOT  = userData              （app.getPath('userData')，用户写得起的目录）
 *   data/     = userData/data         （sqlite、视频缓存、TTS 缓存全部进这里）
 *   logs/     = userData/logs
 *
 * 用 app.isPackaged 判断 dev / prod。
 *
 * 模块加载时机：本文件可能在 app ready 之前被 import（db/index.ts 的副作用），
 * 必须做到此时调 app.getPath() 也能拿到值。Electron 中 app.getPath('userData')
 * 在 app ready 之前其实就可用（只要 app 模块已 require 过），所以下面直接用 require。
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let _appRoot = null;
function resolveAppRoot() {
    if (_appRoot)
        return _appRoot;
    // 尝试拿 electron app；非 Electron 环境（如 db:migrate 脚本）直接走 dev 分支
    let isPackaged = false;
    let userDataDir = null;
    try {
        // 用动态 require 防止 ts 静态分析在非 electron 上下文报错
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        if (electron && electron.app) {
            isPackaged = !!electron.app.isPackaged;
            try {
                userDataDir = electron.app.getPath('userData');
            }
            catch {
                userDataDir = null;
            }
        }
    }
    catch {
        // 没在 electron 环境，按 dev 处理
    }
    if ((isPackaged || process.env.WANSHAN_RUNTIME === '1') && userDataDir) {
        _appRoot = userDataDir;
    }
    else {
        // dev：__dirname 在 packages/main/dist/utils（编译后）或 packages/main/src/utils（tsx）
        // 都是上两级 = packages/main
        _appRoot = path_1.default.resolve(__dirname, '..', '..');
    }
    return _appRoot;
}
/** 返回 data 目录下的子路径，自动 mkdir 父目录 */
function dataDir(...sub) {
    const p = path_1.default.join(resolveAppRoot(), 'data', ...sub);
    const parent = sub.length === 0 ? p : path_1.default.dirname(p);
    if (!fs_1.default.existsSync(parent))
        fs_1.default.mkdirSync(parent, { recursive: true });
    return p;
}
/** 返回 logs 目录下的子路径 */
function logsDir(...sub) {
    const p = path_1.default.join(resolveAppRoot(), 'logs', ...sub);
    const parent = sub.length === 0 ? p : path_1.default.dirname(p);
    if (!fs_1.default.existsSync(parent))
        fs_1.default.mkdirSync(parent, { recursive: true });
    return p;
}
/** 返回应用根（dev = packages/main，prod = userData） */
function appRoot() {
    return resolveAppRoot();
}
/**
 * 返回打包后随 app 一起分发的"只读"资源根。
 * dev: packages/main/..（仓库根）
 * prod: process.resourcesPath（electron-builder 把 extraResources 放在这里；asar 内的文件也要从这里访问）
 */
function resourcesRoot() {
    // process.resourcesPath 只在打包后存在
    if (process.resourcesPath && fs_1.default.existsSync(process.resourcesPath)) {
        return process.resourcesPath;
    }
    // dev：仓库根
    return path_1.default.resolve(__dirname, '..', '..', '..', '..');
}
/** 返回 assets/bgm 目录（dev = packages/main/assets/bgm，prod = resources/assets/bgm） */
function assetsDir(...sub) {
    // dev 走 packages/main/assets，prod 走 resources/assets（需 extraResources 配置）
    let isPackaged = false;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        isPackaged = !!(electron && electron.app && electron.app.isPackaged);
    }
    catch {
        isPackaged = false;
    }
    if (isPackaged && process.resourcesPath) {
        return path_1.default.join(process.resourcesPath, 'assets', ...sub);
    }
    return path_1.default.join(resolveAppRoot(), 'assets', ...sub);
}
//# sourceMappingURL=paths.js.map
