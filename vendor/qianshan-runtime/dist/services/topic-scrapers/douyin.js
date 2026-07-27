"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DouyinScraper = void 0;
/**
 * 抖音热点抓取 —— creator.douyin.com/creator-micro/home
 *
 * 2026/04：老页面 /inspiration/home 被下线，"创作中心"模块内嵌到了
 * 创作者后台首页。class 名都是 Semi Design 风格（douyin-creator-pc-*），
 * 带 hash 后缀不稳定 → 用"文字模式匹配"策略：
 *   - readySignal: 页面 body 出现"热度 X万"即视为就绪
 *   - extractScript: 先尽量点到"热门话题"Tab，然后扫所有含热度文本的节点，
 *     向上找卡片容器，提取"标题 + 热度"。
 *
 * 优点：抖音只要保留"热度 X万"文案（这是 UI 语义，不轻易改），
 *       就不用动选择器；Semi 组件 hash 变了也无所谓。
 */
const base_1 = require("./base");
const selectors_1 = require("./selectors");
class DouyinScraper extends base_1.BaseTopicScraper {
    platform = 'douyin';
    targetUrl = 'https://creator.douyin.com/creator-micro/home';
    cookieDomain = '.douyin.com';
    cookieDomains = ['.douyin.com', 'douyin.com', '.creator.douyin.com', 'creator.douyin.com'];
    probeUrl = 'https://creator.douyin.com/creator-micro/home';
    readySignal = `
    (() => {
      // "创作中心"模块加载完成 → body 里会出现"热度 X万"这种文案
      return /热度\\s*[0-9.]+\\s*万/.test(document.body.innerText || '');
    })()
  `.trim();
    extractScript() {
        const categoryRegex = (0, selectors_1.buildCategoryRegex)('douyin');
        return `
      (async () => {
        // 1. 尽量切到"热门话题"Tab（比默认"猜你喜欢"更贴近选题场景）
        try {
          const tabs = document.querySelectorAll('[role="tab"], [class*="tabs-tab"]');
          const target = Array.from(tabs).find(
            (t) => (t.textContent || '').trim() === '热门话题',
          );
          if (target && !/active/.test(target.className || '')) {
            target.click();
            await new Promise((r) => setTimeout(r, 800));
          }
        } catch (e) { /* noop */ }

        // 2. 扫所有可能的"热度文本"节点，向上找卡片容器
        const out = [];
        const seen = new Set();
        const heatRe = /热度\\s*([0-9.]+)\\s*(万|亿|w|k)?/i;
        const all = document.querySelectorAll('div, span, a, li, p');

        for (const el of all) {
          if (el.children.length > 3) continue; // 过滤大容器
          const txt = (el.textContent || '').trim();
          if (txt.length > 50 || !heatRe.test(txt)) continue;

          // 向上走最多 4 层找卡片（含标题+热度的小块）
          let card = el.parentElement;
          for (let i = 0; i < 4 && card; i++) {
            const cardText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            if (cardText.length >= 10 && cardText.length <= 180 && heatRe.test(cardText)) break;
            card = card.parentElement;
          }
          if (!card) continue;

          const fullText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
          const match = fullText.match(heatRe);
          if (!match) continue;

          // 热度数值
          const n = parseFloat(match[1]);
          const unit = (match[2] || '').toLowerCase();
          let heat = 0;
          if (!isNaN(n)) {
            if (unit === '亿') heat = Math.round(n * 100000000);
            else if (unit === '万' || unit === 'w') heat = Math.round(n * 10000);
            else if (unit === 'k') heat = Math.round(n * 1000);
            else heat = Math.round(n);
          }

          // 标题 = 卡片文本去掉"热度 X万"部分，再去掉开头编号（"1"、"2."）
          let title = fullText.replace(heatRe, '').trim();
          title = title.replace(/^[0-9]+\\s*[.、]?\\s*/, '').trim();
          if (!title || title.length < 2 || title.length > 80) continue;
          if (seen.has(title)) continue;
          seen.add(title);

          const cat = fullText.match(${categoryRegex});
          const link = card.closest('a') || card.querySelector('a');
          const href = link ? link.href : 'https://creator.douyin.com/creator-micro/home';

          out.push({
            keyword: title,
            heatScore: heat,
            category: cat ? cat[1] : null,
            trend: 'stable',
            sourceUrl: href,
          });
          if (out.length >= 30) break;
        }
        return out;
      })()
    `.trim();
    }
}
exports.DouyinScraper = DouyinScraper;
//# sourceMappingURL=douyin.js.map
