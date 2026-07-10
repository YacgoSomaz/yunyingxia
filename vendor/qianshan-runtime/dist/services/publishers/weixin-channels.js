"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeixinChannelsPublisher = void 0;
const base_1 = require("./base");
const browser_automation_1 = require("./browser-automation");
const logger_1 = require("../../utils/logger");
/**
 * 微信视频号发布器 —— 通过视频号助手网页版。
 *
 * 登录：https://channels.weixin.qq.com/  扫码（扫微信二维码，非公众号）
 * 发布：https://channels.weixin.qq.com/platform/post/create
 *   - 仅支持视频（视频号本身就是短视频平台）
 *   - 上传视频 → 填描述（带话题 #）→ 点发布
 *   - 注意：视频号封面必须和视频比例一致，默认会用首帧
 *
 * 注册 platform key 用 'weixin'（与现有 schema 保持一致）
 */
class WeixinChannelsPublisher extends base_1.PlatformPublisher {
    platform = 'weixin';
    platformLabel = '视频号';
    loginUrl = 'https://channels.weixin.qq.com/';
    cookieDomain = '.channels.weixin.qq.com';
    publishFields = [
        {
            key: 'description',
            label: '描述',
            type: 'textarea',
            required: true,
            maxLength: 1000,
            tip: '视频号没有独立标题字段，标题和描述合一；可在内文嵌 #话题',
        },
        { key: 'tags', label: '话题标签', type: 'tags', required: false, tip: '会以 #tag 形式拼到描述末尾' },
        // 视频号默认用首帧作封面，无需上传，故不声明封面字段
    ];
    publishEntryUrl() {
        return 'https://channels.weixin.qq.com/platform/post/create';
    }
    async performLogin(win) {
        // 扫码成功后跳到 /platform 或 /platform/post/list
        // 不能用广义 selector——登录页本身就渲染了头像占位
        await this.waitForLoginSuccess(win, {
            expectUrlPrefixes: [
                'https://channels.weixin.qq.com/platform/post',
                'https://channels.weixin.qq.com/platform/home',
                'https://channels.weixin.qq.com/platform/index',
                'https://channels.weixin.qq.com/platform/data',
                'https://channels.weixin.qq.com/platform/finder',
            ],
            timeoutMs: 180_000,
        });
        await new Promise((r) => setTimeout(r, 2000));
    }
    async performPublish(win, input) {
        if (input.contentType !== 'video') {
            return { ok: false, error: '视频号当前发布器仅支持视频（video）' };
        }
        const videoPath = input.mediaPaths?.[0];
        if (!videoPath)
            return { ok: false, error: '未提供视频文件路径' };
        // 让 wujie 子应用挂载（视频号 wujie 微前端，sub-app 在 Shadow Root 里）
        await new Promise((r) => setTimeout(r, 2500));
        // ★ 注入 Shadow DOM + iframe 双向遍历 walker —— 后续所有 DOM 查询走它
        await this.injectShadowWalker(win);
        // 1. 等 wujie sub-app 加载完成（file input 出现 via shadow walk，最多 60s）
        let inputFound = false;
        const inputDeadline = Date.now() + 60_000;
        while (Date.now() < inputDeadline) {
            const has = await (0, browser_automation_1.evaluate)(win, `!!window.__qsai_walker.findFirst('input[type="file"]')`);
            if (has) {
                inputFound = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
        // 不管找没找到都 dump 一份诊断
        const frameDump = await this.dumpAllFrames(win);
        logger_1.logger.info('[weixin-channels] === 全 frame 诊断 ===\n' +
            JSON.stringify(frameDump, null, 2).slice(0, 4000));
        if (!inputFound) {
            return { ok: false, error: 'wujie 子应用 60s 内未加载完（file input 在 Shadow DOM 里也找不到）' };
        }
        // 2. 注入文件：Shadow DOM 里的 input 没法用 CDP 的 nodeId 找，要用 objectId 路径
        await this.setFileInputViaObjectId(win, videoPath);
        logger_1.logger.info('[weixin-channels] 视频文件已注入（via objectId）');
        // 3. 等上传完成：发表按钮 disabled class 消失
        await (0, browser_automation_1.waitForCondition)(win, `(() => {
        const btns = window.__qsai_walker.findAll('button');
        const publishBtn = btns.find(b => /发表/.test(b.innerText || ''));
        if (!publishBtn) return false;
        const cls = (publishBtn.className || '').toString();
        return !/disabled|btn_disabled/i.test(cls)
          && publishBtn.getAttribute('disabled') === null
          && publishBtn.getAttribute('aria-disabled') !== 'true';
      })()`, { timeoutMs: 30 * 60_000, intervalMs: 2000 });
        logger_1.logger.info('[weixin-channels] 视频处理完成');
        // 4. 拼描述（标题+描述+标签 合一）
        //   注意 title 兜底逻辑：因为 DB 列 NOT NULL，service 把 description 前 50 字当 title 存进去了，
        //   所以 input.title 经常 = description 的前缀。这种情况下别再追加一次 title 进描述（会重复）。
        //   只有当 title 真的提供了 description 之外的信息时才前置追加。
        const descParts = [];
        const titleTrim = (input.title || '').trim();
        const descTrim = (input.description || '').trim();
        if (titleTrim && titleTrim !== descTrim && !descTrim.startsWith(titleTrim)) {
            descParts.push(titleTrim.slice(0, 22));
        }
        if (descTrim)
            descParts.push(descTrim);
        if (input.tags && input.tags.length) {
            descParts.push(input.tags.slice(0, 5).map((t) => `#${t}`).join(' '));
        }
        const fullDesc = descParts.join('\n').slice(0, 1000);
        // 5. 在 Shadow DOM 里找编辑器，focus + click
        const editorFound = await (0, browser_automation_1.evaluate)(win, `(() => {
        const ed = window.__qsai_walker.findFirst('div.input-editor')
                   || window.__qsai_walker.findFirst('[contenteditable="true"]');
        if (!ed) return false;
        ed.focus();
        ed.click && ed.click();
        return true;
      })()`);
        if (!editorFound) {
            return { ok: false, error: 'Shadow DOM 里也找不到描述编辑器' };
        }
        await new Promise((r) => setTimeout(r, 400));
        // 6. sendInputEvent 模拟真实键盘：焦点已在编辑器，输入事件会落到 Shadow DOM 内部
        for (const ch of fullDesc) {
            try {
                win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
            }
            catch { }
            await new Promise((r) => setTimeout(r, 30));
        }
        // 7. 字段已填好，等用户人工点击「发表」（与抖音一致行为，不等 URL 跳转）
        //    用户能在点击前检查标题/描述/标签是否符合预期
        logger_1.logger.info('[weixin-channels] 字段已填好，等用户手动点击「发表」按钮');
        return { ok: true, platformPostId: 'prefilled' };
    }
    /** 注入 Shadow DOM + same-origin iframe 双向递归遍历器到 window.__qsai_walker */
    async injectShadowWalker(win) {
        await win.webContents.executeJavaScript(`(() => {
        if (window.__qsai_walker) return;
        function walkAll(root, selector, out) {
          if (!root || !root.querySelectorAll) return;
          try { out.push(...root.querySelectorAll(selector)); } catch {}
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el && el.shadowRoot) walkAll(el.shadowRoot, selector, out);
          }
          const ifrs = root.querySelectorAll('iframe');
          for (const ifr of ifrs) {
            try { if (ifr.contentDocument) walkAll(ifr.contentDocument, selector, out); } catch {}
          }
        }
        function walkFirst(root, selector) {
          if (!root || !root.querySelectorAll) return null;
          const direct = root.querySelector(selector);
          if (direct) return direct;
          const all = root.querySelectorAll('*');
          for (const el of all) {
            if (el && el.shadowRoot) {
              const f = walkFirst(el.shadowRoot, selector);
              if (f) return f;
            }
          }
          const ifrs = root.querySelectorAll('iframe');
          for (const ifr of ifrs) {
            try {
              if (ifr.contentDocument) {
                const f = walkFirst(ifr.contentDocument, selector);
                if (f) return f;
              }
            } catch {}
          }
          return null;
        }
        window.__qsai_walker = {
          findFirst(selector) { return walkFirst(document, selector); },
          findAll(selector) { const out = []; walkAll(document, selector, out); return out; },
        };
      })()`, true);
    }
    /** 给 Shadow DOM 里的 file input 注入文件：用 objectId 路径绕开 nodeId 不穿 shadow 的限制 */
    async setFileInputViaObjectId(win, filePath) {
        const wc = win.webContents;
        let attached = false;
        try {
            try {
                wc.debugger.attach('1.3');
                attached = true;
            }
            catch (err) {
                if (!String(err).includes('already attached'))
                    throw err;
            }
            // 先在 JS 里把 input 放到 window 临时变量上
            const ok = await win.webContents.executeJavaScript(`(() => {
          const input = window.__qsai_walker.findFirst('input[type="file"]');
          if (!input) return false;
          window.__qsai_target_input = input;
          return true;
        })()`, true);
            if (!ok)
                throw new Error('Shadow DOM 里找不到 file input');
            // 用 Runtime.evaluate 拿临时变量的 objectId（不展开值）
            const evalRes = await wc.debugger.sendCommand('Runtime.evaluate', {
                expression: 'window.__qsai_target_input',
                returnByValue: false,
            });
            const objectId = evalRes?.result?.objectId;
            if (!objectId)
                throw new Error('拿不到 file input 的 objectId');
            // 用 objectId 喂给 setFileInputFiles（CDP 文档明确支持 objectId）
            await wc.debugger.sendCommand('DOM.setFileInputFiles', {
                objectId,
                files: [filePath],
            });
            // 清理临时引用
            try {
                await win.webContents.executeJavaScript('delete window.__qsai_target_input', true);
            }
            catch { }
        }
        finally {
            if (attached) {
                try {
                    wc.debugger.detach();
                }
                catch { }
            }
        }
    }
    /** 全 frame + Shadow DOM 诊断：视频号用 wujie 微前端，UI 在 Shadow Root 里 */
    async dumpAllFrames(win) {
        const mainFrame = win.webContents.mainFrame;
        if (!mainFrame)
            return [];
        const frames = mainFrame.framesInSubtree || [mainFrame];
        const result = [];
        for (let i = 0; i < frames.length; i++) {
            try {
                const probe = await frames[i].executeJavaScript(`(() => {
            // 递归遍历 Shadow DOM + same-origin iframe，找出指定 selector 的所有元素
            function findAll(selector) {
              const out = [];
              function walk(root) {
                if (!root || !root.querySelectorAll) return;
                try { out.push(...root.querySelectorAll(selector)); } catch {}
                const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
                for (const el of all) {
                  if (el && el.shadowRoot) walk(el.shadowRoot);
                }
                const ifrs = root.querySelectorAll ? root.querySelectorAll('iframe') : [];
                for (const ifr of ifrs) {
                  try { if (ifr.contentDocument) walk(ifr.contentDocument); } catch {}
                }
              }
              walk(document);
              return out;
            }
            const fileInputs = findAll('input[type="file"]');
            const inputEditors = findAll('div.input-editor');
            const contentEditables = findAll('[contenteditable="true"]');
            const allBtns = findAll('button');
            const publishBtns = allBtns.filter(b => /发表|发布/.test(b.innerText || ''));
            const wujieApps = findAll('wujie-app, [data-wujie-flag], #app[class*="finder"]');
            return {
              url: (window.location.href || '').slice(0, 100),
              fileInputs: fileInputs.length,
              fileInputDetails: fileInputs.slice(0, 3).map(el => ({
                accept: el.getAttribute('accept') || '',
                cls: (el.className || '').toString().slice(0, 60),
                inShadow: el.getRootNode() !== document,
              })),
              inputEditors: inputEditors.length,
              contentEditables: contentEditables.length,
              formBtns: findAll('div.form-btns button').length,
              publishBtnText: publishBtns.slice(0, 3).map(b => ({
                text: (b.innerText || '').slice(0, 20),
                cls: (b.className || '').toString().slice(0, 60),
              })),
              iframeChildren: document.querySelectorAll('iframe').length,
              wujieAppCount: wujieApps.length,
              loadingText: /页面初始化中|加载中/.test(document.body?.innerText || ''),
              bodySnippet: (document.body?.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 600),
            };
          })()`, true);
                result.push({ frameIdx: i, ...probe });
            }
            catch (e) {
                result.push({ frameIdx: i, error: String(e?.message || e).slice(0, 120) });
            }
        }
        return result;
    }
    // ─── 指标抓取：「动态列表」页 ───
    worksListUrl() {
        return 'https://channels.weixin.qq.com/platform/post/list';
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
          '[class*="post-item"], [class*="list-item"], [class*="feeds-item"], tr'
        ));
        const items = [];
        for (const c of cards) {
          const text = c.innerText || '';
          // 视频号的数据维度：播放 / 点赞 / 评论 / 分享（含在数据分析悬浮）
          if (!text.match(/播放|观看|点赞/)) continue;
          const titleEl = c.querySelector('[class*="desc"], [class*="title"], [class*="caption"], [class*="post-title"]');
          const title = (titleEl ? titleEl.innerText : text.split('\\n')[0] || '').trim().slice(0, 120);
          if (!title) continue;

          const pickAfter = (label) => {
            const re = new RegExp(label + '\\\\s*([0-9.]+[wWkK万千]?)');
            const mm = text.match(re);
            return mm ? parseNum(mm[1]) : 0;
          };
          const views = pickAfter('播放') || pickAfter('观看');
          const likes = pickAfter('点赞');
          const comments = pickAfter('评论');
          const shares = pickAfter('分享') || pickAfter('转发');
          if (views + likes + comments === 0) continue;
          items.push({
            title,
            views, likes, comments, shares,
          });
        }
        return items;
      })()`);
        logger_1.logger.info(`[weixin-channels] fetchMetrics 抓到 ${raw?.length || 0} 条作品`);
        return raw || [];
    }
}
exports.WeixinChannelsPublisher = WeixinChannelsPublisher;
//# sourceMappingURL=weixin-channels.js.map