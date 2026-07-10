"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoDownloader = exports.VideoDownloaderService = void 0;
/**
 * 视频下载器 —— 基于 yt-dlp
 *
 * 支持平台：抖音、B 站、YouTube、小红书、快手等 yt-dlp 支持的所有站点
 * 缓存策略：按 URL 的 sha1 做 key，同一个 URL 只下一次
 *
 * 用法：
 *   const r = await videoDownloader.download(url, { onProgress })
 *   // r = { filePath, title, duration, thumbnail, platform }
 */
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const binaries_1 = require("../utils/binaries");
const paths_1 = require("../utils/paths");
const logger_1 = require("../utils/logger");
function urlKey(url) {
    return crypto_1.default.createHash('sha1').update(url.trim()).digest('hex').slice(0, 12);
}
function cacheDir() {
    // dev → packages/main/data；prod → userData/data
    return (0, paths_1.dataDir)('video-rewrite-cache');
}
function detectPlatform(url) {
    const u = url.toLowerCase();
    if (u.includes('douyin.com') || u.includes('iesdouyin'))
        return 'douyin';
    if (u.includes('bilibili.com') || u.includes('b23.tv'))
        return 'bilibili';
    if (u.includes('youtube.com') || u.includes('youtu.be'))
        return 'youtube';
    if (u.includes('xiaohongshu.com') || u.includes('xhslink'))
        return 'xiaohongshu';
    if (u.includes('kuaishou.com') || u.includes('v.kuaishou'))
        return 'kuaishou';
    if (u.includes('weibo.com'))
        return 'weibo';
    return 'generic';
}
class VideoDownloaderService {
    /** 获取元信息（不下载） */
    async probe(url) {
        const ytdlp = (0, binaries_1.getYtDlpPath)();
        return new Promise((resolve, reject) => {
            const args = ['--dump-json', '--no-playlist', '--skip-download', url];
            const proc = (0, child_process_1.spawn)(ytdlp, args, { windowsHide: true });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d) => (stdout += d.toString()));
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error(`yt-dlp probe failed (${code}): ${stderr.slice(0, 500) || 'unknown'}`));
                }
                try {
                    const meta = JSON.parse(stdout);
                    resolve({
                        title: meta.title || meta.fulltitle || '未命名视频',
                        duration: Math.round(Number(meta.duration) || 0),
                        thumbnail: meta.thumbnail,
                        uploader: meta.uploader || meta.channel,
                        platform: detectPlatform(url),
                    });
                }
                catch (e) {
                    reject(new Error('解析视频元信息失败：' + String(e)));
                }
            });
        });
    }
    /** 下载视频到本地缓存（命中缓存则直接返回） */
    async download(url, opts = {}) {
        const key = urlKey(url);
        const dir = path_1.default.join(cacheDir(), key);
        fs_1.default.mkdirSync(dir, { recursive: true });
        // 缓存命中检测：有 meta.json + 视频文件 就复用
        const metaPath = path_1.default.join(dir, 'meta.json');
        if (fs_1.default.existsSync(metaPath)) {
            try {
                const cached = JSON.parse(fs_1.default.readFileSync(metaPath, 'utf8'));
                if (cached.filePath && fs_1.default.existsSync(cached.filePath)) {
                    opts.onProgress?.({ percent: 100, stage: '命中缓存', message: cached.title });
                    return { ...cached, cached: true };
                }
            }
            catch {
                /* fallthrough */
            }
        }
        opts.onProgress?.({ percent: 2, stage: '解析链接' });
        const probed = await this.probe(url).catch((e) => {
            throw new Error(`无法解析视频链接：${String(e?.message || e)}`);
        });
        opts.onProgress?.({ percent: 8, stage: `开始下载 · ${probed.title.slice(0, 30)}` });
        const ytdlp = (0, binaries_1.getYtDlpPath)();
        const ffmpegDir = path_1.default.dirname((0, binaries_1.getFfmpegPath)());
        // 格式选择
        let format = 'best[ext=mp4]/best';
        if (opts.quality === '720')
            format = 'best[height<=720][ext=mp4]/best[height<=720]';
        else if (opts.quality === '480')
            format = 'best[height<=480][ext=mp4]/best[height<=480]';
        const outTmpl = path_1.default.join(dir, 'video.%(ext)s');
        const args = [
            '--no-playlist',
            '--no-part',
            '-f', format,
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegDir,
            '--newline',
            '--progress',
            '-o', outTmpl,
            url,
        ];
        const finalPath = await new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(ytdlp, args, { windowsHide: true });
            let stderr = '';
            proc.stdout.on('data', (chunk) => {
                const line = chunk.toString();
                // [download]  12.3% of 25.00MiB at 1.23MiB/s ETA 00:15
                const m = line.match(/\[download\]\s+([\d.]+)%/);
                if (m) {
                    const pct = Math.min(90, 10 + Math.round(Number(m[1]) * 0.8));
                    opts.onProgress?.({ percent: pct, stage: '下载中', message: line.trim() });
                }
                else if (line.includes('Merging')) {
                    opts.onProgress?.({ percent: 92, stage: '合并音视频' });
                }
            });
            proc.stderr.on('data', (d) => (stderr += d.toString()));
            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error(`yt-dlp download failed (${code}): ${stderr.slice(-500) || 'unknown'}`));
                }
                // yt-dlp 会把实际文件命名为 video.mp4 / video.webm...
                const guesses = ['video.mp4', 'video.mkv', 'video.webm', 'video.m4v', 'video.flv'];
                for (const g of guesses) {
                    const full = path_1.default.join(dir, g);
                    if (fs_1.default.existsSync(full))
                        return resolve(full);
                }
                // 最后手段：scan dir
                const files = fs_1.default.readdirSync(dir).filter((f) => /\.(mp4|mkv|webm|m4v|flv|mov)$/i.test(f));
                if (files.length)
                    return resolve(path_1.default.join(dir, files[0]));
                reject(new Error('下载完成但找不到输出文件'));
            });
        });
        opts.onProgress?.({ percent: 95, stage: '保存元信息' });
        const result = {
            filePath: finalPath,
            title: probed.title,
            duration: probed.duration,
            thumbnail: probed.thumbnail,
            platform: probed.platform,
            uploader: probed.uploader,
            cached: false,
        };
        fs_1.default.writeFileSync(metaPath, JSON.stringify(result, null, 2));
        opts.onProgress?.({ percent: 100, stage: '完成' });
        logger_1.logger.info(`[Downloader] ${probed.platform} ${probed.title} → ${finalPath}`);
        return result;
    }
}
exports.VideoDownloaderService = VideoDownloaderService;
exports.videoDownloader = new VideoDownloaderService();
//# sourceMappingURL=video-downloader.js.map