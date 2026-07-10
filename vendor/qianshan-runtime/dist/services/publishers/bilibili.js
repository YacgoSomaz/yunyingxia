"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BilibiliPublisher = void 0;
const base_1 = require("./base");
const browser_automation_1 = require("./browser-automation");
const logger_1 = require("../../utils/logger");
/**
 * B 站发布器 —— 通过 creator 后台网页版发布。
 *
 * 登录：https://passport.bilibili.com/login  → 扫码后跳回，cookie 存在 .bilibili.com 域
 * 发布：https://member.bilibili.com/platform/upload/video/frame
 *   - 页面有 <input type="file"> 可注入本地视频
 *   - 上传完等待进度 100%
 *   - 填标题（默认取文件名，要清空重填）、简介、标签
 *   - 点"立即投稿"按钮
 *
 * Selector 是按 2026-04 时 B 站 creator 页面结构写的；平台改版时在这一个文件里修即可。
 */
class BilibiliPublisher extends base_1.PlatformPublisher {
    platform = 'bilibili';
    platformLabel = '哔哩哔哩';
    loginUrl = 'https://passport.bilibili.com/login';
    cookieDomain = '.bilibili.com';
    publishFields = [
        { key: 'title', label: '标题', type: 'text', required: true, maxLength: 80 },
        { key: 'description', label: '简介', type: 'textarea', required: false, maxLength: 2000 },
        {
            key: 'partition',
            label: '分区',
            type: 'select',
            required: true,
            // B 站官方分区有几十个，先放一组常用值；后续可以从 /x/web-interface/archive/typelist 拉真实分区
            options: [
                { value: 'tech', label: '科技' },
                { value: 'knowledge', label: '知识' },
                { value: 'life', label: '生活' },
                { value: 'game', label: '游戏' },
                { value: 'movie', label: '影视' },
                { value: 'music', label: '音乐' },
                { value: 'animal', label: '动物圈' },
                { value: 'food', label: '美食' },
            ],
            tip: '选填到对应分区可以提高曝光',
        },
        { key: 'tags', label: '标签', type: 'tags', required: false },
        {
            key: 'cover_horizontal',
            label: '封面',
            type: 'image',
            required: false,
            imageSpec: { ratio: '16:9', width: 1280, height: 720 },
        },
    ];
    publishEntryUrl() {
        return 'https://member.bilibili.com/platform/upload/video/frame';
    }
    async performLogin(win) {
        // B 站扫码成功会跳到 www.bilibili.com 或 space.bilibili.com
        // 也可通过 document.cookie 是否含 SESSDATA 判断
        await this.waitForLoginSuccess(win, {
            expectUrlPrefixes: [
                'https://www.bilibili.com/',
                'https://space.bilibili.com/',
                'https://member.bilibili.com/',
            ],
            timeoutMs: 180_000,
        });
        // 再等 2s 让 cookie 落地
        await new Promise((r) => setTimeout(r, 2000));
    }
    async performPublish(win, input) {
        if (input.contentType !== 'video') {
            return { ok: false, error: 'B 站当前发布器仅支持视频（video）' };
        }
        const videoPath = input.mediaPaths?.[0];
        if (!videoPath)
            return { ok: false, error: '未提供视频文件路径' };
        // 1. 等上传页面加载完毕（file input 出现）
        await (0, browser_automation_1.waitForCondition)(win, `!!document.querySelector('input[type="file"]')`, { timeoutMs: 60_000 });
        logger_1.logger.info('[bilibili] 上传页已就绪');
        // 2. 注入文件到 file input（首个 file input 即视频上传）
        await (0, browser_automation_1.setFileInput)(win, 'input[type="file"]', [videoPath]);
        logger_1.logger.info('[bilibili] 视频文件已注入');
        // 3. 等待上传完成。B 站上传进度条通常在 .upload-progress 或包含 "100%" 的元素里
        //    使用通用兜底：等待标题输入框变得可编辑（B 站只有上传完才允许编辑元信息）
        await (0, browser_automation_1.waitForCondition)(win, `(() => {
        const ti = document.querySelector('input[placeholder*="标题"], input[placeholder*="稿件"]');
        if (!ti) return false;
        // 标题框出现 + 页面上无"上传中"提示即可
        const uploading = /上传中|正在上传/.test(document.body.innerText || '');
        return !uploading;
      })()`, { timeoutMs: 30 * 60_000, intervalMs: 2000 });
        logger_1.logger.info('[bilibili] 视频上传完成');
        // 4. 清空默认标题并填入自定义标题
        await (0, browser_automation_1.evaluate)(win, `(() => {
        const input = document.querySelector('input[placeholder*="标题"], input[placeholder*="稿件"]');
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, ${JSON.stringify(input.title || '')});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
        // 5. 填简介（B 站简介框是 contenteditable div 或 textarea）
        //    contenteditable 路径下不能用 innerText = "..." —— React 不会被通知 → state 仍是空。
        //    改用 execCommand('insertText') 触发 input 事件链；textarea 路径用 nativeSetter 是 React 兼容写法。
        if (input.description) {
            await (0, browser_automation_1.evaluate)(win, `(() => {
          const ta = document.querySelector('textarea[placeholder*="简介"], [contenteditable="true"][data-placeholder*="简介"], [contenteditable="true"]');
          if (!ta) return;
          if (ta.tagName === 'TEXTAREA') {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(ta, ${JSON.stringify(input.description)});
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            ta.focus();
            // 全选清空 + execCommand 插入：触发 input 事件链，让 React 检测到改动
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(ta);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('delete', false);
            document.execCommand('insertText', false, ${JSON.stringify(input.description)});
          }
        })()`);
        }
        // 6. 填标签（逐个回车添加）
        if (input.tags && input.tags.length) {
            for (const tag of input.tags.slice(0, 10)) {
                await (0, browser_automation_1.evaluate)(win, `(() => {
            const input = document.querySelector('input[placeholder*="标签"]');
            if (!input) return;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, ${JSON.stringify(tag)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          })()`);
                await new Promise((r) => setTimeout(r, 300));
            }
        }
        // 7. 字段已填好，等用户人工点击「立即投稿」（与抖音一致行为，不等 URL 跳转）
        logger_1.logger.info('[bilibili] 字段已填好，等用户手动点击「立即投稿」');
        return { ok: true, platformPostId: 'prefilled' };
    }
    // ─── 指标抓取：走 B 站官方 JSON API（比 DOM 稳） ───
    worksListUrl() {
        // 打开稿件管理页。核心是让 cookie 生效，后续用 fetch 调同域 API
        return 'https://member.bilibili.com/platform/upload-manager/article';
    }
    async performFetchMetrics(win) {
        // 页面内发 fetch 同域调用：/x/web/archives?status=pubed&pn=1&ps=50
        // 返回已发布稿件列表，含播放/点赞/评论/投币/分享 (stat/view|like|reply|share)
        const raw = await (0, browser_automation_1.evaluate)(win, `(async () => {
        try {
          const resp = await fetch('https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=50', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
          });
          const j = await resp.json();
          return j;
        } catch (e) {
          return { error: String(e) };
        }
      })()`);
        if (!raw || raw.error) {
            logger_1.logger.warn('[bilibili] fetchMetrics JSON 接口失败: ' + (raw?.error || 'unknown'));
            return [];
        }
        const list = raw?.data?.arc_audits || raw?.data?.list || [];
        const out = [];
        for (const item of list) {
            const arc = item.Archive || item.archive || item;
            const stat = item.stat || arc.stat || {};
            const aid = arc.aid || arc.Aid;
            const title = arc.title || arc.Title || '';
            const publishedAt = arc.ptime
                ? new Date(arc.ptime * 1000).toISOString()
                : arc.pubdate
                    ? new Date(arc.pubdate * 1000).toISOString()
                    : undefined;
            out.push({
                title,
                platformPostId: aid ? `av${aid}` : undefined,
                url: aid ? `https://www.bilibili.com/video/av${aid}` : undefined,
                views: Number(stat.view || stat.play || 0),
                likes: Number(stat.like || 0),
                comments: Number(stat.reply || stat.comment || 0),
                shares: Number(stat.share || 0),
                publishedAt,
            });
        }
        logger_1.logger.info(`[bilibili] fetchMetrics 抓到 ${out.length} 条作品`);
        return out;
    }
}
exports.BilibiliPublisher = BilibiliPublisher;
//# sourceMappingURL=bilibili.js.map