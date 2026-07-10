"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.partitionForAccount = partitionForAccount;
exports.openAutomationWindow = openAutomationWindow;
exports.forceCloseWindow = forceCloseWindow;
exports.waitForCondition = waitForCondition;
exports.evaluate = evaluate;
exports.evaluateAcrossFrames = evaluateAcrossFrames;
exports.setFileInput = setFileInput;
exports.uploadByFileChooser = uploadByFileChooser;
exports.cdpClick = cdpClick;
exports.getElementRect = getElementRect;
exports.getCookieHeader = getCookieHeader;
exports.hasAnyCookie = hasAnyCookie;
exports.clearPartition = clearPartition;
exports.captureScreenshot = captureScreenshot;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logger_1 = require("../../utils/logger");
/**
 * 每个平台账号对应一个独立的 Electron session（partition），cookie/localStorage 相互隔离。
 * session 名称：`persist:publisher-{platform}-{accountId}`
 */
function partitionForAccount(platform, accountId) {
    return `persist:publisher-${platform}-${accountId}`;
}
/**
 * 伪装成普通 Chrome 124（与 Electron 30 底层 Chromium 版本对齐，避免 UA-CH 不一致触发风控）
 * Electron 默认 UA 自带 "Electron/30.x.x ... 千山自媒体助手/x.x.x"，
 * 抖音/小红书等平台对此关键字直接走风控，会出现"访问太频繁"。
 */
const REAL_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
/**
 * 反自动化检测脚本：抹掉 navigator.webdriver / 补 chrome / plugins 等常见指纹特征。
 * 通过 CDP `Page.addScriptToEvaluateOnNewDocument` 在每个新文档**最早期**注入，
 * 早于页面任何 JS，平台库（如 ttwid）拿到的就是"正常 Chrome"特征。
 *
 * 仅用于"用户登录自己的账号、发自己的内容"这一合法场景；
 * 不参与抓数据、不绕过付费、不冒充他人。
 */
const STEALTH_SCRIPT = `
(function() {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh'],
      configurable: true,
    });
  } catch (e) {}
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
    if (!window.chrome.app) window.chrome.app = { isInstalled: false };
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chromium PDF Plugin', filename: 'internal-pdf-viewer', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ],
      configurable: true,
    });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => [{ type: 'application/pdf', suffixes: 'pdf', description: '' }],
      configurable: true,
    });
  } catch (e) {}
  // Permissions API：notifications 状态对齐 default，避免被识别为 headless
  try {
    const origQuery =
      navigator.permissions && navigator.permissions.query
        ? navigator.permissions.query.bind(navigator.permissions)
        : null;
    if (origQuery) {
      navigator.permissions.query = (parameters) =>
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : origQuery(parameters);
    }
  } catch (e) {}
})();
`;
/**
 * 已经注册过 dummy protocol 的 partition 集合（避免重复注册抛异常）
 */
const _patchedPartitions = new Set();
/**
 * 给某个 session 注册一批"可疑自定义协议"的空响应 handler。
 * 抖音/小红书 等平台风控会把按钮换成 bitbrowser://、snssdk1128:// 等深链，
 * Electron 对未注册 scheme 的默认行为是丢给 shell.openExternal → Windows 弹
 * 「获取打开此链接的应用」对话框。此函数让 Electron 自己消化这些请求，
 * 返回 204，对话框就不会再弹。
 *
 * 注意：list 内的 scheme 都是公开协议（深链 / IM 协议），仅做"截胡"，
 * 不冒充也不发送任何业务数据。
 */
