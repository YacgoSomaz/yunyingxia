"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuaishouPublisher = void 0;
const base_1 = require("./base");
const browser_automation_1 = require("./browser-automation");
const logger_1 = require("../../utils/logger");
/**
 * 快手发布器 —— 通过快手创作者平台。
 *
 * 登录：https://cp.kuaishou.com/  扫码
 * 发布：https://cp.kuaishou.com/article/publish/video
 *   - 支持视频；图文在 /article/publish/image 单独的页面
 *   - 视频上传 → 等转码 → 填标题/简介/标签 → 点"发布"
 */
class KuaishouPublisher extends base_1.PlatformPublisher {
    platform = 'kuaishou';
    platformLabel = '快手';
    loginUrl = 'https://cp.kuaishou.com/';
    cookieDomain = '.kuaishou.com';
    publishFields = [
        { key: 'title', label: '标题', type: 'text', required: true, maxLength: 30 },
        { key: 'description', label: '描述', type: 'textarea', required: false, maxLength: 1000 },
        { key: 'tags', label: '标签', type: 'tags', required: false },
        {
            key: 'cover_vertical',
            label: '封面',
            type: 'image',
            required: false,
            imageSpec: { ratio: '3:4', width: 750, height: 1000 },
        },
    ];
    publishEntryUrl() {
        return 'https://cp.kuaishou.com/article/publish/video';
    }
    async performLogin(win) {
        // 快手登录成功跳到 /profile /article /home 之一
        // 不能用广义 selector——登录页本身就有 avatar 占位
        await this.waitForLoginSuccess(win, {
            expectUrlPrefixes: [
                'https://cp.kuaishou.com/profile',
                'https://cp.kuaishou.com/article',
                'https://cp.kuaishou.com/home',
                'https://cp.kuaishou.com/works',
                'https://cp.kuaishou.com/data',
            ],
            timeoutMs: 180_000,
        });
        await new Promise((r) => setTimeout(r, 2000));
    }
    async performPublish(win, input) {
        if (input.contentType !== 'video') {
            return { ok: false, error: '快手当前发布器仅支持视频（video）' };
        }
        const videoPath = input.mediaPaths?.[0];
        if (!videoPath)
            return { ok: false, error: '未提供视频文件路径' };
        // 1. 等 file input 出现
        await (0, browser_automation_1.waitForCondition)(win, `!!document.querySelector('input[type="file"]')`, { timeoutMs: 60_000 });
        await (0, browser_automation_1.setFileInput)(win, 'input[type="file"]', [videoPath]);
        logger_1.logger.info('[kuaishou] 视频文件已注入');
        // 2. 等转码完成：标题框可见 + 无"上传中/审核中"
        await (0, browser_automation_1.waitForCondition)(win, `(() => {
        const titleInput = document.querySelector('input[placeholder*="标题"], input[placeholder*="作品"]');
        if (!titleInput) return false;
        const busy = /上传中|处理中|转码中|上传失败/.test(document.body.innerText || '');
        return !busy;
      })()`, { timeoutMs: 30 * 60_000, intervalMs: 2000 });
        logger_1.logger.info('[kuaishou] 视频处理完成');
        // 3. 填标题（快手作品标题 ≤ 30 字）
        const title = (input.title || '').slice(0, 30);
        await (0, browser_automation_1.evaluate)(win, `(() => {
        const input = document.querySelector('input[placeholder*="标题"], input[placeholder*="作品"]');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(title)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
        // 4. 简介/描述（快手描述有的版本是 textarea，有的是 contenteditable）
        //    标签加到描述末尾
        const desc = (input.description || '') +
            (input.tags && input.tags.length ? ' ' + input.tags.map((t) => `#${t}`).join(' ') : '');
        if (desc) {
            await (0, browser_automation_1.evaluate)(win, `(() => {
          const ta = document.querySelector('textarea[placeholder*="描述"], textarea[placeholder*="简介"], [contenteditable="true"]');
          if (!ta) return;
          if (ta.tagName === 'TEXTAREA') {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            setter.call(ta, ${JSON.stringify(desc)});
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            ta.focus();
            document.execCommand('insertText', false, ${JSON.stringify(desc)});
          }
        })()`);
        }
        // 5. 字段已填好，等用户人工点击「发布」（与抖音一致行为，不等 URL 跳转）
        logger_1.logger.info('[kuaishou] 字段已填好，等用户手动点击「发布」');
        return { ok: true, platformPostId: 'prefilled' };
    }
    // ─── 指标抓取：「作品管理」页 ───
    worksListUrl() {
        return 'https://cp.kuaishou.com/article/manage/video';
    }
    async performFetchMetrics(win) {
        await (0, browser_automation_1.evaluate)(win, `(() => window.scrollTo(0, document.body.scrollHeight))()`);
        await new Promise((r) => setTimeout(r, 3000));
        const raw = await (0, browser_automation_1.evaluate)(win, `(() => {
        const parseNum = (s) => {
          if (!s) return 0;
          const t = String(s).trim();
          const n = parseFloat(t);
          if (isNaN(n)) return 0;
          if (/[wW万]/.test(t)) return Math.round(n * 10000);
          if (/[kK千]/.test(t)) return Math.round(n * 1000);
          return Math.round(n);
        };
        const cards = Array.from(document.querySelectorAll(
          '[class*="work-item"], [class*="video-item"], [class*="photo-item"], [class*="content-item"], tr'
        ));
        const items = [];
        for (const c of cards) {
          const text = c.innerText || '';
          if (!text.includes('播放') && !text.includes('点赞')) continue;
          const titleEl = c.querySelector('[class*="title"], [class*="caption"], [class*="name"]');
          const title = (titleEl ? titleEl.innerText : text.split('\\n')[0] || '').trim().slice(0, 120);
          if (!title) continue;
          const linkEl = c.querySelector('a[href*="/work/"], a[href*="/photo/"]');
          const href = linkEl ? linkEl.href : '';
          const m = href.match(/\\/(work|photo)\\/(\\d+)/);

          const pickAfter = (label) => {
            const re = new RegExp(label + '\\\\s*([0-9.]+[wWkK万千]?)');
            const mm = text.match(re);
            return mm ? parseNum(mm[1]) : 0;
          };
          const views = pickAfter('播放');
          const likes = pickAfter('点赞') || pickAfter('喜欢');
          const comments = pickAfter('评论');
          const shares = pickAfter('分享');
          if (views + likes + comments === 0) continue;
          items.push({
            title,
            platformPostId: m ? m[2] : undefined,
            url: href || undefined,
            views, likes, comments, shares,
          });
        }
        return items;
      })()`);
        logger_1.logger.info(`[kuaishou] fetchMetrics 抓到 ${raw?.length || 0} 条作品`);
        return raw || [];
    }
}
exports.KuaishouPublisher = KuaishouPublisher;
//# sourceMappingURL=kuaishou.js.map