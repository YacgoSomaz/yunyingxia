"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareXilingInputUrls = prepareXilingInputUrls;
/**
 * 百度曦灵照片数字人的输入素材准备。
 *
 * 照片数字人 submit 接口需要 inputImageUrl / inputAudioUrl 这类公网 URL。
 * 本地路径、localhost、127.0.0.1 都不能被百度服务端访问。
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const electron_1 = require("electron");
const logger_1 = require("../utils/logger");
const paths_1 = require("../utils/paths");
const binaries_1 = require("../utils/binaries");
const xiling_auth_1 = require("./xiling-auth");
const license_1 = require("./license");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const QIANSHAN_TEMP_UPLOAD_URL = 'https://www.qianshanai.cn/api/temp-assets/upload';
function netFetch(url, init) {
    return (electron_1.net?.fetch || fetch)(url, init);
}
async function prepareXilingInputUrls(args) {
    const { imagePath, audioPath, cfg } = args;
    if (!fs_1.default.existsSync(imagePath))
        throw new Error(`曦灵素材准备:image 文件不存在:${imagePath}`);
    if (!fs_1.default.existsSync(audioPath))
        throw new Error(`曦灵素材准备:audio 文件不存在:${audioPath}`);
    const workDir = path_1.default.join((0, paths_1.dataDir)('xiling-assets'), crypto_1.default.randomUUID());
    fs_1.default.mkdirSync(workDir, { recursive: true });
    const generatedFiles = [];
    try {
        const preparedImagePath = await prepareXilingImage(imagePath, workDir);
        const preparedAudioPath = await prepareXilingAudio(audioPath, workDir);
        if (preparedImagePath !== imagePath)
            generatedFiles.push(preparedImagePath);
        if (preparedAudioPath !== audioPath)
            generatedFiles.push(preparedAudioPath);
        let result;
        switch (cfg.uploadMode) {
            case 'xiling_file_upload_probe':
                result = await prepareViaXilingProbe(preparedImagePath, preparedAudioPath, cfg);
                break;
            case 'qianshan_temp_upload':
            case 'custom_public_asset':
                result = await prepareViaTempUploadEndpoint(preparedImagePath, preparedAudioPath, cfg);
                break;
            default:
                throw new Error(`曦灵素材准备:未知 uploadMode=${cfg.uploadMode}`);
        }
        const upstreamCleanup = result.cleanup;
        result.cleanup = async () => {
            await upstreamCleanup?.();
            cleanupFiles(generatedFiles, workDir);
        };
        return result;
    }
    catch (err) {
        cleanupFiles(generatedFiles, workDir);
        throw err;
    }
}
async function prepareXilingImage(inputPath, workDir) {
    // 曦灵图片要求更严格。统一转成 <=1920 长边的 jpg,避免用户上传 webp/bmp、
    // 大尺寸照片或超过 3MB 的 png 时被上游拒绝。
    const out = path_1.default.join(workDir, 'xiling-image.jpg');
    await execFileAsync((0, binaries_1.getFfmpegPath)(), [
        '-y',
        '-i',
        inputPath,
        '-vf',
        "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease",
        '-frames:v',
        '1',
        '-q:v',
        '3',
        out,
    ]);
    return out;
}
async function prepareXilingAudio(inputPath, workDir) {
    const ext = path_1.default.extname(inputPath).toLowerCase();
    const allowed = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
    if (allowed.includes(ext)) {
        return inputPath;
    }
    const out = path_1.default.join(workDir, 'xiling-audio.mp3');
    await execFileAsync((0, binaries_1.getFfmpegPath)(), [
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-b:a',
        '128k',
        out,
    ]);
    return out;
}
/**
 * 通用临时素材上传接口。
 *
 * 端点契约:
 *   POST {tempUploadUrl}
 *   multipart/form-data:
 *     - file: 文件
 *     - kind: image | audio
 *     - purpose: baidu_xiling
 *   headers:
 *     - Authorization: Bearer {tempUploadToken}  // 可选
 *   response:
 *     - { success: true, data: { url: "https://..." } }
 *     - 或 { url: "https://..." }
 */
