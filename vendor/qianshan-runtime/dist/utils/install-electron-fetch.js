"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installElectronFetch = installElectronFetch;
// ══════════════════════════════════════════════════════════════════════
//  把全局 fetch 替换成 Electron 的 net.fetch + 强制 ASCII User-Agent
//
//  背景:
//   Node 18+ 内置的 fetch 用 undici 实现,Electron 主进程默认就是它。
//   实测在某些用户环境下(国内某些 ISP / 杀毒软件 / VPN 配置 / IPv6 优先) ,
//   undici 对部分国内 HTTPS 域名(qianshanai.cn / wuyinkeji.com / 阿里云 OSS 边缘节点等)
//   会反复 `fetch failed`,但同一台机器的 Chrome 浏览器 / Electron BrowserView
//   一切正常。
//
//   Electron.net.fetch 走的是 Chromium 自带的网络栈,跟浏览器一模一样:
//   系统代理 / DNS 解析 / IPv4-IPv6 fallback / TLS 协商 都跟 Chrome 同步。
//   一行 monkey-patch 让全部 main 进程的 `fetch(...)` 调用受益,
//   license / cloud-llm-config / image / video / TTS 一次全好。
//
//   要点:
//   - 必须在 app.whenReady() 之后才能调 net.fetch(否则 net 模块没初始化)
//   - 替换 globalThis.fetch 能覆盖直接 `fetch(...)` 写法
//
//  ⚠️ User-Agent 必须强制 ASCII:
//   Electron 默认 UA 形如:
//     "Mozilla/5.0 ... 千山自媒体助手/1.0.21 Chrome/124 Electron/30 Safari/537"
//   "千山自媒体助手" 是 productName,Electron 直接拼进 UA。Chromium 网络栈用 UTF-8
//   编码这个字段,但 Spring Security `StrictHttpFirewall` 默认只接受 ISO-8859-1 可
//   打印字符 → 看到中文 UTF-8 字节直接抛 RequestRejectedException → 接口返 9999。
//   2026-05 排查 license 全网 9999 故障时定位到此根因。
//
//   修复:替换 fetch 时强制注入纯 ASCII UA(调用方自己显式传 User-Agent 时尊重)。
//   不影响 BrowserView(那个走 webContents,跟 net.fetch 是两套)。
// ══════════════════════════════════════════════════════════════════════
const electron_1 = require("electron");
const logger_1 = require("./logger");
let installed = false;
/** 构造纯 ASCII User-Agent — 不含中文产品名,避免 Spring StrictHttpFirewall 拒绝 */
function buildSafeUserAgent() {
    const version = (() => {
        try {
            return electron_1.app.getVersion();
        }
        catch {
            return 'unknown';
        }
    })();
    const platform = process.platform; // 'win32' / 'darwin' / 'linux'
    const electronVer = process.versions.electron || 'unknown';
    return `qianshan-ai-desktop/${version} (${platform}; Electron/${electronVer})`;
}
function installElectronFetch() {
    if (installed)
        return;
    if (!electron_1.app.isReady()) {
        // 还没 ready 就先排队,ready 后再装
        electron_1.app.whenReady().then(() => installElectronFetch()).catch(() => { });
        return;
    }
    if (!electron_1.net?.fetch) {
        logger_1.logger.warn('[install-electron-fetch] net.fetch 不可用(Electron < 28?),保持 Node 原生 fetch');
        return;
    }
    const SAFE_UA = buildSafeUserAgent();
    // 替换全局 fetch — main 进程所有现有 `fetch(...)` 调用都走 Chrome 网络栈
    // 注:Response/Request/Headers 等类型保持 Node 原生(net.fetch 返回的也是兼容的 Response)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input, init) => {
        // 把 init.headers 标准化成 Headers 实例,确保我们能 has/set
        // (init.headers 可能是 plain object / array / Headers 实例 / 缺省)
        const headers = new Headers(init?.headers || {});
        if (!headers.has('User-Agent') && !headers.has('user-agent')) {
            headers.set('User-Agent', SAFE_UA);
        }
        return electron_1.net.fetch(input, { ...(init || {}), headers });
    });
    installed = true;
    logger_1.logger.info(`[install-electron-fetch] 已把 globalThis.fetch 替换成 electron.net.fetch (Chrome 网络栈) ` +
        `+ 强制 ASCII UA="${SAFE_UA}" // original was ${originalFetch?.name || 'undici'}`);
}
//# sourceMappingURL=install-electron-fetch.js.map