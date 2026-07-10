"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScraper = getScraper;
exports.scrapeByPlatform = scrapeByPlatform;
const douyin_1 = require("./douyin");
const kuaishou_1 = require("./kuaishou");
const weixin_1 = require("./weixin");
/**
 * 小红书 PC 创作者后台已下线"热门话题"入口（热点数据只在手机 App 里），
 * 这里不挂 scraper，走 LLM 推测即可，避免 30s timeout。
 * —— 如果有一天 PC 重新开放，再把 new XiaohongshuScraper() 挂回来。
 */
const scrapers = {
    douyin: new douyin_1.DouyinScraper(),
    // xiaohongshu: new XiaohongshuScraper(),  // 已下线 PC 入口 — 2026/04 确认
    kuaishou: new kuaishou_1.KuaishouScraper(),
    weixin: new weixin_1.WeixinScraper(),
};
/** 是否支持登录态抓取（非 null 代表可抓） */
function getScraper(platform) {
    return scrapers[platform] || null;
}
/** 执行抓取；没 scraper 返回 ok:false 让上层走 LLM */
async function scrapeByPlatform(platform) {
    const s = getScraper(platform);
    if (!s) {
        return {
            ok: false,
            topics: [],
            errorType: 'unknown',
            errorMessage: `${platform} 无 scraper`,
        };
    }
    return s.run();
}
//# sourceMappingURL=index.js.map