async function prepareViaTempUploadEndpoint(imagePath, audioPath, cfg) {
    if (cfg.uploadMode === 'custom_public_asset' && !cfg.tempUploadUrl) {
        throw new Error('曦灵照片数字人需要 inputImageUrl/inputAudioUrl 公网 URL,请填写自定义公网素材接口 URL');
    }
    const [inputImageUrl, inputAudioUrl] = await Promise.all([
        uploadOneToTempEndpoint(imagePath, cfg, 'image'),
        uploadOneToTempEndpoint(audioPath, cfg, 'audio'),
    ]);
    return { inputImageUrl, inputAudioUrl };
}
async function uploadOneToTempEndpoint(localPath, cfg, kind) {
    const fileBuf = fs_1.default.readFileSync(localPath);
    const fileName = path_1.default.basename(localPath);
    if (cfg.uploadMode === 'qianshan_temp_upload') {
        const limitBytes = kind === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
        if (fileBuf.length > limitBytes) {
            throw new Error(`千山临时素材上传限制:${kind === 'image' ? '图片' : '音频'}不能超过` +
                `${kind === 'image' ? '10MB' : '50MB'},当前 ${(fileBuf.length / 1024 / 1024).toFixed(1)}MB`);
        }
    }
    const form = new FormData();
    form.append('file', new Blob([fileBuf], { type: guessMimeType(fileName, kind) }), fileName);
    form.append('kind', kind);
    form.append('purpose', 'baidu_xiling');
    const { uploadUrl, token } = resolveTempUploadEndpoint(cfg);
    const headers = {};
    if (token)
        headers.Authorization = `Bearer ${token}`;
    logger_1.logger.info(`[Xiling:asset-upload] mode=${cfg.uploadMode} ${kind} ${fileName} ` +
        `size=${(fileBuf.length / 1024).toFixed(1)}KB`);
    let res;
    try {
        res = await netFetch(uploadUrl, {
            method: 'POST',
            headers,
            body: form,
            signal: AbortSignal.timeout(120000),
        });
    }
    catch (err) {
        throw new Error(`临时素材上传网络异常(${kind}): ${String(err?.message || err)}`);
    }
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`临时素材上传失败 HTTP ${res.status}(${kind}): ${text.slice(0, 300)}`);
    }
    const publicUrl = extractPublicUrl(text);
    if (!publicUrl) {
        throw new Error(`临时素材上传响应中找不到公网 URL(${kind}): ${text.slice(0, 300)}`);
    }
    logger_1.logger.info(`[Xiling:asset-upload] ${kind} OK ${maskUrl(publicUrl)}`);
    return publicUrl;
}
function guessMimeType(fileName, kind) {
    const ext = path_1.default.extname(fileName).toLowerCase();
    const byExt = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
    };
    return byExt[ext] || (kind === 'image' ? 'image/jpeg' : 'audio/mpeg');
}
function resolveTempUploadEndpoint(cfg) {
    if (cfg.uploadMode === 'qianshan_temp_upload') {
        const accessToken = (0, license_1.getMemberInfo)()?.accessToken;
        if (typeof accessToken !== 'string' || !accessToken) {
            throw new Error('千山临时素材上传需要先登录千山账号');
        }
        return {
            uploadUrl: QIANSHAN_TEMP_UPLOAD_URL,
            token: accessToken,
        };
    }
    if (!cfg.tempUploadUrl) {
        throw new Error('请填写自定义公网素材接口 URL');
    }
    return {
        uploadUrl: cfg.tempUploadUrl,
        token: cfg.tempUploadToken,
    };
}
/**
 * 官方文件上传 probe。官方文档说明该接口主要返回 fileId,照片数字人 submit
 * 仍然要求 inputImageUrl/inputAudioUrl,所以这里只作为诊断兜底。
 */
async function prepareViaXilingProbe(imagePath, audioPath, cfg) {
    const [inputImageUrl, inputAudioUrl] = await Promise.all([
        uploadOneToXiling(imagePath, cfg, 'image'),
        uploadOneToXiling(audioPath, cfg, 'audio'),
    ]);
    return { inputImageUrl, inputAudioUrl };
}
async function uploadOneToXiling(localPath, cfg, kind) {
    const url = `${normalizeBaseUrl(cfg.baseUrl)}/api/digitalhuman/open/v1/file/upload`;
    const fileBuf = fs_1.default.readFileSync(localPath);
    const fileName = path_1.default.basename(localPath);
    const form = new FormData();
    form.append('file', new Blob([fileBuf]), fileName);
    form.append('providerType', 'PHOTO');
    form.append('fileType', kind === 'image' ? 'IMAGE' : 'AUDIO');
    form.append('sourceFileName', fileName);
    let res;
    try {
        res = await netFetch(url, {
            method: 'POST',
            headers: { Authorization: (0, xiling_auth_1.makeXilingAuth)(cfg.appId, cfg.appKey) },
            body: form,
            signal: AbortSignal.timeout(60000),
        });
    }
    catch (err) {
        throw new Error(`曦灵文件上传网络异常(${kind}): ${String(err?.message || err)}`);
    }
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`曦灵文件上传失败 HTTP ${res.status}(${kind}): ${text.slice(0, 300)}`);
    }
    const publicUrl = extractPublicUrl(text);
    if (publicUrl)
        return publicUrl;
    let json = null;
    try {
        json = JSON.parse(text);
    }
    catch {
        // handled below
    }
    const data = json?.result || json?.data || json;
    const fileId = data?.fileId || data?.file_id || data?.id;
    if (fileId) {
        throw new Error(`曦灵官方 file/upload 只返回 fileId=${fileId},照片数字人提交仍需要公网 URL。请把 uploadMode 切到 qianshan_temp_upload 并配置临时素材上传接口。`);
    }
    throw new Error(`曦灵文件上传响应中找不到公网 URL 或 fileId(${kind}): ${text.slice(0, 300)}`);
}
function extractPublicUrl(text) {
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        return /^https?:\/\//i.test(text.trim()) ? text.trim() : null;
    }
    const candidates = [
        json?.url,
        json?.publicUrl,
        json?.fileUrl,
        json?.signedUrl,
        json?.data,
        json?.data?.url,
        json?.data?.publicUrl,
        json?.data?.fileUrl,
        json?.data?.signedUrl,
        json?.result,
        json?.result?.url,
        json?.result?.publicUrl,
        json?.result?.fileUrl,
        json?.result?.signedUrl,
    ];
    const hit = candidates.find((v) => typeof v === 'string' && /^https?:\/\//i.test(v));
    return hit || null;
}
function cleanupFiles(files, dir) {
    for (const f of files) {
        try {
            if (fs_1.default.existsSync(f))
                fs_1.default.unlinkSync(f);
        }
        catch {
            // ignore
        }
    }
    try {
        if (fs_1.default.existsSync(dir) && fs_1.default.readdirSync(dir).length === 0)
            fs_1.default.rmdirSync(dir);
    }
    catch {
        // ignore
    }
}
function maskUrl(url) {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname.slice(0, 48)}${u.pathname.length > 48 ? '...' : ''}`;
    }
    catch {
        return url.slice(0, 80);
    }
}
function normalizeBaseUrl(baseUrl) {
    return (baseUrl || 'https://open.xiling.baidu.com').replace(/\/+$/, '');
}
//# sourceMappingURL=xiling-public-assets.js.map