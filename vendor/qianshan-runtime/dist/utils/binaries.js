"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFfmpegPath = getFfmpegPath;
exports.getFfprobePath = getFfprobePath;
exports.getYtDlpPath = getYtDlpPath;
exports.resetBinaryCache = resetBinaryCache;
exports.checkBinary = checkBinary;
/**
 * 跨环境二进制路径解析
 *
 * 开发环境（pnpm dev）:
 *   - 优先 repo 根下的 resources/bin/ffmpeg.exe
 *   - 找不到就回落到系统 PATH（方便开发者 choco install 过的情形）
 *
 * 生产环境（打包后）:
 *   - electron-builder 的 extraResources 把 resources/bin/ 放到 process.resourcesPath
 *   - 走 process.resourcesPath/bin/ffmpeg.exe
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';
/** 开发时：向上找 repo 根（含 resources/bin 的最近祖先） */
function devBinDir() {
    // 从 __dirname 向上找（兼容 packages/main / packages/main/dist 等位置）
    let cur = __dirname;
    for (let i = 0; i < 8; i++) {
        const candidate = path_1.default.join(cur, 'resources', 'bin');
        if (fs_1.default.existsSync(candidate))
            return candidate;
        const parent = path_1.default.dirname(cur);
        if (parent === cur)
            break;
        cur = parent;
    }
    // 退路：process.cwd()
    return path_1.default.join(process.cwd(), 'resources', 'bin');
}
/** 生产时：electron-builder 的 extraResources 解压到 process.resourcesPath */
function prodBinDir() {
    // @ts-ignore - process.resourcesPath 只在 Electron 运行时存在
    const res = process.resourcesPath;
    return res ? path_1.default.join(res, 'bin') : '';
}
function findBinary(name) {
    const fileName = `${name}${EXE}`;
    // 1) 开发环境：repo/resources/bin/xxx.exe
    const devPath = path_1.default.join(devBinDir(), fileName);
    if (fs_1.default.existsSync(devPath))
        return devPath;
    // 2) 生产环境：resourcesPath/bin/xxx.exe
    const prodDir = prodBinDir();
    if (prodDir) {
        const prodPath = path_1.default.join(prodDir, fileName);
        if (fs_1.default.existsSync(prodPath))
            return prodPath;
    }
    // 3) 回落到 PATH（execFile/execFileSync 会自动解析）
    return name;
}
let cached = {};
function getFfmpegPath() {
    if (!cached.ffmpeg)
        cached.ffmpeg = findBinary('ffmpeg');
    return cached.ffmpeg;
}
function getFfprobePath() {
    if (!cached.ffprobe)
        cached.ffprobe = findBinary('ffprobe');
    return cached.ffprobe;
}
/** yt-dlp 二进制路径。Windows 下 文件名 yt-dlp.exe，其他平台 yt-dlp */
function getYtDlpPath() {
    if (!cached.ytdlp)
        cached.ytdlp = findBinary('yt-dlp');
    return cached.ytdlp;
}
/** 重置缓存（测试用）*/
function resetBinaryCache() {
    cached = {};
}
/** 检查二进制是否可用（返回版本号或 null） */
function checkBinary(which) {
    const { execFileSync } = require('child_process');
    const binPath = which === 'ffmpeg'
        ? getFfmpegPath()
        : which === 'ffprobe'
            ? getFfprobePath()
            : getYtDlpPath();
    const args = which === 'yt-dlp' ? ['--version'] : ['-version'];
    try {
        const out = execFileSync(binPath, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (which === 'yt-dlp') {
            return { ok: true, path: binPath, version: out.trim() };
        }
        const m = out.match(/version\s+([^\s]+)/);
        return { ok: true, path: binPath, version: m?.[1] };
    }
    catch (err) {
        return { ok: false, path: binPath, error: String(err?.message || err) };
    }
}
//# sourceMappingURL=binaries.js.map