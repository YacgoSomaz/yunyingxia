"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyStyleHint = applyStyleHint;
exports.searchVideos = searchVideos;
exports.searchImages = searchImages;
/**
 * 素材图片检索：Pexels + Unsplash 双通道
 *
 * - 只有 USE_MOCK=1 时才返回 Mock 占位图；真实模式不会伪造检索结果
 * - 有 key 时并发两个 provider，合并去重
 *
 * 设计演进：
 *   v1 含 Pixabay，但其库存与 Pexels 严重重叠，且相关性更差；且中文人物/场景对
 *   三家英文素材库都效果很差，现在 library 模式被严格限定在"纯空镜/物件/自然"，
 *   Pexels + Unsplash 已足够。故 v2 移除 Pixabay。
 */
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
const external_credentials_1 = require("./external-credentials");
/** 读 API key：优先用户在 Settings 里填的（DB），回落到 .env 里的 */
function resolveKey(provider) {
    const fromDb = external_credentials_1.externalCreds.get(provider);
    if (fromDb?.apiKey)
        return fromDb.apiKey;
    if (provider === 'pexels')
        return config_1.config.images.pexelsKey;
    if (provider === 'unsplash')
        return config_1.config.images.unsplashKey;
    return '';
}
/** 给关键词注入地域修饰（避免重复注入） */
function applyStyleHint(keywords, hint) {
    const lc = keywords.map((k) => k.toLowerCase());
    const hasChinese = lc.some((k) => /\b(chinese|asian|china)\b/.test(k));
    const hasJapanese = lc.some((k) => /\b(japanese|japan)\b/.test(k));
    switch (hint) {
        case 'chinese':
            return hasChinese ? keywords : ['chinese', ...keywords];
        case 'japanese':
            return hasJapanese ? keywords : ['japanese', ...keywords];
        case 'universal':
        case 'western':
        case 'auto':
        default:
            return keywords;
    }
}
/** 把 keywords 降级为更宽松的查询串（搜不到时逐级丢修饰词） */
function relaxKeywords(keywords) {
    const levels = [keywords.slice()];
    if (keywords.length >= 3)
        levels.push(keywords.slice(0, Math.max(2, keywords.length - 1)));
    if (keywords.length >= 2)
        levels.push(keywords.slice(0, 1));
    // 去重（按 joined string）
    const seen = new Set();
    return levels.filter((arr) => {
        const k = arr.join(' ');
        if (!k || seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}
/**
 * Pexels Videos：https://www.pexels.com/api/documentation/#videos
 * 每个 Video 有多个 video_files（不同分辨率/编码）
 * 我们挑出最适合竖版/横版目标分辨率的 mp4
 */
async function searchPexelsVideos(query, perPage, orientation = 'portrait') {
    const key = resolveKey('pexels');
    if (!key)
        return [];
    try {
        const u = new URL('https://api.pexels.com/videos/search');
        u.searchParams.set('query', query);
        u.searchParams.set('per_page', String(Math.max(1, Math.min(15, perPage))));
        u.searchParams.set('orientation', orientation);
        u.searchParams.set('size', 'medium'); // medium ~= 720p，平衡质量与下载速度
        const res = await fetch(u.toString(), { headers: { Authorization: key } });
        if (!res.ok) {
            logger_1.logger.warn(`[ImageSearch] pexels videos HTTP ${res.status}`);
            return [];
        }
        const data = (await res.json());
        const videos = data.videos || [];
        return videos
            .map((v) => {
            // 选最合适的 mp4 文件：优先 hd → sd
            const files = (v.video_files || []);
            const mp4s = files.filter((f) => f.file_type === 'video/mp4');
            if (mp4s.length === 0)
                return null;
            // 按宽高筛选：portrait 下优先宽高比 < 1 的
            const sorted = mp4s.sort((a, b) => {
                // 优先 quality=hd，其次 sd；再按 width 降序
                const rank = (f) => (f.quality === 'hd' ? 2 : f.quality === 'sd' ? 1 : 0);
                return rank(b) - rank(a) || (b.width || 0) - (a.width || 0);
            });
            // 避开超高分辨率（4K）—— 对桌面合成来说下载太慢
            const picked = sorted.find((f) => (f.width || 0) <= 1920 && (f.width || 0) >= 480) || sorted[0];
            if (!picked?.link)
                return null;
            return {
                source: 'pexels',
                thumbUrl: v.image || picked.link,
                videoUrl: picked.link,
                duration: Number(v.duration) || 5,
                width: picked.width || v.width || 0,
                height: picked.height || v.height || 0,
                credit: `Pexels / @${v.user?.name || 'unknown'}`,
            };
        })
            .filter(Boolean);
    }
    catch (err) {
        logger_1.logger.warn(`[ImageSearch] pexels videos failed: ${String(err)}`);
        return [];
    }
}
/**
 * 搜索视频素材。目前只用 Pexels（Pixabay videos 需要另一个接口，暂不做）。
 * 没 key 时返空，由上层决定是否回落到图片。
 *
 * @param keywords 搜索关键词
 * @param resolution 目标分辨率（用于决定 orientation）
 * @param count 返回候选数量
 * @param styleHint 画面风格
 */
async function searchVideos(keywords, resolution = '1080x1920', count = 3, styleHint = 'auto') {
    const styled = applyStyleHint(keywords, styleHint);
    const levels = relaxKeywords(styled.filter(Boolean));
    if (levels.length === 0)
        return [];
    const [w, h] = resolution.split('x').map(Number);
    const orientation = w < h ? 'portrait' : w > h ? 'landscape' : 'square';
    for (const lv of levels) {
        const query = lv.join(' ').trim();
        if (!query)
            continue;
        const r = await searchPexelsVideos(query, count, orientation);
        if (r.length > 0)
            return r;
    }
    return [];
}
const MOCK_COLORS = ['4f46e5', 'ea580c', '0891b2', '16a34a', 'db2777', '7c3aed', 'dc2626', 'ca8a04'];
function mockCandidates(keywords, count = 5) {
    const q = keywords.join(' ') || 'placeholder';
    return Array.from({ length: count }).map((_, i) => {
        const color = MOCK_COLORS[(q.length + i) % MOCK_COLORS.length];
        // placehold.co 默认返 SVG，ffmpeg 的 svg decoder 没启用；
        // 必须强制 PNG（格式通过扩展名指定）
        const url = `https://placehold.co/1080x1920/${color}/ffffff.png?text=${encodeURIComponent(q.slice(0, 20))}+%23${i + 1}`;
        return {
            source: 'mock',
            thumbUrl: url,
            fullUrl: url,
            credit: `Mock (${q})`,
            width: 1080,
            height: 1920,
        };
    });
}
async function searchUnsplash(query, perPage = 5) {
    const key = resolveKey('unsplash');
    if (!key)
        return [];
    try {
        const u = new URL('https://api.unsplash.com/search/photos');
        u.searchParams.set('query', query);
        u.searchParams.set('per_page', String(Math.max(1, Math.min(30, perPage))));
        u.searchParams.set('content_filter', 'high');
        const res = await fetch(u.toString(), {
            headers: { Authorization: `Client-ID ${key}` },
        });
        if (!res.ok) {
            logger_1.logger.warn(`[ImageSearch] unsplash HTTP ${res.status}`);
            return [];
        }
        const data = (await res.json());
        return (data.results || []).map((p) => ({
            source: 'unsplash',
            thumbUrl: p.urls?.small || p.urls?.thumb,
            fullUrl: p.urls?.regular || p.urls?.full,
            credit: `Unsplash / @${p.user?.username || 'unknown'}`,
            width: p.width,
            height: p.height,
        }));
    }
    catch (err) {
        logger_1.logger.warn(`[ImageSearch] unsplash failed: ${String(err)}`);
        return [];
    }
}
async function searchPexels(query, perPage = 5) {
    const key = resolveKey('pexels');
    if (!key)
        return [];
    try {
        const u = new URL('https://api.pexels.com/v1/search');
        u.searchParams.set('query', query);
        u.searchParams.set('per_page', String(Math.max(3, Math.min(80, perPage))));
        const res = await fetch(u.toString(), {
            headers: { Authorization: key },
        });
        if (!res.ok) {
            logger_1.logger.warn(`[ImageSearch] pexels HTTP ${res.status}`);
            return [];
        }
        const data = (await res.json());
        return (data.photos || []).map((p) => ({
            source: 'pexels',
            thumbUrl: p.src?.medium || p.src?.small,
            fullUrl: p.src?.large2x || p.src?.large || p.src?.original,
            credit: `Pexels / @${p.photographer || 'unknown'}`,
            width: p.width,
            height: p.height,
        }));
    }
    catch (err) {
        logger_1.logger.warn(`[ImageSearch] pexels failed: ${String(err)}`);
        return [];
    }
}
/**
 * 按关键词检索图片。有 key 时 Pexels + Unsplash 双通道并发；无 key 时真实模式报错。
 *
 * - styleHint：按画面风格给关键词前加地域修饰
 * - 关键词降级：所有 provider 都零结果时自动丢修饰词再试一轮
 *
 * @param keywords 搜索关键词（会用空格拼接）
 * @param perProvider 每个 provider 返回多少条
 * @param styleHint 画面风格
 */
async function searchImages(keywords, perProvider = 5, styleHint = 'auto') {
    const hasKey = !!(resolveKey('pexels') || resolveKey('unsplash'));
    if (!hasKey) {
        if (!config_1.USE_MOCK) {
            throw new Error('未配置图片搜索 API Key，请配置 PEXELS_API_KEY 或 UNSPLASH_ACCESS_KEY');
        }
        return mockCandidates(keywords, perProvider * 2);
    }
    const styled = applyStyleHint(keywords, styleHint);
    const levels = relaxKeywords(styled.filter(Boolean));
    for (const lv of levels) {
        const query = lv.join(' ').trim() || 'abstract';
        const [px, us] = await Promise.all([
            searchPexels(query, perProvider),
            searchUnsplash(query, perProvider),
        ]);
        // 交替合并
        const merged = [];
        const max = Math.max(px.length, us.length);
        for (let i = 0; i < max; i++) {
            if (px[i])
                merged.push(px[i]);
            if (us[i])
                merged.push(us[i]);
        }
        if (merged.length > 0) {
            // 去重（按 fullUrl）
            const seen = new Set();
            const dedup = merged.filter((c) => {
                if (seen.has(c.fullUrl))
                    return false;
                seen.add(c.fullUrl);
                return true;
            });
            if (dedup.length > 0)
                return dedup;
        }
        // 本级零结果，进入下一级更宽松关键词
    }
    // 所有级都空：真实模式不能伪造 mock 结果
    if (config_1.USE_MOCK) {
        return mockCandidates(keywords, perProvider * 2);
    }
    return [];
}
//# sourceMappingURL=image-search.js.map
