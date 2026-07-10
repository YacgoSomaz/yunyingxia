"use strict";
/**
 * 内置 BGM 曲库的 CDN 配置
 *
 * 用户打开 BGM Tab 时会自动从这个 URL 拉取曲目目录（manifest.json），
 * 列表里的曲目是"云端目录"状态，用户点击 ⬇ 按需下载到本地。
 *
 * manifest.json 格式：
 *   {
 *     "version": 1,
 *     "tracks": [
 *       {
 *         "id": "calm-001",
 *         "title": "风",
 *         "artist": "Z治愈纯音乐",
 *         "duration": 157,
 *         "mood": "calm",           // calm/excited/cheerful/humorous/dramatic/serious
 *         "audioUrl": "https://your-bucket.oss-cn-xxx.aliyuncs.com/music/calm-001.mp3",
 *         "coverUrl": "https://your-bucket.oss-cn-xxx.aliyuncs.com/covers/calm-001.jpg"  // 可选
 *       }
 *     ]
 *   }
 *
 * OSS 建议目录结构：
 *   your-bucket/
 *     bgm-manifest.json        ← 曲目索引（公开读）
 *     music/
 *       calm-001.mp3
 *       excited-001.mp3
 *       ...
 *     covers/                  ← 可选，不填 coverUrl 就不用
 *       calm-001.jpg
 *       ...
 *
 * OSS 权限：bucket 设为"公共读"，或者 music/ 和 bgm-manifest.json 单独设公共读
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BGM_MANIFEST_URL = void 0;
exports.getEffectiveBgmManifestUrl = getEffectiveBgmManifestUrl;
// 千山 AI 官方内置曲库（阿里云 OSS 成都区）
// 8 首 CC BY 3.0 音乐，作者 Kevin MacLeod (incompetech.com)
// 覆盖情绪：calm / excited / cheerful / humorous
// 终端用户发视频时需署名："Music by Kevin MacLeod, incompetech.com, CC BY 3.0"
exports.DEFAULT_BGM_MANIFEST_URL = 'https://qianshan-ai.oss-cn-chengdu.aliyuncs.com/bgm-manifest.json';
/** 获取用户当前使用的 manifest URL：用户自定义 > 内置默认 */
function getEffectiveBgmManifestUrl(customUrl) {
    return (customUrl || '').trim() || exports.DEFAULT_BGM_MANIFEST_URL;
}
//# sourceMappingURL=bgm-cdn.js.map