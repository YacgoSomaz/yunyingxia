"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaohongshuPublisher = void 0;
const base_1 = require("./base");
const browser_automation_1 = require("./browser-automation");
const logger_1 = require("../../utils/logger");
/**
 * 小红书发布器 —— 通过创作服务平台（creator.xiaohongshu.com）。
 *
 * 登录：https://creator.xiaohongshu.com/login  扫码后跳到 /creator-home
 * 发布：https://creator.xiaohongshu.com/publish/publish
 *   - 支持视频 / 图文（多图）
 *   - 视频：首个 <input type="file" accept="video"> 注入视频
 *   - 图文：首个 <input type="file" accept="image"> 注入图片（可多选）
 *   - 填标题 + 正文 + 标签（以 # 开头自动识别）
 *   - 点"发布"按钮
 */
class XiaohongshuPublisher extends base_1.PlatformPublisher {
    platform = 'xiaohongshu';
    platformLabel = '小红书';
    loginUrl = 'https://creator.xiaohongshu.com/login';
    cookieDomain = '.xiaohongshu.com';
    publishFields = [
        {
            key: 'title',
            label: '标题',
            type: 'text',
            required: true,
            maxLength: 20,
            tip: '小红书标题限 20 字，要短且有吸引力',
        },
        { key: 'description', label: '正文', type: 'textarea', required: false, maxLength: 1000 },
        {
            key: 'tags',
            label: '话题',
            type: 'tags',
            required: true,
            tip: '小红书强依赖话题标签获得流量',
        },
        {
            key: 'cover_vertical',
            label: '封面',
            type: 'image',
            required: false,
            imageSpec: { ratio: '3:4', width: 900, height: 1200 },
        },
    ];
    publishEntryUrl() {
        return 'https://creator.xiaohongshu.com/publish/publish?source=official';
    }
    async performLogin(win) {
        // 扫码成功跳到创作者中心首页
        await this.waitForLoginSuccess(win, {
            expectUrlPrefixes: [
                'https://creator.xiaohongshu.com/creator-home',
                'https://creator.xiaohongshu.com/new/home',
                'https://creator.xiaohongshu.com/publish',
            ],
            timeoutMs: 180_000,
        });
        await new Promise((r) => setTimeout(r, 2000));
    }
    async performPublish(win, input) {
        const mediaList = input.mediaPaths || [];
        if (mediaList.length === 0)
            return { ok: false, error: '未提供媒体文件' };
        const isVideo = input.contentType === 'video';
        const isImage = input.contentType === 'image' || input.contentType === 'article';
        // 1. 小红书发布页上方有 tab：「上传视频」/「上传图文」。需要先点对应 tab
        await (0, browser_automation_1.waitForCondition)(win, `!!document.querySelector('.creator-tab, [class*="publish"], .upload-content')`, { timeoutMs: 60_000 });
        // 选择 tab
        await (0, browser_automation_1.evaluate)(win, `(() => {
        const keyword = ${JSON.stringify(isVideo ? '视频' : '图文')};
        const tabs = Array.from(document.querySelectorAll('.creator-tab *, [class*="tab"] *, [role="tab"]'));
        const tab = tabs.find(el => (el.innerText || '').trim() === keyword || (el.innerText || '').includes(keyword));
        if (tab) (tab.closest('[role="tab"], .creator-tab, [class*="tab-item"]') || tab).click();
      })()`);
        await new Promise((r) => setTimeout(r, 1000));
        // 2. 等 file input 出现并注入文件
        await (0, browser_automation_1.waitForCondition)(win, `!!document.querySelector('input[type="file"]')`, { timeoutMs: 30_000 });
        await (0, browser_automation_1.setFileInput)(win, 'input[type="file"]', mediaList);
        logger_1.logger.info(`[xiaohongshu] 媒体文件已注入: ${mediaList.length} 个`);
        // 3. 等上传完成（标题输入框出现 + 没有"上传中"字样）
        await (0, browser_automation_1.waitForCondition)(win, `(() => {
        const titleInput = document.querySelector('input[placeholder*="标题"], .d-input input');
        if (!titleInput) return false;
        const uploading = /上传中|处理中|努力上传/.test(document.body.innerText || '');
        return !uploading;
      })()`, { timeoutMs: 30 * 60_000, intervalMs: 2000 });
        logger_1.logger.info('[xiaohongshu] 上传完成');
        // 4. 填标题（小红书标题 ≤ 20 字）
        const title = (input.title || '').slice(0, 20);
        await (0, browser_automation_1.evaluate)(win, `(() => {
        const input = document.querySelector('input[placeholder*="标题"], .d-input input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(title)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
        // 5. 填正文 + 标签（小红书正文框是 contenteditable）
        //    标签统一加到正文末尾 #tag1 #tag2 形式
        const bodyText = (input.description || '') +
            (input.tags && input.tags.length ? '\n' + input.tags.map((t) => `#${t}`).join(' ') : '');
        if (bodyText) {
            await (0, browser_automation_1.evaluate)(win, `(() => {
          const editor = document.querySelector('[contenteditable="true"], textarea[placeholder*="正文"]');
          if (!editor) return;
          if (editor.tagName === 'TEXTAREA') {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            setter.call(editor, ${JSON.stringify(bodyText)});
            editor.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            editor.focus();
            // 用 execCommand 插入，兼容 ProseMirror/Lexical 等富文本
            document.execCommand('insertText', false, ${JSON.stringify(bodyText)});
          }
        })()`);
        }
        // 6. 字段已填好，等用户人工点击「发布」（与抖音一致行为，不等 URL 跳转）
        logger_1.logger.info('[xiaohongshu] 字段已填好，等用户手动点击「发布」');
        return { ok: true, platformPostId: 'prefilled' };
    }
    // ─── 指标抓取：「笔记管理」页 DOM 抓 ───
    worksListUrl() {
        return 'https://creator.xiaohongshu.com/new/note-manager';
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
          '[class*="note-card"], [class*="list-item"], [class*="noteItem"], [class*="card-item"]'
        ));
        const items = [];
        for (const c of cards) {
          const text = c.innerText || '';
          const titleEl = c.querySelector('[class*="title"], [class*="name"], a[href*="/explore/"]');
          const title = (titleEl ? titleEl.innerText : text.split('\\n')[0] || '').trim().slice(0, 120);
          if (!title) continue;
          const linkEl = c.querySelector('a[href*="/explore/"], a[href*="/note/"]');
          const href = linkEl ? linkEl.href : '';
          const m = href.match(/\\/(explore|note)\\/([a-zA-Z0-9]+)/);

          // 小红书管理页一般展示：浏览/点赞/收藏/评论
          const pickAfter = (label) => {
            const re = new RegExp(label + '\\\\s*([0-9.]+[wWkK万千]?)');
            const mm = text.match(re);
            return mm ? parseNum(mm[1]) : 0;
          };
          const views = pickAfter('浏览') || pickAfter('观看');
          const likes = pickAfter('点赞');
          const comments = pickAfter('评论');
          const shares = pickAfter('收藏') || pickAfter('分享');
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
        logger_1.logger.info(`[xiaohongshu] fetchMetrics 抓到 ${raw?.length || 0} 条作品`);
        return raw || [];
    }
}
exports.XiaohongshuPublisher = XiaohongshuPublisher;
//# sourceMappingURL=xiaohongshu.js.map