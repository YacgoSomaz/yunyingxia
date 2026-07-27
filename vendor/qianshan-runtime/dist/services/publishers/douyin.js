"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DouyinPublisher = void 0;
const base_1 = require("./base");
const browser_automation_1 = require("./browser-automation");
const logger_1 = require("../../utils/logger");
/**
 * 抖音发布器 —— 通过抖音创作者中心。
 *
 * 登录：https://creator.douyin.com/  扫码后跳到 /creator-micro/home
 * 发布：https://creator.douyin.com/creator-micro/content/upload
 *   - 主流程只支持视频（抖音图文另有 /image-text 页，本版先走视频）
 *   - 上传视频 → 等转码完成 → 填标题（含话题）→ 点发布
 *   - 标题区域是 contenteditable div（和微信类似的 draft-js/富文本）
 */
class DouyinPublisher extends base_1.PlatformPublisher {
    platform = 'douyin';
    platformLabel = '抖音';
    loginUrl = 'https://creator.douyin.com/';
    cookieDomain = '.douyin.com';
    cookieDomains = ['.douyin.com', 'douyin.com', '.creator.douyin.com', 'creator.douyin.com'];
    publishFields = [
        {
            key: 'title',
            label: '标题',
            type: 'text',
            required: true,
            maxLength: 30,
            placeholder: '填写作品标题，为作品获得更多流量',
        },
        {
            key: 'description',
            label: '作品简介',
            type: 'textarea',
            required: false,
            maxLength: 1000,
            placeholder: '添加作品简介',
            tip: '支持 #话题 @好友，直接在文本里写即可',
        },
        {
            key: 'tags',
            label: '话题标签',
            type: 'tags',
            required: false,
            tip: '会拼入简介中，格式为 #标签',
        },
        {
            key: 'cover_vertical',
            label: '竖封面',
            type: 'image',
            required: false,
            imageSpec: { ratio: '3:4', width: 900, height: 1200 },
        },
        {
            key: 'cover_horizontal',
            label: '横封面',
            type: 'image',
            required: false,
            imageSpec: { ratio: '4:3', width: 1200, height: 900 },
        },
    ];
    publishEntryUrl() {
        return 'https://creator.douyin.com/creator-micro/content/upload';
    }
    isStillOnPublishArea(currentUrl) {
        if (!currentUrl || this.isExplicitLoginUrl(currentUrl))
            return false;
        try {
            const cur = new URL(currentUrl);
            if (cur.host !== 'creator.douyin.com')
                return false;
            return cur.pathname.startsWith('/creator-micro/');
        }
        catch {
            return false;
        }
    }
    async hasLoggedInPageSignal(win, currentUrl) {
        try {
            const cur = new URL(currentUrl || '');
            if (cur.host !== 'creator.douyin.com')
                return false;
            const text = await (0, browser_automation_1.evaluate)(win, `(() => (document.body.innerText || '').slice(0, 5000))()`);
            const body = String(text || '');
            const loginCue = /扫码登录|手机登录|验证码登录|登录后|请先登录|立即登录/.test(body);
            const workspaceCue = /发布作品|内容管理|作品管理|数据中心|互动管理|创作灵感|经营工具|工作台|创作者服务/.test(body);
            if (loginCue && !workspaceCue)
                return false;
            return workspaceCue || cur.pathname === '/' || cur.pathname.startsWith('/creator-micro');
        }
        catch {
            return false;
        }
    }
    async performLogin(win) {
        // 登录成功后抖音会跳到 /creator-micro/xxx 子路径
        // 注意：不能用 [class*="avatar"] 之类的广义选择器兜底——登录页本身也有这些元素
        await (0, browser_automation_1.waitForCondition)(win, `(() => {
      const url = window.location.href;
      const prefixes = [
        'https://creator.douyin.com/creator-micro/home',
        'https://creator.douyin.com/creator-micro/content',
        'https://creator.douyin.com/creator-micro/data',
        'https://creator.douyin.com/creator-micro/comment',
        'https://creator.douyin.com/creator-micro/',
      ];
      if (prefixes.some((prefix) => url.startsWith(prefix))) return true;
      const body = document.body.innerText || '';
      const loginCue = /扫码登录|手机登录|验证码登录|登录后|请先登录|立即登录/.test(body);
      const workspaceCue = /发布作品|内容管理|作品管理|数据中心|互动管理|创作灵感|经营工具|工作台|创作者服务/.test(body);
      if (loginCue && !workspaceCue) return false;
      return workspaceCue;
    })()`, { timeoutMs: 180_000, intervalMs: 1500 });
        await new Promise((r) => setTimeout(r, 2000));
    }
    async performPublish(win, input) {
        if (input.contentType !== 'video') {
            return { ok: false, error: '抖音当前发布器仅支持视频（video）' };
        }
        const videoPath = input.mediaPaths?.[0];
        if (!videoPath)
            return { ok: false, error: '未提供视频文件路径' };
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        // 1. 等 file input 出现，上传视频。抖音上传页里只有视频 input 是带 accept="video/*"
        await (0, browser_automation_1.waitForCondition)(win, `!!document.querySelector('input[type="file"]')`, { timeoutMs: 60_000 });
        // 优先选 accept 含 video 的，避免与封面 input 撞车
        const videoInputSelector = await (0, browser_automation_1.evaluate)(win, `(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
        const v = inputs.find(i => /video/i.test(i.accept || ''));
        if (v) return 'input[type="file"][accept*="video"]';
        return 'input[type="file"]';
      })()`);
        await (0, browser_automation_1.setFileInput)(win, videoInputSelector, [videoPath]);
        logger_1.logger.info('[douyin] 视频文件已注入: ' + videoInputSelector);
        // 2. 等"上传完成 + 处理完成"
        //    抖音的标题不一定是 <input>，semi-design 的 Input 在某些版本下渲染成 contenteditable div。
        //    所以 wait 条件用多重兜底信号，命中任一即认为表单可编辑：
        //      A. <input placeholder 含"标题"> 或 maxlength=30 的非 file input
        //      B. contenteditable 且 data-placeholder/placeholder 含"标题"
        //      C. 看到"0/30"计数器 + 任意 [class*="title"]（计数器只在表单 mount 后出现）
        //    上传中信号也收紧到只有"当前速度/剩余时间/上传失败"——"取消上传"在表单上一直存在
        await (0, browser_automation_1.waitForCondition)(win, `(() => {
        const text = document.body.innerText || '';
        if (/当前速度|剩余时间|上传失败|上传出错/.test(text)) return false;
        // A
        const inputTitle = Array.from(document.querySelectorAll('input')).find(i =>
          /标题/.test(i.placeholder || '') || (i.maxLength === 30 && i.type !== 'file')
        );
        if (inputTitle && !inputTitle.disabled && !inputTitle.readOnly) return true;
        // B
        const editorTitle = document.querySelector(
          '[contenteditable="true"][data-placeholder*="标题"], [contenteditable="true"][placeholder*="标题"]'
        );
        if (editorTitle) return true;
        // C
        if (document.querySelector('[class*="title" i]') && /0\\s*\\/\\s*30/.test(text)) return true;
        return false;
      })()`, { timeoutMs: 30 * 60_000, intervalMs: 2000 });
        logger_1.logger.info('[douyin] 上传 + 处理完成');
        await sleep(1500); // 让 React 状态稳定 + 表单完整 mount
        // 诊断快照：把页面里所有 input / contenteditable / "标题"相关元素都 log 出来，
        // 万一填表失败可直接对照实际 DOM 改选择器
        try {
            const snapshot = await (0, browser_automation_1.evaluate)(win, `(() => {
          const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
            type: i.type, placeholder: i.placeholder, maxLength: i.maxLength,
            disabled: i.disabled, readOnly: i.readOnly, value: i.value,
            cls: (i.className || '').slice(0, 80),
          }));
          const editors = Array.from(document.querySelectorAll('[contenteditable="true"]')).map(e => ({
            tag: e.tagName,
            cls: (e.className || '').slice(0, 80),
            placeholder: e.getAttribute('data-placeholder') || e.getAttribute('placeholder') || '',
            text: (e.innerText || '').slice(0, 40),
            parentText: (e.parentElement?.innerText || '').slice(0, 100),
          }));
          const titleAny = Array.from(document.querySelectorAll(
            '[placeholder*="标题"], [data-placeholder*="标题"], [class*="title" i]'
          )).slice(0, 8).map(e => ({
            tag: e.tagName,
            cls: (e.className || '').slice(0, 60),
            ph: e.getAttribute('placeholder') || e.getAttribute('data-placeholder') || '',
            ce: e.getAttribute('contenteditable') || '',
          }));
          return { inputs, editors, titleAny };
        })()`);
            logger_1.logger.info('[douyin] DOM snapshot: ' + JSON.stringify(snapshot));
        }
        catch {
            /* ignore */
        }
        // 3. 填标题（可能是 <input> 也可能是 contenteditable，按实际 DOM 选）
        //    填值统一走 webContents.insertText —— OS IME 通道，对 input/contenteditable 都生效
        const title = (input.title || '').slice(0, 30);
        // 焦聚标题元素并返回类型，供后续读回校验用
        const focusTitle = async () => {
            return await (0, browser_automation_1.evaluate)(win, `(() => {
          // 先 input
          const inputs = Array.from(document.querySelectorAll('input'));
          const inputT = inputs.find(i => /标题/.test(i.placeholder || ''))
            || inputs.find(i => i.maxLength === 30 && i.type !== 'file');
          if (inputT && !inputT.disabled && !inputT.readOnly) {
            inputT.scrollIntoView({ block: 'center' });
            inputT.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            inputT.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            inputT.click();
            inputT.focus();
            try { inputT.select(); } catch (e) {}
            return document.activeElement === inputT ? 'input' : 'not-focused';
          }
          // 再 contenteditable
          const editorT = document.querySelector(
            '[contenteditable="true"][data-placeholder*="标题"], [contenteditable="true"][placeholder*="标题"]'
          );
          if (editorT) {
            editorT.scrollIntoView({ block: 'center' });
            editorT.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            editorT.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            editorT.click();
            editorT.focus();
            // 选中已有内容（让 Delete 清空）
            const range = document.createRange();
            range.selectNodeContents(editorT);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return (document.activeElement === editorT || editorT.contains(document.activeElement))
              ? 'editor' : 'not-focused';
          }
          return 'not-found';
        })()`);
        };
        // sendInputEvent / insertText 走 OS IME 通道，需要窗口处于前台
        try {
            win.show();
            win.focus();
            win.webContents.focus();
        }
        catch { }
        await sleep(150);
        const focusRes = await focusTitle();
        if (focusRes === 'input' || focusRes === 'editor') {
            logger_1.logger.info('[douyin] 标题元素类型: ' + focusRes);
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
            await sleep(80);
            await win.webContents.insertText(title);
            await sleep(500);
        }
        else {
            logger_1.logger.warn('[douyin] 未能聚焦标题元素: ' + focusRes);
        }
        // 校验：input 用 .value，contenteditable 用 .innerText
        const titleVal = await (0, browser_automation_1.evaluate)(win, `(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const inputT = inputs.find(i => /标题/.test(i.placeholder || ''))
          || inputs.find(i => i.maxLength === 30 && i.type !== 'file');
        if (inputT) return inputT.value;
        const editorT = document.querySelector(
          '[contenteditable="true"][data-placeholder*="标题"], [contenteditable="true"][placeholder*="标题"]'
        );
        return editorT ? (editorT.innerText || '').replace(/\\n/g, '') : '';
      })()`);
        logger_1.logger.info('[douyin] 标题填入结果: value=' + JSON.stringify(titleVal) + ' want=' + JSON.stringify(title));
        if (titleVal !== title) {
            logger_1.logger.warn('[douyin] 标题不匹配，重试 1 次');
            await sleep(800);
            const r2 = await focusTitle();
            if (r2 === 'input' || r2 === 'editor') {
                win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
                win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
                await sleep(80);
                await win.webContents.insertText(title);
                await sleep(400);
            }
        }
        await sleep(400);
        // 4. 填描述（contenteditable，maxlength 1000）+ 标签
        //    抖音支持在描述里用 #话题，自动化下拉选择不稳，直接拼 #tag 文本
        const tagText = input.tags && input.tags.length
            ? ' ' + input.tags.slice(0, 5).map((t) => `#${t}`).join(' ')
            : '';
        const desc = (input.description || '').slice(0, 1000 - tagText.length);
        const fullDesc = (desc + tagText).slice(0, 1000);
        if (fullDesc) {
            const focusDesc = async () => {
                return await (0, browser_automation_1.evaluate)(win, `(() => {
            const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'));
            if (!editors.length) return 'no-editor';
            // 描述编辑器特征：父级附近文本含"简介/添加话题/@好友/1000"
            const descEditor = editors.find(e => {
              const ph = e.getAttribute('data-placeholder') || '';
              const around = (e.parentElement?.innerText || '') + (e.previousElementSibling?.innerText || '');
              return /简介|添加话题|@好友|\\/\\s*1000/.test(ph + ' ' + around);
            }) || editors[editors.length - 1];
            if (!descEditor) return 'no-desc-editor';
            descEditor.scrollIntoView({ block: 'center' });
            descEditor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            descEditor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            descEditor.click();
            descEditor.focus();
            // 选中整段，让后续 Delete 键清空已有内容
            const range = document.createRange();
            range.selectNodeContents(descEditor);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return document.activeElement === descEditor || descEditor.contains(document.activeElement) ? 'ok' : 'not-focused';
          })()`);
            };
            try {
                win.show();
                win.focus();
                win.webContents.focus();
            }
            catch { }
            await sleep(150);
            const dRes = await focusDesc();
            if (dRes === 'ok') {
                win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
                win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
                await sleep(80);
                // insertText 走 IME 通道，Lexical/Slate 都会触发自己的 onChange
                await win.webContents.insertText(fullDesc);
                await sleep(600);
            }
            else {
                logger_1.logger.warn('[douyin] 未能聚焦描述编辑器: ' + dRes);
            }
            const descVal = await (0, browser_automation_1.evaluate)(win, `(() => {
          const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'));
          const e = editors.find(x => {
            const ph = x.getAttribute('data-placeholder') || '';
            const around = (x.parentElement?.innerText || '') + (x.previousElementSibling?.innerText || '');
            return /简介|添加话题|@好友|\\/\\s*1000/.test(ph + ' ' + around);
          }) || editors[editors.length - 1];
          return e ? (e.innerText || '').slice(0, 200) : '';
        })()`);
            logger_1.logger.info('[douyin] 描述填入结果: got=' + JSON.stringify(descVal.slice(0, 60)) + ' wantLen=' + fullDesc.length);
            await sleep(400);
        }
        // 5. 封面上传：通过 file chooser 拦截方式（让 React onChange 真实触发，避免"上传了又没了"的状态丢失）
        //    抖音的真实交互链：发布页只显示封面预览卡片 → 点击它打开「封面编辑弹窗」 →
        //    弹窗里是「设置竖封面 / 设置横封面」两个 Tab → 切到目标 Tab → 点「+ 上传封面」按钮 →
        //    file chooser 注入 → 等上传完成 → 点底部「完成」按钮关闭弹窗。
        const verticalCover = input.platformFields?.cover_vertical;
        const horizontalCover = input.platformFields?.cover_horizontal;
        // 两个封面字段都没传时，用 legacy coverPath（按竖封面尝试）
        const fallbackCover = !verticalCover && !horizontalCover ? input.coverPath : undefined;
        /** 检测封面编辑弹窗是否打开 */
        const isCoverModalOpen = async () => {
            return await (0, browser_automation_1.evaluate)(win, `(() => {
          const t = document.body.innerText || '';
          return t.includes('设置竖封面') || t.includes('设置横封面');
        })()`);
        };
        /**
         * 单次封面上传：5 步流程，全程用 CDP 坐标点击（不走 DOM .click() / dispatchEvent，
         * 避免 React 合成事件钩子层级深时触发不到的问题）。
         */
        const uploadDouyinCover = async (file, type) => {
            const keyword = type === 'vertical' ? '竖封面' : '横封面';
            const tabKeyword = type === 'vertical' ? '设置竖封面' : '设置横封面';
            try {
                // ═══ Step 1: 点封面预览区，打开封面编辑弹窗 ═══
                if (!(await isCoverModalOpen())) {
                    // —— 调试：先列出发布页上所有含"封面"文字的元素 + 截图，定位是文案变了还是 walk-up 走偏 ——
                    const debugInfo = await (0, browser_automation_1.evaluate)(win, `(() => {
              const all = [...document.querySelectorAll('*')];
              const matches = all.filter(e => {
                const t = (e.innerText || '').trim();
                if (e.closest('[class*="modal" i], [class*="dialog" i], [class*="drawer" i]')) return false;
                return t.includes('封面') && t.length > 0 && t.length < 50;
              }).slice(0, 15);
              return matches.map(e => {
                const r = e.getBoundingClientRect();
                let cs = '';
                try { cs = window.getComputedStyle(e).cursor; } catch (err) {}
                return '<' + e.tagName + ' class="' + (e.className||'').toString().slice(0, 50)
                  + '" cursor=' + cs + ' w=' + Math.round(r.width) + ' h=' + Math.round(r.height)
                  + '> "' + (e.innerText || '').trim().slice(0, 30) + '"';
              }).join('\\n');
            })()`);
                    logger_1.logger.info('[douyin] 封面区域 DOM 调试 (top 15):\n' + debugInfo);
                    const shotBefore = await (0, browser_automation_1.captureScreenshot)(win, 'cover-step1-before');
                    if (shotBefore)
                        logger_1.logger.info('[douyin] Step1 前截图: ' + shotBefore);
                    // 找含"竖封面/横封面/设置封面"的元素 → 沿父链找真正可点击的卡片（cursor:pointer 或 ≥80×80）
                    const previewRect = await (0, browser_automation_1.getElementRect)(win, `(() => {
              const all = [...document.querySelectorAll('div, span, p, button')];
              const textEl = all.find(e => {
                const t = (e.innerText || '').trim();
                if (t.length === 0 || t.length > 30) return false;
                if (e.closest('[class*="modal" i], [class*="dialog" i], [class*="drawer" i]')) return false;
                return t.includes(${JSON.stringify(keyword)}) || t.includes('设置封面');
              });
              if (!textEl) return null;
              let cur = textEl;
              for (let i = 0; i < 8 && cur; i++) {
                let cursor = '';
                try { cursor = window.getComputedStyle(cur).cursor || ''; } catch (e) {}
                const r = cur.getBoundingClientRect();
                if (cursor === 'pointer' || (r.width >= 80 && r.height >= 80)) {
                  return cur;
                }
                cur = cur.parentElement;
              }
              return textEl;
            })()`);
                    if (!previewRect) {
                        logger_1.logger.warn('[douyin] 找不到封面预览区域: ' + keyword);
                        return;
                    }
                    logger_1.logger.info(`[douyin] CDP 点封面预览区(${keyword}): ${JSON.stringify(previewRect)}`);
                    await (0, browser_automation_1.cdpClick)(win, previewRect.x, previewRect.y);
                    await sleep(3000); // 等弹窗打开动画
                    const shotAfter = await (0, browser_automation_1.captureScreenshot)(win, `cover-${type}-step1-after-click`);
                    if (shotAfter)
                        logger_1.logger.info('[douyin] Step1 点击后截图: ' + shotAfter);
                    // ═══ Step 2: 等弹窗里的"设置竖/横封面"文字出现 ═══
                    const modalReady = await (0, browser_automation_1.waitForCondition)(win, `(() => {
              const text = document.body.innerText || '';
              return text.includes('设置竖封面') || text.includes('设置横封面');
            })()`, { timeoutMs: 10_000, intervalMs: 500 })
                        .then(() => true)
                        .catch(() => false);
                    if (!modalReady) {
                        logger_1.logger.warn('[douyin] 封面编辑弹窗未打开，跳过 ' + keyword);
                        return;
                    }
                    logger_1.logger.info('[douyin] 封面编辑弹窗已打开');
                }
                // ═══ Step 3: 切到对应 Tab（设置竖封面 / 设置横封面） ═══
                const tabRect = await (0, browser_automation_1.getElementRect)(win, `(() => {
            const all = [...document.querySelectorAll('div, span, button, [role="tab"]')];
            const textEl = all.find(e => {
              const t = (e.innerText || '').trim();
              return t === ${JSON.stringify(tabKeyword)};
            });
            if (!textEl) return null;
            // 沿父链找单个 Tab：必须可点击（cursor:pointer / button / role=tab）
            // **且宽度 ≤ 200** —— 避免匹配到整条 Tab 栏的 cursor:pointer 外壳（实测会撞到 1120 宽容器）
            let cur = textEl;
            for (let i = 0; i < 6 && cur; i++) {
              let cursor = '';
              try { cursor = window.getComputedStyle(cur).cursor || ''; } catch (e) {}
              const role = (cur.getAttribute && cur.getAttribute('role')) || '';
              const r = cur.getBoundingClientRect();
              const isClickable = cursor === 'pointer' || cur.tagName === 'BUTTON' || role === 'tab' || role === 'button';
              const isSingleTab = r.width >= 40 && r.height >= 20 && r.width <= 200;
              if (isClickable && isSingleTab) return cur;
              cur = cur.parentElement;
            }
            return textEl;
          })()`);
                if (tabRect) {
                    await (0, browser_automation_1.cdpClick)(win, tabRect.x, tabRect.y);
                    logger_1.logger.info(`[douyin] CDP Tab 切换(${tabKeyword}): ${JSON.stringify(tabRect)}`);
                    await sleep(1000);
                    const shotTab = await (0, browser_automation_1.captureScreenshot)(win, `cover-${type}-step3-tab-switched`);
                    if (shotTab)
                        logger_1.logger.info('[douyin] Step3 Tab 切换后截图: ' + shotTab);
                }
                else {
                    logger_1.logger.warn('[douyin] 找不到 Tab: ' + tabKeyword);
                }
                // ═══ Step 4: 触发文件选择器 + 注入 ═══
                // —— 诊断 + 必要时分辨率兜底放大 ——
                // 抖音对封面图有最低分辨率要求（之前曾报"图片分辨率需大于1000×752"）。
                // 我们的竖封面 spec 是 900×1200（宽 < 1000），抖音收到后可能静默拒绝并退回视频帧，
                // 表现为"上传链路全通但 UI 显示黑图"。所以宽度不足 1080 时本地 sharp 放大到 1080。
                let uploadFile = file;
                try {
                    const sharp = require('sharp');
                    const fs2 = require('fs');
                    const stat = fs2.existsSync(file) ? fs2.statSync(file) : null;
                    const meta = await sharp(file).metadata();
                    logger_1.logger.info(`[douyin] 准备上传${keyword}: file="${file}" w=${meta.width} h=${meta.height} format=${meta.format} bytes=${stat?.size || 'N/A'}`);
                    if ((meta.width || 0) < 1080) {
                        const resizedPath = file.replace(/(\.\w+)$/, '_resized$1');
                        await sharp(file).resize({ width: 1080 }).toFile(resizedPath);
                        uploadFile = resizedPath;
                        const newMeta = await sharp(uploadFile).metadata();
                        logger_1.logger.info(`[douyin] ${keyword} 宽度 ${meta.width} < 1080，已 sharp 放大到 ${newMeta.width}×${newMeta.height} → ${resizedPath}`);
                    }
                }
                catch (err) {
                    logger_1.logger.warn(`[douyin] 读取/放大${keyword}失败: ${err}`);
                }
                // 优先：CDP 坐标点击"上传封面"按钮，让抖音 React 状态机走完整 onClick → 弹文件框 → 注入 → onChange 流程。
                // 失败回退：直接 input.click()（绕过按钮，但能跳过状态机走 file chooser 拦截）。
                // 注：之前默认是 input.click()，日志显示文件被拦截但抖音 UI 渲染成黑图——因为没经过按钮的状态机，
                //     React 没把上传任务挂上，文件等于白传。
                //
                // 定位策略：**从弹窗内的 input[type="file"] 出发往上走**，而不是从"上传封面"文字出发。
                // 之前用文字匹配 + walk-up 的方式，会撞到包含视频帧缩略图的外层容器，中心坐标点到视频帧上，
                // 选了一帧视频画面当封面。从 file input 出发可保证在同一个 React 组件子树内，找到的是真按钮。
                const uploadBtnRect = await (0, browser_automation_1.getElementRect)(win, `(() => {
            // 1. 找可见的封面编辑弹窗（含"设置"+"封面"文案的）
            const modals = [...document.querySelectorAll('[class*="modal" i], [class*="dialog" i], [role="dialog"], [class*="drawer" i]')];
            const modal = modals.find(m => {
              if (m.offsetParent === null) return false;
              const t = m.innerText || '';
              return t.includes('设置') && t.includes('封面');
            });
            if (!modal) return null;

            // 2. 弹窗里的 file input
            const input = modal.querySelector('input[type="file"][accept*="image"]');
            if (!input) return null;

            // 3. 从 input 往上走，找第一个可见的、cursor:pointer 的小按钮容器（"+ 上传封面"按钮）
            let cur = input.parentElement;
            for (let i = 0; i < 6 && cur && cur !== modal; i++) {
              const r = cur.getBoundingClientRect();
              let cursor = '';
              try { cursor = window.getComputedStyle(cur).cursor || ''; } catch (e) {}
              if (r.width > 0 && r.height > 0 && r.width < 300 && cursor === 'pointer') {
                return cur;
              }
              cur = cur.parentElement;
            }
            // 4. 兜底：input 直接父级（通常就是 label 或 wrap div，包含按钮视觉）
            return input.parentElement;
          })()`);
                // 诊断：log 按钮坐标 + 截图，便于核实点的是真按钮还是视频帧
                logger_1.logger.info(`[douyin] "上传封面"按钮位置 (${keyword}): ${JSON.stringify(uploadBtnRect)}`);
                const shotBeforeUploadClick = await (0, browser_automation_1.captureScreenshot)(win, `cover-${type}-before-upload-click`);
                if (shotBeforeUploadClick)
                    logger_1.logger.info('[douyin] 上传按钮点击前截图: ' + shotBeforeUploadClick);
                // 诊断：列出弹窗内所有 file input，定位"我们注入的是哪个 input、还有没有其它"
                const fileInputsInfo = await (0, browser_automation_1.evaluate)(win, `(() => {
            const modals = [...document.querySelectorAll('[class*="modal" i], [class*="dialog" i], [role="dialog"], [class*="drawer" i]')];
            const modal = modals.find(m => {
              if (m.offsetParent === null) return false;
              const t = m.innerText || '';
              return t.includes('设置') && t.includes('封面');
            });
            if (!modal) return 'no visible cover modal';
            const inputs = [...modal.querySelectorAll('input[type="file"]')];
            return inputs.map((inp, i) => {
              const r = inp.getBoundingClientRect();
              const pr = inp.parentElement ? inp.parentElement.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
              const pcls = (inp.parentElement && inp.parentElement.className || '').toString().slice(0, 60);
              return '[' + i + '] accept="' + (inp.accept || '') + '"'
                + ' cls="' + (inp.className || '').toString().slice(0, 60) + '"'
                + ' inputBox=' + Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.x) + ',' + Math.round(r.y)
                + ' parentBox=' + Math.round(pr.width) + 'x' + Math.round(pr.height) + '@' + Math.round(pr.x) + ',' + Math.round(pr.y)
                + ' parentCls="' + pcls + '"';
            }).join('\\n');
          })()`);
                logger_1.logger.info('[douyin] 弹窗内 file input 列表 (' + keyword + '):\n' + fileInputsInfo);
                // —— JS 层 File 注入（替代 CDP file chooser 拦截）——
                //
                // 之前的 CDP 方式：Page.setInterceptFileChooserDialog + DOM.setFileInputFiles。
                // 表面上 fileChooserOpened 收到了、文件也注入到 backendNodeId 上了，但抖音 UI 仍渲染黑图。
                // 原因：抖音的 file input 是 React 临时挂载的——点按钮瞬间 React 创建 input 并 click，
                // 弹 file chooser 后立刻销毁。底层文件注入成功，但 React 没把这个 input 和上传任务挂上钩。
                //
                // 新方案：在页面 JS 里拦截 HTMLInputElement.prototype.click。当 React 对 image file input
                // 调 .click() 时，不弹文件框，直接用 DataTransfer + new File(base64) 塞进去并 dispatch change。
                // React 的 onChange handler 拿到的是真 File 对象，与用户手动选文件等价。
                const fs2 = require('fs');
                const path2 = require('path');
                const imgBuf = fs2.readFileSync(uploadFile);
                const base64 = imgBuf.toString('base64');
                const fileName = path2.basename(uploadFile);
                const mimeType = /\.jpe?g$/i.test(uploadFile) ? 'image/jpeg' :
                    /\.webp$/i.test(uploadFile) ? 'image/webp' : 'image/png';
                logger_1.logger.info(`[douyin] JS 注入${keyword}: name="${fileName}" mime=${mimeType} base64Len=${base64.length}`);
                // 1. 在页面挂拦截器（点击触发时一次性接管 file input）
                const installed = await (0, browser_automation_1.evaluate)(win, `(() => {
            window.__coverBase64__ = ${JSON.stringify(base64)};
            window.__coverFileName__ = ${JSON.stringify(fileName)};
            window.__coverMime__ = ${JSON.stringify(mimeType)};

            // 重复挂载时先还原
            if (window.__origInputClick__) {
              HTMLInputElement.prototype.click = window.__origInputClick__;
            }
            window.__origInputClick__ = HTMLInputElement.prototype.click;
            window.__coverInjected__ = false;

            HTMLInputElement.prototype.click = function() {
              if (!window.__coverInjected__ && this.type === 'file' && (this.accept || '').includes('image')) {
                try {
                  const b64 = window.__coverBase64__;
                  const bin = atob(b64);
                  const arr = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                  const blob = new Blob([arr], { type: window.__coverMime__ });
                  const file = new File([blob], window.__coverFileName__, {
                    type: window.__coverMime__,
                    lastModified: Date.now(),
                  });
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  this.files = dt.files;
                  this.dispatchEvent(new Event('change', { bubbles: true }));
                  // 拦一次就够，恢复 prototype
                  window.__coverInjected__ = true;
                  HTMLInputElement.prototype.click = window.__origInputClick__;
                  delete window.__origInputClick__;
                  delete window.__coverBase64__;
                  delete window.__coverFileName__;
                  delete window.__coverMime__;
                  return;
                } catch (e) {
                  // 注入失败时回退到原 click
                }
              }
              return window.__origInputClick__.call(this);
            };
            return 'interceptor installed';
          })()`);
                logger_1.logger.info('[douyin] ' + keyword + ' 拦截器: ' + installed);
                // 2. CDP 点"上传封面"按钮 → React 内部会 input.click() → 被拦截器接管
                if (!uploadBtnRect) {
                    logger_1.logger.warn(`[douyin] 找不到"上传封面"按钮，清理拦截器，跳过 ${keyword}`);
                    await (0, browser_automation_1.evaluate)(win, `(() => {
            if (window.__origInputClick__) {
              HTMLInputElement.prototype.click = window.__origInputClick__;
              delete window.__origInputClick__;
            }
            delete window.__coverBase64__;
            delete window.__coverFileName__;
            delete window.__coverMime__;
            delete window.__coverInjected__;
          })()`);
                    return;
                }
                await (0, browser_automation_1.cdpClick)(win, uploadBtnRect.x, uploadBtnRect.y);
                logger_1.logger.info(`[douyin] CDP 点击上传按钮 btnAt=${JSON.stringify(uploadBtnRect)}`);
                await sleep(3000); // 等 React 处理 onChange + 上传
                // 3. 验证拦截是否真的命中了
                const injected = await (0, browser_automation_1.evaluate)(win, `(() => !!window.__coverInjected__)()`);
                if (injected) {
                    logger_1.logger.info(`[douyin] ${keyword} JS 注入成功（onChange 已触发）`);
                }
                else {
                    logger_1.logger.warn(`[douyin] ${keyword} 拦截器未命中，可能按钮点击没让 React 触发 input.click()`);
                    // 清理拦截器，避免影响下一次
                    await (0, browser_automation_1.evaluate)(win, `(() => {
            if (window.__origInputClick__) {
              HTMLInputElement.prototype.click = window.__origInputClick__;
              delete window.__origInputClick__;
            }
            delete window.__coverBase64__;
            delete window.__coverFileName__;
            delete window.__coverMime__;
            delete window.__coverInjected__;
          })()`);
                }
                // ═══ Step 5: 等上传完成 + 点"完成"关弹窗 ═══
                await sleep(2500);
                const shotUpload = await (0, browser_automation_1.captureScreenshot)(win, `cover-${type}-step4-after-upload`);
                if (shotUpload)
                    logger_1.logger.info('[douyin] Step4 上传后截图: ' + shotUpload);
                const finishRect = await (0, browser_automation_1.getElementRect)(win, `(() => {
            const all = [...document.querySelectorAll('button, div[role="button"], span')];
            return all.find(e => {
              const t = (e.innerText || '').trim();
              return t === '完成' && !e.disabled;
            }) || null;
          })()`);
                if (finishRect) {
                    await (0, browser_automation_1.cdpClick)(win, finishRect.x, finishRect.y);
                    logger_1.logger.info(`[douyin] CDP 点"完成": ${JSON.stringify(finishRect)}`);
                    // 等弹窗真关闭（"设置竖封面/横封面"文案从页面消失）。竖封面"完成"后抖音还在异步把
                    // 文件上传到 CDN，弹窗状态可能延迟才关；2s 固定 sleep 不稳，所以用 waitForCondition。
                    try {
                        await (0, browser_automation_1.waitForCondition)(win, `(() => {
                const t = document.body.innerText || '';
                return !t.includes('设置竖封面') && !t.includes('设置横封面');
              })()`, { timeoutMs: 10_000, intervalMs: 500 });
                        logger_1.logger.info('[douyin] 封面弹窗已关闭');
                    }
                    catch {
                        logger_1.logger.warn('[douyin] 等弹窗关闭超时（10s 内仍可见"设置竖/横封面"文案）');
                    }
                    await sleep(2000); // 关闭后再给状态机一段稳定缓冲（CDN 上传 + React 状态回写）
                    const shotFinish = await (0, browser_automation_1.captureScreenshot)(win, `cover-${type}-step5-after-finish`);
                    if (shotFinish)
                        logger_1.logger.info('[douyin] Step5 完成后截图: ' + shotFinish);
                }
                else {
                    logger_1.logger.warn('[douyin] 找不到"完成"按钮');
                }
            }
            catch (err) {
                const msg = String(err?.message || err);
                const stack = err?.stack
                    ? String(err.stack).split('\n').slice(0, 3).join(' | ')
                    : '';
                logger_1.logger.warn(`[douyin] ${keyword} 上传失败，继续发布: msg="${msg}" stack="${stack}" file="${file}"`);
                // 失败兜底：尝试关弹窗，避免影响下一张
                try {
                    const closeRect = await (0, browser_automation_1.getElementRect)(win, `(() => {
              const all = [...document.querySelectorAll('button, [class*="close" i], [aria-label*="close" i], [aria-label*="关闭"]')];
              return all.find(e => {
                const t = (e.innerText || '').trim();
                return t === '取消' || t === '×' || t === 'X' || /close/i.test((e.className || '').toString());
              }) || null;
            })()`);
                    if (closeRect) {
                        await (0, browser_automation_1.cdpClick)(win, closeRect.x, closeRect.y);
                    }
                }
                catch {
                    /* ignore */
                }
                await sleep(500);
            }
        };
        if (verticalCover)
            await uploadDouyinCover(verticalCover, 'vertical');
        if (horizontalCover)
            await uploadDouyinCover(horizontalCover, 'horizontal');
        if (fallbackCover)
            await uploadDouyinCover(fallbackCover, 'vertical');
        // 6. 不再自动点击"发布"按钮 —— 字段已填好，把最后的提交动作留给用户。
        //    这样既不必和抖音的发布后跳转逻辑斗（pushState/location 都不用拦），
        //    用户也能在点击前自行检查标题/简介/封面/合集等字段是否符合预期。
        logger_1.logger.info('[douyin] 字段已填好，等用户手动点击「发布」按钮');
        return {
            ok: true,
            platformPostId: 'prefilled',
        };
    }
    // ─── 指标抓取：打开「作品管理」页，DOM 抓取卡片数据 ───
    worksListUrl() {
        return 'https://creator.douyin.com/creator-micro/content/manage';
    }
    async performFetchMetrics(win) {
        // 让页面滚到懒加载完成；再等 3s
        await (0, browser_automation_1.evaluate)(win, `(() => window.scrollTo(0, document.body.scrollHeight))()`);
        await new Promise((r) => setTimeout(r, 3000));
        const raw = await (0, browser_automation_1.evaluate)(win, `(() => {
        // 抖音作品管理卡片通常有 data-e2e 或 class 包含 'content-item'
        // 兜底：匹配所有含"播放"+"点赞"的子块
        const cards = Array.from(document.querySelectorAll('[class*="content-item"], [class*="video-card"], [data-e2e*="item"]'));
        const parseNum = (s) => {
          if (!s) return 0;
          const t = String(s).trim();
          const n = parseFloat(t);
          if (isNaN(n)) return 0;
          if (/[wW万]/.test(t)) return Math.round(n * 10000);
          if (/[kK千]/.test(t)) return Math.round(n * 1000);
          return Math.round(n);
        };
        const items = [];
        for (const c of cards) {
          const text = c.innerText || '';
          // 标题：卡片里最显眼的文字块
          const titleEl = c.querySelector('[class*="title"], [class*="name"], a[href*="/video/"]');
          const title = (titleEl ? titleEl.innerText : text.split('\\n')[0] || '').trim().slice(0, 120);
          if (!title) continue;
          const linkEl = c.querySelector('a[href*="/video/"]');
          const href = linkEl ? linkEl.href : '';
          const m = href.match(/\\/video\\/(\\d+)/);

          // 匹配"播放/点赞/评论/分享"形如 "播放 1.2w"
          const pickAfter = (label) => {
            const re = new RegExp(label + '\\\\s*([0-9.]+[wWkK万千]?)');
            const mm = text.match(re);
            return mm ? parseNum(mm[1]) : 0;
          };
          const views = pickAfter('播放');
          const likes = pickAfter('点赞');
          const comments = pickAfter('评论');
          const shares = pickAfter('分享');
          if (views + likes + comments === 0) continue;
          items.push({
            title,
            platformPostId: m ? m[1] : undefined,
            url: href || undefined,
            views, likes, comments, shares,
          });
        }
        return items;
      })()`);
        logger_1.logger.info(`[douyin] fetchMetrics 抓到 ${raw?.length || 0} 条作品`);
        return raw || [];
    }
}
exports.DouyinPublisher = DouyinPublisher;
//# sourceMappingURL=douyin.js.map
