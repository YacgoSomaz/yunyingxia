"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuaishouScraper = void 0;
/**
 * 快手热点抓取 —— cp.kuaishou.com/articles/video_explore/inspiration_list
 *
 * 同抖音/小红书：用"文字模式匹配"策略。
 * 锚点文案：
 *   - 强匹配："热度 X万" / "X万播放" / "X万点赞" —— 快手灵感广场卡片的固定 UI
 *   - 兜底：裸"X万"（配合短文本长度过滤）
 */
const base_1 = require("./base");
const selectors_1 = require("./selectors");
class KuaishouScraper extends base_1.BaseTopicScraper {
    platform = 'kuaishou';
    targetUrl = 'https://cp.kuaishou.com/articles/video_explore/inspiration_list';
    cookieDomain = '.kuaishou.com';
    probeUrl = 'https://cp.kuaishou.com/profile';
    readySignal = `
    (() => {
      // 页面就绪：任一卡片显示热度/播放/点赞数字
      const body = document.body.innerText || '';
      return /热度\\s*[0-9.]+/.test(body) ||
             /[0-9.]+\\s*(万|w)\\s*(播放|点赞|观看|热度)/i.test(body) ||
             /[0-9.]+\\s*万/.test(body);
    })()
  `.trim();
    extractScript() {
        const categoryRegex = (0, selectors_1.buildCategoryRegex)('kuaishou');
        return `
      (async () => {
        // 灵感广场也会懒加载
        try {
          window.scrollBy(0, 600);
          await new Promise((r) => setTimeout(r, 400));
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) { /* noop */ }

        const out = [];
        const seen = new Set();
        // 三套锚点，按精确度从强到弱
        const reAnchored = /(?:热度|指数)\\s*[::]*\\s*([0-9.]+)\\s*(万|亿|w|k)?/i;
        const reWithUnit = /([0-9.]+)\\s*(万|亿|w|k)\\s*(播放|点赞|观看|次|热度)/i;
        const reBare = /([0-9.]+)\\s*(万|亿)/;
        const all = document.querySelectorAll('div, span, a, li, p');

        for (const el of all) {
          if (el.children.length > 3) continue;
          const txt = (el.textContent || '').trim();
          if (txt.length > 60) continue;
          const hit = reAnchored.exec(txt) || reWithUnit.exec(txt) || reBare.exec(txt);
          if (!hit) continue;

          // 向上找卡片（短文本 + 含热度 = 卡片）
          let card = el.parentElement;
          for (let i = 0; i < 4 && card; i++) {
            const cardText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            if (cardText.length >= 5 && cardText.length <= 180) break;
            card = card.parentElement;
          }
          if (!card) continue;

          const fullText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
          // 卡片文本再过一次 heat 匹配，取数字单位
          const matched = reAnchored.exec(fullText) || reWithUnit.exec(fullText) || reBare.exec(fullText);
          if (!matched) continue;

          const n = parseFloat(matched[1]);
          const unit = (matched[2] || '').toLowerCase();
          let heat = 0;
          if (!isNaN(n)) {
            if (unit === '亿') heat = Math.round(n * 100000000);
            else if (unit === '万' || unit === 'w') heat = Math.round(n * 10000);
            else if (unit === 'k') heat = Math.round(n * 1000);
            else heat = Math.round(n);
          }

          // 标题 = 文本去掉热度部分（任一 pattern 命中都擦掉）
          let title = fullText
            .replace(reAnchored, '')
            .replace(reWithUnit, '')
            .replace(reBare, '')
            .trim();
          title = title.replace(/^#/, '').replace(/#$/, '').trim();
          title = title.replace(/^[0-9]+\\s*[.、]?\\s*/, '').trim();
          if (!title || title.length < 2 || title.length > 80) continue;
          if (seen.has(title)) continue;
          seen.add(title);

          const cat = fullText.match(${categoryRegex});
          const link = card.closest('a') || card.querySelector('a');
          const href = link
            ? link.href
            : 'https://cp.kuaishou.com/articles/video_explore/inspiration_list';

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
exports.KuaishouScraper = KuaishouScraper;
//# sourceMappingURL=kuaishou.js.map