function registerDummySchemes(partition) {
    if (_patchedPartitions.has(partition))
        return;
    const ses = electron_1.session.fromPartition(partition);
    const SUSPICIOUS = [
        'bitbrowser', // 比特指纹浏览器
        'snssdk1128', // 抖音 / TikTok app 深链
        'snssdk1233', // 西瓜视频
        'douyin',
        'aweme',
        'weixin', // 微信
        'wxwork', // 企业微信
        'mqq',
        'tencent',
        'alipay',
        'taobao',
        'tmall',
        'kuaishou',
        'ksnebula',
    ];
    for (const scheme of SUSPICIOUS) {
        try {
            // Electron 30: session.protocol.handle 可在 ready 后注册自定义 scheme
            if (ses.protocol.isProtocolHandled?.(scheme))
                continue;
            ses.protocol.handle(scheme, () => new Response('', { status: 204 }));
        }
        catch (err) {
            logger_1.logger.warn(`[BrowserAutomation] dummy register ${scheme} on ${partition} failed: ${err}`);
        }
    }
    _patchedPartitions.add(partition);
}
/**
 * 打开一个自动化 BrowserWindow，cookie/session 与主窗口隔离。
 * 返回 BrowserWindow 实例，调用方负责关闭。
 */
function openAutomationWindow(opts) {
    // 必须在 BrowserWindow 创建前 / 同时注册，否则首次跳转时 handler 来不及生效
    registerDummySchemes(opts.partition);
    const win = new electron_1.BrowserWindow({
        width: opts.width ?? 1200,
        height: opts.height ?? 800,
        title: opts.title ?? '平台自动化',
        show: opts.visible ?? true,
        autoHideMenuBar: true,
        webPreferences: {
            partition: opts.partition,
            contextIsolation: true,
            nodeIntegration: false,
            // 允许跨域、文件上传等
            webSecurity: true,
        },
    });
    const wc = win.webContents;
    // ── 反检测 ①：UA 伪装 ──────────────────────────────
    // 默认 Electron UA 带 "Electron/30 ... 千山自媒体助手/x.x.x"，平台风控直接拦
    wc.setUserAgent(REAL_CHROME_UA);
    // ── 反检测 ②：CDP 在新文档创建前注入 stealth 脚本 ──
    // 比 dom-ready 早，能盖住所有页面 JS 的指纹检测
    try {
        if (!wc.debugger.isAttached()) {
            wc.debugger.attach('1.3');
        }
        wc.debugger
            .sendCommand('Page.enable')
            .then(() => wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
            source: STEALTH_SCRIPT,
        }))
            .catch((err) => {
            logger_1.logger.warn('[BrowserAutomation] addScriptToEvaluateOnNewDocument failed: ' + err);
        });
    }
    catch (err) {
        logger_1.logger.warn('[BrowserAutomation] debugger.attach failed: ' + err);
    }
    // ── 反检测 ③：dom-ready 兜底注入（CDP 注入慢于首屏的极端情况下补刀）──
    wc.on('dom-ready', () => {
        wc.executeJavaScript(STEALTH_SCRIPT, true).catch(() => { });
    });
    // 绕过页面的 beforeunload 确认弹窗：
    // B 站/小红书/抖音 等创作者页面会在离开时弹「确定要离开吗？」，
    // 会阻塞 win.close() 和用户点 X 按钮。这里显式同意离开。
    wc.on('will-prevent-unload', (event) => {
        event.preventDefault();
    });
    // ── 反检测 ④：拦截非 http(s) 自定义协议导航 ──────────
    // 抖音/小红书 等页面识别到非标准浏览器后，会把登录按钮换成 bitbrowser://、
    // snssdk1128://、weixin:// 等深链；Electron 默认把未知 scheme 转给 OS，
    // Windows 则弹「获取打开此链接的应用」对话框，登录就走不下去。
    // 这里把所有非 http/https 的同窗导航和新窗口请求一律静默拦截，并打日志。
    const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'about:', 'data:', 'blob:', 'file:']);
    const isAllowedUrl = (url) => {
        try {
            return ALLOWED_SCHEMES.has(new URL(url).protocol);
        }
        catch {
            return false;
        }
    };
    wc.on('will-navigate', (event, url) => {
        if (!isAllowedUrl(url)) {
            event.preventDefault();
            logger_1.logger.warn(`[BrowserAutomation] blocked navigation to custom scheme: ${url}`);
        }
    });
    // did-start-navigation 比 will-navigate 早，覆盖 iframe / 30x redirect
    // 这里只能 log（preventDefault 不可用），但 dummy protocol handler 已经接住请求
    wc.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
        if (!isAllowedUrl(url)) {
            logger_1.logger.warn(`[BrowserAutomation] custom-scheme navigation observed (mainFrame=${isMainFrame} inPlace=${isInPlace}): ${url}`);
        }
    });
    wc.setWindowOpenHandler(({ url }) => {
        if (!isAllowedUrl(url)) {
            logger_1.logger.warn(`[BrowserAutomation] blocked window.open to custom scheme: ${url}`);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
    // 兜底：close 事件被异常阻塞时，用 destroy 强制关闭
    win.on('close', (e) => {
        // 不调 preventDefault，默认允许关闭；若有异步问题可在此强制 destroy
        // e.preventDefault() 这里不用，allow close flow
    });
    win.loadURL(opts.url).catch((err) => {
        logger_1.logger.error(`[BrowserAutomation] loadURL failed: ${err}`);
    });
    return win;
}
/**
 * 强制关闭窗口：先尝试 close，100ms 后若还存活则 destroy。
 * 用于发布/登录结束后的自动清理，避免 beforeunload 卡住。
 */
function forceCloseWindow(win) {
    if (win.isDestroyed())
        return;
    try {
        win.close();
    }
    catch {
        /* ignore */
    }
    setTimeout(() => {
        if (!win.isDestroyed()) {
            try {
                win.destroy();
            }
            catch {
                /* ignore */
            }
        }
    }, 200);
}
/**
 * 轮询检查页面某 JS 表达式直到返回 truthy，或超时。
 * 用于等待登录完成、等待某个 DOM 元素出现。
 */
async function waitForCondition(win, jsExpr, options = {}) {
    const timeout = options.timeoutMs ?? 120_000;
    const interval = options.intervalMs ?? 1000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (win.isDestroyed())
            throw new Error('窗口已关闭');
        try {
            const result = await win.webContents.executeJavaScript(jsExpr, true);
            if (result)
                return result;
        }
        catch (err) {
            // 页面还没加载完或被替换时 executeJavaScript 会抛，继续轮询
        }
        await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`等待超时 (${timeout}ms): ${jsExpr.slice(0, 80)}`);
}
/**
 * 在页面里执行 JS 并拿返回值。
 */
async function evaluate(win, jsExpr) {
    return win.webContents.executeJavaScript(jsExpr, true);
}
/**
 * 跨 frame 执行 JS，返回第一个非空/非 false 的结果。
 *   视频号助手等平台把上传组件放在 iframe 里，主 frame 的 querySelector 看不到——
 *   这个 helper 会遍历 mainFrame.framesInSubtree，在每个 frame 里跑一遍。
 *
 * 注意：每个 frame 是独立 JS 上下文，跨 frame 不共享变量；脚本必须自包含。
 */
async function evaluateAcrossFrames(win, jsExpr) {
    const mainFrame = win.webContents.mainFrame;
    if (!mainFrame) {
        // 老版本 Electron 没有 mainFrame API，退回 主 frame evaluate
        return (await evaluate(win, jsExpr)) ?? null;
    }
    const frames = Array.isArray(mainFrame.framesInSubtree)
        ? mainFrame.framesInSubtree
        : [mainFrame];
    for (const frame of frames) {
        try {
            const result = await frame.executeJavaScript(jsExpr, true);
            if (result != null && result !== false) {
                return result;
            }
        }
        catch {
            // 跨域 / frame 已销毁等 → 跳过
        }
    }
    return null;
}
/**
 * 通过 CDP 给页面上指定的 <input type="file"> 注入文件路径（等效于用户从文件对话框选了文件）。
 * 这是 Playwright / Puppeteer 内部使用的同一机制。
 *
 * @param selector CSS selector，指向 input[type=file]
 * @param filePaths 绝对路径数组
 */
async function setFileInput(win, selector, filePaths) {
    for (const p of filePaths) {
        if (!fs_1.default.existsSync(p))
            throw new Error('文件不存在: ' + p);
    }
    const wc = win.webContents;
    let attached = false;
    try {
        try {
            wc.debugger.attach('1.3');
            attached = true;
        }
        catch (err) {
            // 可能已经 attach 了
            if (!String(err).includes('already attached'))
                throw err;
        }
        // 拿到根文档（pierce: true 穿透 iframe / shadow DOM —— 视频号上传组件放在 iframe 里）
        const doc = await wc.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
        // 按 selector 查找 nodeId（也启用 pierce，跨 frame 找）
        const queryResult = await wc.debugger.sendCommand('DOM.querySelector', {
            nodeId: doc.root.nodeId,
            selector,
        });
        if (!queryResult.nodeId)
            throw new Error('未找到文件输入框: ' + selector);
        await wc.debugger.sendCommand('DOM.setFileInputFiles', {
            nodeId: queryResult.nodeId,
            files: filePaths,
        });
    }
    finally {
        if (attached) {
            try {
                wc.debugger.detach();
            }
            catch {
                /* ignore */
            }
        }
    }
}
/**
 * 通过 CDP 拦截文件选择对话框：模拟用户「点击上传按钮 → 选文件」的真实路径，
 * 让前端框架（React/Vue）收到完整事件链 (click → 弹框 → 选文件 → onChange)，
 * 避免 `setFileInput`（直接 DOM.setFileInputFiles 到隐藏 input）那种"DOM 看到了文件，
 * 但框架内部 state 没跟上、下一次 re-render 又被覆盖"的问题。
 *
 * 触发方式两种（二选一）：
 *   - triggerJs: 页面内跑的 JS 表达式（点 input/button）
 *   - triggerFn: 主进程侧触发函数（典型用法：CDP Input.dispatchMouseEvent 坐标点击，
 *               适合 React 合成事件钩太深、DOM .click() 触发不了 onClick 的场景）
 */
async function uploadByFileChooser(win, options) {
    if (!options.triggerJs && !options.triggerFn) {
        throw new Error('uploadByFileChooser: triggerJs 和 triggerFn 必须二选一');
    }
    for (const p of options.files) {
        if (!fs_1.default.existsSync(p))
            throw new Error('文件不存在: ' + p);
    }
    const wc = win.webContents;
    let attached = false;
    if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3');
        attached = true;
    }
    // 等 Page.fileChooserOpened 事件
    let messageHandler = null;
    const opened = new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            if (messageHandler)
                wc.debugger.off('message', messageHandler);
            reject(new Error(`等待文件选择对话框超时 (${options.timeoutMs ?? 15000}ms)`));
        }, options.timeoutMs ?? 15000);
        messageHandler = (_event, method, params) => {
            if (method === 'Page.fileChooserOpened') {
                // ★ 关键诊断：确认 file chooser 真的被触发了；params 含 backendNodeId / mode（selectSingle / selectMultiple）
                logger_1.logger.info(`[uploadByFileChooser] ★ fileChooserOpened 收到! backendNodeId=${params?.backendNodeId} mode=${params?.mode}`);
                if (params?.backendNodeId) {
                    clearTimeout(t);
                    if (messageHandler)
                        wc.debugger.off('message', messageHandler);
                    resolve({ backendNodeId: params.backendNodeId });
                }
            }
        };
        wc.debugger.on('message', messageHandler);
    });
    try {
        await wc.debugger.sendCommand('Page.enable').catch(() => { });
        await wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true });
        // 触发点击（必须在拦截开启之后做，否则真的弹系统文件框）
        if (options.triggerJs) {
            const triggerResult = await wc.executeJavaScript(options.triggerJs, true);
            logger_1.logger.info('[uploadByFileChooser] triggerJs result: ' + JSON.stringify(triggerResult));
        }
        else if (options.triggerFn) {
            await options.triggerFn();
            logger_1.logger.info('[uploadByFileChooser] triggerFn invoked');
        }
        logger_1.logger.info('[uploadByFileChooser] trigger 已执行，等待 fileChooserOpened 事件...');
        const { backendNodeId } = await opened;
        await wc.debugger.sendCommand('DOM.setFileInputFiles', {
            backendNodeId,
            files: options.files,
        });
        logger_1.logger.info(`[uploadByFileChooser] DOM.setFileInputFiles 完成 backendNodeId=${backendNodeId} files=${options.files.length}`);
    }
    finally {
        if (messageHandler) {
            try {
                wc.debugger.off('message', messageHandler);
            }
            catch { /* ignore */ }
        }
        await wc.debugger
            .sendCommand('Page.setInterceptFileChooserDialog', { enabled: false })
            .catch(() => { });
        if (attached) {
            try {
                wc.debugger.detach();
            }
            catch { /* ignore */ }
        }
    }
}
/**
 * 用 CDP Input.dispatchMouseEvent 模拟真实鼠标点击（按视口坐标）。
 *
 * 这条路径走的是浏览器原生输入管线，和真人鼠标点击完全等价：
 *   - React 合成事件 / Vue 事件代理 / 原生 onclick 都能收到
 *   - 不依赖 element.click() / dispatchEvent —— 这两个在框架钩子层级深时经常打空
 *   - 不依赖找"真正可点击的祖先节点"——事件由浏览器从坐标自然冒泡分发
 */
