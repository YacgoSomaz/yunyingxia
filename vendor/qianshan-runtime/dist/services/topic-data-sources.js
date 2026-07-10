"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_META = void 0;
exports.fetchWeiboHot = fetchWeiboHot;
exports.fetchBaiduHot = fetchBaiduHot;
exports.fetchZhihuHot = fetchZhihuHot;
exports.fetchBilibiliHot = fetchBilibiliHot;
exports.fetchWithLLM = fetchWithLLM;
exports.fetchByPlatform = fetchByPlatform;
/**
 * 选题雷达 · 数据源
 *
 * 分三类：
 *   real   : 调用公开接口/页面解析抓到的真实热搜
 *   llm    : 用 LLM 生成"近期高频话题"（抖音/小红书/B站 没有开放 API 的退路）
 *   mock   : 仅在完全离线时使用
 *
 * 所有拉取函数都返回统一的 Topic 候选结构，由 topic-radar.ts 负责存库。
 */
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0 Safari/537.36';
async function safeFetch(url, opts = {}) {
    return fetch(url, {
        ...opts,
        headers: {
            'User-Agent': UA,
            Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            ...(opts.headers || {}),
        },
        signal: AbortSignal.timeout(8000),
    });
}
// ═══════════════ 微博热搜 ═══════════════
// 公开接口：https://weibo.com/ajax/side/hotSearch 返回 JSON（要 Referer 才给）
async function fetchWeiboHot() {
    try {
        const res = await safeFetch('https://weibo.com/ajax/side/hotSearch', {
            headers: { Referer: 'https://weibo.com/' },
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = (await res.json());
        // 结构：{ data: { realtime: [{ word, num, category, label_name, ... }] } }
        const realtime = data?.data?.realtime || [];
        return realtime.slice(0, 30).map((item, i) => {
            const trend = item.icon_desc === '新' || item.label_name === '新'
                ? 'rising'
                : item.icon_desc === '热'
                    ? 'rising'
                    : 'stable';
            return {
                platform: 'weibo',
                keyword: String(item.word || '').trim(),
                heatScore: Number(item.num) || Math.max(10000 - i * 100, 100),
                category: item.category || item.label_name || null,
                trend,
                source: 'real',
                sourceUrl: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || '')}`,
                rawData: { flag: item.flag, label: item.label_name, icon: item.icon_desc },
            };
        }).filter((t) => t.keyword);
    }
    catch (err) {
        logger_1.logger.warn('[DataSource] weibo hot failed: ' + String(err));
        return [];
    }
}
// ═══════════════ 百度热搜（今日榜） ═══════════════
// 公开 JSON：https://top.baidu.com/api/board?platform=wise&tab=realtime
async function fetchBaiduHot() {
    try {
        const res = await safeFetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', { headers: { Referer: 'https://top.baidu.com/' } });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = (await res.json());
        // 结构：data.cards[0].content[0].content = [{word, url, hotTag, ...}, ...]
        const cards = data?.data?.cards || [];
        const innerContent = cards[0]?.content || [];
        const content = Array.isArray(innerContent[0]?.content)
            ? innerContent[0].content
            : Array.isArray(innerContent)
                ? innerContent
                : [];
        return content.slice(0, 30).map((item, i) => ({
            platform: 'baidu',
            keyword: String(item.word || item.query || '').trim(),
            heatScore: Number(item.hotScore) || Math.max(10000 - i * 100, 100),
            category: null,
            trend: (item.hotChange === 'up' ? 'rising' : item.hotChange === 'down' ? 'falling' : 'stable'),
            source: 'real',
            sourceUrl: item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || '')}`,
            rawData: { rawHot: item.hotScore, hotChange: item.hotChange },
        })).filter((t) => t.keyword);
    }
    catch (err) {
        logger_1.logger.warn('[DataSource] baidu hot failed: ' + String(err));
        return [];
    }
}
// ═══════════════ 知乎热榜 ═══════════════
// 公开 API：api.zhihu.com/topstory/hot-list（无需 cookie，带 UA + Referer 即可）
async function fetchZhihuHot() {
    try {
        const res = await safeFetch('https://api.zhihu.com/topstory/hot-list?limit=30&reverse_order=0', { headers: { Referer: 'https://www.zhihu.com/hot' } });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = (await res.json());
        const items = data?.data || [];
        return items.slice(0, 30).map((it, i) => {
            const target = it.target || {};
            const metricsText = it.detail_text || '';
            // "xxx 万热度" → 取数字 * 10000
            const heatMatch = metricsText.match(/(\d+(?:\.\d+)?)\s*万/);
            const heatScore = heatMatch
                ? Math.round(parseFloat(heatMatch[1]) * 10000)
                : Math.max(5000 - i * 50, 100);
            const apiUrl = target.url || '';
            return {
                platform: 'zhihu',
                keyword: String(target.title || '').trim(),
                heatScore,
                category: null,
                trend: 'stable',
                source: 'real',
                sourceUrl: apiUrl
                    ? apiUrl.replace('api.zhihu.com/questions', 'www.zhihu.com/question')
                    : `https://www.zhihu.com/search?q=${encodeURIComponent(target.title || '')}`,
                rawData: { detail: metricsText, excerpt: target.excerpt },
            };
        }).filter((t) => t.keyword);
    }
    catch (err) {
        logger_1.logger.warn('[DataSource] zhihu hot failed: ' + String(err));
        return [];
    }
}
// ═══════════════ B 站热门搜索 ═══════════════
// 公开 JSON：https://api.bilibili.com/x/web-interface/search/square
async function fetchBilibiliHot() {
    try {
        const res = await safeFetch('https://api.bilibili.com/x/web-interface/search/square?limit=30', { headers: { Referer: 'https://www.bilibili.com/' } });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = (await res.json());
        const trending = data?.data?.trending?.list || [];
        return trending.slice(0, 30).map((t, i) => ({
            platform: 'bilibili',
            keyword: String(t.keyword || t.show_name || '').trim(),
            heatScore: Number(t.heat_score) || Math.max(8000 - i * 80, 100),
            category: null,
            trend: (t.icon?.includes('HOT') || t.icon?.includes('NEW') ? 'rising' : 'stable'),
            source: 'real',
            sourceUrl: `https://search.bilibili.com/all?keyword=${encodeURIComponent(t.keyword || '')}`,
            rawData: { icon: t.icon },
        })).filter((t) => t.keyword);
    }
    catch (err) {
        logger_1.logger.warn('[DataSource] bilibili hot failed: ' + String(err));
        return [];
    }
}
// ═══════════════ LLM 猜"近期高频话题" ═══════════════
// 用于抖音/小红书等没有开放 API 的平台。清楚告知用户这是 LLM 推测。
async function fetchWithLLM(platform) {
    const promptByPlatform = {
        douyin: `列出最近一个月抖音自媒体博主高频创作的 15 个话题。每个话题从"时尚 美食 科技 家居 美妆 职场 旅行 育儿 健身 情感 游戏 搞笑 知识 生活技巧 商业"里选一个类别。`,
        xiaohongshu: `列出最近一个月小红书博主高频创作的 15 个话题。每个话题从"家居 美妆 穿搭 美食 母婴 好物 职场 旅行 护肤 减脂 情感 学习"里选一个类别。`,
        kuaishou: `列出最近一个月快手短视频创作者高频创作的 15 个话题。每个话题指定一个内容类别。`,
        weixin: `列出最近一个月公众号/视频号创作者高频创作的 15 个话题。每个话题指定一个内容类别。`,
    };
    const p = promptByPlatform[platform];
    if (!p)
        return [];
    const prompt = `${p}

严格按以下 JSON 数组格式返回，不要其他文字：
[
  { "keyword": "话题关键词（5-15字）", "category": "类别", "heat": 6000-9500 之间的整数, "trend": "rising|stable|falling" }
]`;
    try {
        const arr = await llm_1.llm.completeJSONWithScene('topic_analyze', '你是自媒体趋势分析师。', prompt);
        if (!Array.isArray(arr))
            return [];
        return arr.slice(0, 15).map((it, i) => ({
            platform,
            keyword: String(it.keyword || '').trim(),
            heatScore: Number(it.heat) || Math.max(8000 - i * 150, 500),
            category: it.category || null,
            trend: (['rising', 'stable', 'falling'].includes(it.trend) ? it.trend : 'stable'),
            source: 'llm',
        })).filter((t) => t.keyword);
    }
    catch (err) {
        logger_1.logger.warn(`[DataSource] LLM topics failed for ${platform}: ${String(err)}`);
        return [];
    }
}
// ═══════════════ 统一入口 ═══════════════
/**
 * 按平台获取热搜候选。
 * - 真实源走不同的函数
 * - 抖音/小红书等用 LLM
 */
