"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformPublisher = void 0;
const browser_automation_1 = require("./browser-automation");
const logger_1 = require("../../utils/logger");
/**
 * 平台发布器抽象基类。
 *
 * 每个具体平台（B站/抖音/小红书/...）继承这个类并实现三个核心动作：
 *   - loginUrl       : 打开的登录页 URL
 *   - cookieDomain   : 用哪个 domain 上的 cookie 判断"已登录"
 *   - performLogin   : 登录窗打开后，怎么判断用户扫码完成
 *   - performPublish : 登录后，在页面上怎么填/点/上传
 */
class PlatformPublisher {
    /** 打开登录窗口，等用户扫码完成，然后返回。窗口关闭前 session 已持久化到 partition。 */
    async login(accountId) {
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, accountId);
        const win = (0, browser_automation_1.openAutomationWindow)({
            url: this.loginUrl,
            partition,
            visible: true,
            title: `${this.platformLabel} 扫码登录`,
            width: 900,
            height: 700,
        });
        try {
            await this.performLogin(win, partition);
            logger_1.logger.info(`[${this.platform}] 账号 ${accountId} 登录完成`);
            return { ok: true };
        }
        catch (err) {
            const msg = String(err?.message || err);
            logger_1.logger.error(`[${this.platform}] 登录失败: ${msg}`);
            return { ok: false, error: msg };
        }
        finally {
            (0, browser_automation_1.forceCloseWindow)(win);
        }
    }
    /**
     * 真校验：打开发布入口页（隐藏窗），等跳转稳定，检查最终 URL 是否落到登录页。
     *   - 若 partition 一个 cookie 都没有：直接返回未登录，不起窗。
     *   - 若 URL 回到 loginUrl（host + 含 "login"），判定过期。
     *   - 否则认为 cookie 仍有效。
     *
     * 超时 15s —— 校验不能阻塞前端太久。
     */
    async verify(accountId) {
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, accountId);
        const has = await (0, browser_automation_1.hasAnyCookie)(partition, this.cookieDomains || this.cookieDomain);
        if (!has)
            return { ok: false, error: '未登录或 cookie 已过期' };
        // 隐藏窗打开投稿页，看是否被踢回登录
        const win = (0, browser_automation_1.openAutomationWindow)({
            url: this.publishEntryUrl(),
            partition,
            visible: false,
            title: `${this.platformLabel} 校验中`,
            width: 1000,
            height: 700,
        });
        try {
            // 让页面跑 5s，吃掉所有 redirect
            await new Promise((r) => setTimeout(r, 5000));
            // 再轮询 10s 里页面稳定（URL 不再变化）
            let lastUrl = '';
            const deadline = Date.now() + 10_000;
            while (Date.now() < deadline) {
                if (win.isDestroyed())
                    break;
                const url = win.webContents.getURL();
                if (url === lastUrl)
                    break;
                lastUrl = url;
                await new Promise((r) => setTimeout(r, 1500));
            }
            const finalUrl = win.isDestroyed() ? '' : win.webContents.getURL();
            let loggedIn = this.isStillOnPublishArea(finalUrl);
            if (!loggedIn && !this.isExplicitLoginUrl(finalUrl)) {
                loggedIn = await this.hasLoggedInPageSignal(win, finalUrl);
            }
            if (!loggedIn) {
                logger_1.logger.info(`[${this.platform}] verify: 已被踢离投稿页, cookie 过期 (${finalUrl})`);
                return { ok: false, error: 'cookie 已过期，请重新扫码登录' };
            }
            return { ok: true };
        }
        catch (err) {
            const msg = String(err?.message || err);
            logger_1.logger.warn(`[${this.platform}] verify 异常: ${msg}`);
            return { ok: false, error: '校验失败: ' + msg };
        }
        finally {
            if (!win.isDestroyed())
                win.destroy();
        }
    }
    /**
     * 判断当前 URL 是否还停在"投稿区域"（= 已登录）。
     * 默认策略：与 publishEntryUrl 同 host 且第一层 path 相同。
     *   - 例：publishEntry = member.bilibili.com/platform/upload/video/frame
     *         停在 /platform/... 就算成功，跳到 passport.bilibili.com/login 就算失败
     * 子类可重写以处理特殊情况（比如登录成功会被跳到另一个子域）。
     */
    isStillOnPublishArea(currentUrl) {
        if (!currentUrl)
            return false;
        try {
            const cur = new URL(currentUrl);
            const entry = new URL(this.publishEntryUrl());
            if (cur.host !== entry.host)
                return false;
            // 明确的登录页关键字一票否决（同 host 也可能是登录子路由）
            if (this.isExplicitLoginUrl(currentUrl))
                return false;
            const curSeg = cur.pathname.split('/').filter(Boolean)[0] || '';
            const entrySeg = entry.pathname.split('/').filter(Boolean)[0] || '';
            // entry 在根路径时退化为 host 判断
            if (!entrySeg)
                return true;
            return curSeg === entrySeg;
        }
        catch {
            return false;
        }
    }
    isExplicitLoginUrl(currentUrl) {
        if (!currentUrl)
            return true;
        try {
            const cur = new URL(currentUrl);
            const text = `${cur.host}${cur.pathname}${cur.search}`;
            return /login|passport|signin|sign_in|scan_qr|qrcode|accountcenter/i.test(text);
        }
        catch {
            return true;
        }
    }
    async hasLoggedInPageSignal(_win, _currentUrl) {
        return false;
    }
    /** 解绑：清空 partition session。 */
    async unbind(accountId) {
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, accountId);
        await (0, browser_automation_1.clearPartition)(partition);
    }
    /**
     * 发布主流程。子类只要实现 performPublish。
     */
    async publish(input) {
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, input.accountId);
        // 发布前强校验：跑一次真 verify，过期直接终止
        const verified = await this.verify(input.accountId);
        if (!verified.ok) {
            logger_1.logger.warn(`[${this.platform}] 发布拦截：${verified.error}（accountId=${input.accountId}）`);
            return {
                ok: false,
                error: `${this.platformLabel} ${verified.error || '账号未登录'}，请到「账号管理」重新扫码`,
            };
        }
        const win = (0, browser_automation_1.openAutomationWindow)({
            url: this.publishEntryUrl(),
            partition,
            visible: true,
            title: `${this.platformLabel} 发布中`,
            width: 1200,
            height: 900,
        });
        try {
            const result = await this.performPublish(win, input);
            logger_1.logger.info(`[${this.platform}] 发布完成: accountId=${input.accountId}, postId=${result.platformPostId}`);
            return result;
        }
        catch (err) {
            const msg = String(err?.message || err);
            const shot = await (0, browser_automation_1.captureScreenshot)(win, `${this.platform}-publish-fail`);
            logger_1.logger.error(`[${this.platform}] 发布失败: ${msg}, 截图: ${shot}`);
            return { ok: false, error: msg, screenshotPath: shot };
        }
        // 注意：发布完成后不再自动关窗，让用户自己确认状态后手动关闭。
        // 用户的反馈：自动关闭看不清抖音那边到底有没有真的提交，反复发布时也容易把还在确认的窗口顺手关掉。
    }
    /**
     * 拉取该账号下已发布作品的最新指标。
     *
     * 默认实现：
     *   1. 先 verify（过期抛错）
     *   2. 打开 worksListUrl 的隐藏窗
     *   3. 调 performFetchMetrics 让子类决定怎么抓
     *   4. 2s 后强制关窗
     */
    async fetchMetrics(accountId) {
        const verified = await this.verify(accountId);
        if (!verified.ok) {
            throw new Error(`${this.platformLabel} ${verified.error || 'cookie 无效'}`);
        }
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, accountId);
        const win = (0, browser_automation_1.openAutomationWindow)({
            url: this.worksListUrl(),
            partition,
            visible: false,
            title: `${this.platformLabel} 拉取数据`,
            width: 1280,
            height: 900,
        });
        try {
            // 给页面 5s 加载（列表数据通常是延迟 ajax）
            await new Promise((r) => setTimeout(r, 5000));
            return await this.performFetchMetrics(win);
        }
        finally {
            setTimeout(() => (0, browser_automation_1.forceCloseWindow)(win), 500);
        }
    }
    /** 作品管理页 URL（用于拉取数据），子类按平台改写。 */
    worksListUrl() {
        // 默认退化为发布入口；子类应重写
        return this.publishEntryUrl();
    }
    /**
     * 子类实现：怎么从 worksListUrl 页面里拿到作品列表 + 指标。
     * 默认抛 not-implemented，平台没实现时会被调用方 catch。
     */
    async performFetchMetrics(_win) {
        throw new Error(`${this.platform} 暂未实现 fetchMetrics`);
    }
    /** 通用：等登录完成 —— URL 跳离登录页或出现某个 selector。 */
    async waitForLoginSuccess(win, options) {
        const { expectUrlPrefixes = [], expectSelector, timeoutMs = 180_000 } = options;
        const expr = `(() => {
      const url = window.location.href;
      const prefixes = ${JSON.stringify(expectUrlPrefixes)};
      if (prefixes.some(p => url.startsWith(p))) return true;
      ${expectSelector ? `if (document.querySelector(${JSON.stringify(expectSelector)})) return true;` : ''}
      return false;
    })()`;
        await (0, browser_automation_1.waitForCondition)(win, expr, { timeoutMs, intervalMs: 1500 });
    }
}
exports.PlatformPublisher = PlatformPublisher;
//# sourceMappingURL=base.js.map