async function cdpClick(win, x, y) {
    const wc = win.webContents;
    let attached = false;
    if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3');
        attached = true;
    }
    try {
        // 完整 mousedown + mouseup 一次点击
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });
    }
    finally {
        if (attached) {
            try {
                wc.debugger.detach();
            }
            catch { /* ignore */ }
        }
    }
}
/**
 * 在页面里跑一段 JS 表达式（必须返回 Element），拿到该元素的视口中心坐标。
 * 同时会自动 scrollIntoView 到中央，避免坐标在视口外。
 *
 * @param jsExpr  IIFE 字符串，里面 return 一个 Element（或 null）
 * @returns       { x, y, w, h } 元素中心坐标 + 尺寸；找不到时返回 null
 */
async function getElementRect(win, jsExpr) {
    return await win.webContents.executeJavaScript(`(() => {
      const el = (${jsExpr});
      if (!el || !el.getBoundingClientRect) return null;
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    })()`, true);
}
/**
 * 获取指定 partition 的所有 cookies（序列化成原生浏览器 cookie header 格式）。
 */
async function getCookieHeader(partition, url) {
    const ses = electron_1.session.fromPartition(partition);
    const cookies = await ses.cookies.get({ url });
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
/**
 * 检查某 partition 是否包含某 host 下任意有效 cookie（用于判断"是否已登录"）。
 */
async function hasAnyCookie(partition, domain) {
    const ses = electron_1.session.fromPartition(partition);
    const cookies = await ses.cookies.get({ domain });
    return cookies.length > 0;
}
/**
 * 清空 partition 下的所有 cookie 和 storage（用户"解绑"账号时调用）。
 */
async function clearPartition(partition) {
    const ses = electron_1.session.fromPartition(partition);
    await ses.clearStorageData();
}
/**
 * 截图存盘用于发布留痕（失败时定位问题）。
 */
async function captureScreenshot(win, tag) {
    try {
        const dir = path_1.default.join(electron_1.app.getPath('userData'), 'publisher-logs');
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        const img = await win.webContents.capturePage();
        const file = path_1.default.join(dir, `${Date.now()}-${tag}.png`);
        fs_1.default.writeFileSync(file, img.toPNG());
        return file;
    }
    catch (err) {
        logger_1.logger.warn('[BrowserAutomation] capture screenshot failed: ' + err);
        return '';
    }
}
//# sourceMappingURL=browser-automation.js.map