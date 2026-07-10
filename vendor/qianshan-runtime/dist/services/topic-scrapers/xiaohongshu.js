"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaohongshuScraper = void 0;
/**
 * 小红书热点抓取 —— creator.xiaohongshu.com/creator/topic
 *
 * 同抖音：用"文字模式匹配"策略避开不稳的 class 名。
 * 锚点文案：
 *   - 强匹配："X.XX 万（浏览|讨论|笔记）" ——这是小红书卡片固定的 UI 文案
 *   - 兜底：裸"X.XX 万"附近出现 # 标签
 * 反爬较严：需要登录态 + 适当滚动触发懒加载
 */
const base_1 = require("./base");
const selectors_1 = require("./selectors");
class XiaohongshuScraper extends base_1.BaseTopicScraper {
    platform = 'xiaohongshu';
    targetUrl = 'https://creator.xiaohongshu.com/creator/topic';
    cookieDomain = '.xiaohongshu.com';
    probeUrl = 'https://creator.xiaohongshu.com/publish/publish';
    readySignal = `
    (() => {
      // 卡片里出现"X万浏览/讨论/笔记"任一即视为就绪
      return /[0-9.]+\\s*(万|w)\\s*(浏览|讨论|笔记)/i.test(document.body.innerText || '');
    })()
  `.trim();
    extractScript() {
        const categoryRegex = (0, selectors_1.buildCategoryRegex)('xiaohongshu');
        return `
      (async () => {
        // 懒加载：先滚一下触发列表渲染
        try {
          window.scrollBy(0, 800);
          await new Promise((r) => setTimeout(r, 500));
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) { /* noop */ }

        const out = [];
        const seen = new Set();
        // 强锚点：数字+单位+（浏览/讨论/笔记）
        const strictRe = /([0-9.]+)\\s*(万|w|亿|k)\\s*(浏览|讨论|笔记)/i;
        const all = document.querySelectorAll('div, span, a, li, p');

        for (const el of all) {
          if (el.children.length > 3) continue;
          const txt = (el.textContent || '').trim();
          if (txt.length > 80 || !strictRe.test(txt)) continue;

          // 向上找卡片
          let card = el.parentElement;
          for (let i = 0; i < 4 && card; i++) {
            const cardText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            if (cardText.length >= 5 && cardText.length <= 220 && strictRe.test(cardText)) break;
            card = card.parentElement;
          }
          if (!card) continue;

          const fullText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
          const match = fullText.match(strictRe);
          if (!match) continue;

          const n = parseFloat(match[1]);
          const unit = (match[2] || '').toLowerCase();
          let heat = 0;
          if (!isNaN(n)) {
            if (unit === '亿') heat = Math.round(n * 100000000);
            else if (unit === '万' || unit === 'w') heat = Math.round(n * 10000);
            else if (unit === 'k') heat = Math.round(n * 1000);
            else heat = Math.round(n);
          }

          // 标题 = 卡片文本去掉"X万浏览"部分，再去掉 # 前后缀和编号
          let title = fullText.replace(strictRe, '').trim();
          title = title.replace(/^#/, '').replace(/#$/, '').trim();
          title = title.replace(/^[0-9]+\\s*[.、]?\\s*/, '').trim();
          // 部分卡片会显示"XX人参与"之类的，去掉
          title = title.replace(/\\s*[0-9.]+\\s*(人|位)\\s*参与.*$/, '').trim();
          if (!title || title.length < 2 || title.length > 80) continue;
          if (seen.has(title)) continue;
          seen.add(title);

          const cat = fullText.match(${categoryRegex});
          const link = card.closest('a') || card.querySelector('a');
          const href = link ? link.href : 'https://creator.xiaohongshu.com/creator/topic';

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
exports.XiaohongshuScraper = XiaohongshuScraper;
//# sourceMappingURL=xiaohongshu.js.map