async function fetchByPlatform(platform) {
    switch (platform) {
        case 'weibo':
            return fetchWeiboHot();
        case 'baidu':
            return fetchBaiduHot();
        case 'zhihu':
            return fetchZhihuHot();
        case 'bilibili':
            return fetchBilibiliHot();
        case 'douyin':
        case 'xiaohongshu':
        case 'kuaishou':
        case 'weixin':
            return fetchWithLLM(platform);
        default:
            return [];
    }
}
/** 支持的平台元数据（前端展示用） */
exports.PLATFORM_META = {
    weibo: { label: '微博', sourceType: 'real', note: '实时热搜（官方接口）' },
    baidu: { label: '百度', sourceType: 'real', note: '实时风云榜（官方接口）' },
    zhihu: { label: '知乎', sourceType: 'real', note: '热榜 Top 30（官方接口）' },
    bilibili: { label: 'B 站', sourceType: 'real', note: '搜索热词（官方接口）' },
    douyin: {
        label: '抖音',
        sourceType: 'scraper',
        note: '登录态抓取（创作灵感中心）；无账号/失败时降级 AI 推测',
    },
    xiaohongshu: {
        label: '小红书',
        sourceType: 'llm',
        note: 'PC 创作者后台不开放热门话题（只在手机 App）；用 AI 推测',
    },
    kuaishou: {
        label: '快手',
        sourceType: 'scraper',
        note: '登录态抓取（灵感广场）；无账号/失败时降级 AI 推测',
    },
    weixin: {
        label: '视频号/公众号',
        sourceType: 'scraper',
        note: '登录态抓取（发布页热点）；无账号/失败时降级 AI 推测',
    },
};
//# sourceMappingURL=topic-data-sources.js.map