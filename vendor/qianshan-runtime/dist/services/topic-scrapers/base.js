"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseTopicScraper = void 0;
/**
 * 选题热搜抓取 —— 登录态 DOM 抽取方案
 *
 * 账号选择优先级：
 *   1. isDefaultScraper=1 的账号（用户在分发中心标记的"抓取专用号"）
 *   2. 否则按 lastVerifiedAt 最近的
 *
 * 三级防线：
 *   1. cookie 存在性自检（hasAnyCookie）
 *   2. warm-up 探测（probeLiveness，用 net.request 带 session 发一个 redirect-manual 请求）
 *   3. 真开窗导航，等 readySignal
 *
 * 失败会自动截图到 userData/scraper-logs/。
 */
const electron_1 = require("electron");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../../utils/logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const browser_automation_1 = require("../publishers/browser-automation");
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/124.0 Safari/537.36';
class BaseTopicScraper {
    /**
     * warm-up 探测 URL —— 一个"登录后才能访问"的创作者页，
     * 未登录会 302 到登录页。子类可覆盖；不填则走 targetUrl。
     */
    probeUrl;
    /** 超时（毫秒），默认 30s */
    timeoutMs = 30_000;
    /**
     * 失败时截图保存到 userData/scraper-logs/，方便排查选择器失效。
     * 不抛出异常——截图失败不影响主流程。
     */
    async snapshotOnFail(win, tag) {
        try {
            const dir = path.join(electron_1.app.getPath('userData'), 'scraper-logs');
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            const img = await win.webContents.capturePage();
            const file = path.join(dir, `${Date.now()}-${this.platform}-${tag}.png`);
            fs.writeFileSync(file, img.toPNG());
            logger_1.logger.info(`[Scraper:${this.platform}] 截图已保存: ${file}`);
        }
        catch (err) {
            logger_1.logger.warn(`[Scraper:${this.platform}] 截图失败: ${err}`);
        }
    }
    /**
     * warm-up 活性探测：用 net.request 带 partition session 发一个不跟随重定向的请求。
     * - 3xx + Location 指向登录页 → expired
     * - 3xx 站内跳转 / 200 → ok
     * - 4xx (401/403) → expired
     * - 其它 / 网络错误 / 超时 → unknown（不阻断，继续走主流程）
     */
    async probeLiveness(partition) {
        const url = this.probeUrl || this.targetUrl;
        return new Promise((resolve) => {
            let done = false;
            const finish = (r) => {
                if (done)
                    return;
                done = true;
                resolve(r);
            };
            const timer = setTimeout(() => finish('unknown'), 5000);
            try {
                const ses = electron_1.session.fromPartition(partition);
                const req = electron_1.net.request({
                    method: 'GET',
                    url,
                    session: ses,
                    redirect: 'manual',
                });
                req.setHeader('User-Agent', UA);
                req.setHeader('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8');
                req.on('response', (res) => {
                    clearTimeout(timer);
                    const status = res.statusCode;
                    const locHeader = res.headers['location'] || res.headers['Location'];
                    const loc = Array.isArray(locHeader) ? locHeader[0] : String(locHeader || '');
                    try {
                        res.on('data', () => {
                            /* drain */
                        });
                        res.on('end', () => {
                            /* drain */
                        });
                    }
                    catch {
                        /* noop */
                    }
                    if (status >= 300 && status < 400) {
                        finish(/login|passport|scan|qrcode|signin|accountcenter/i.test(loc) ? 'expired' : 'ok');
                    }
                    else if (status === 200) {
                        finish('ok');
                    }
                    else if (status === 401 || status === 403) {
                        // 这类平台经常对 net.request / 非完整页面请求返回 401/403，
                        // 但用户真实打开创作者后台仍是登录状态；不能仅凭状态码清掉账号。
                        finish('unknown');
                    }
                    else {
                        finish('unknown');
                    }
                });
                req.on('error', () => {
                    clearTimeout(timer);
                    finish('unknown');
                });
                req.end();
            }
            catch {
                clearTimeout(timer);
                finish('unknown');
            }
        });
    }
    /**
     * 挑选本次抓取要用哪个账号。
     * 规则：isDefaultScraper DESC，然后 lastVerifiedAt DESC，取第一个 active 的。
     */
    async pickAccount() {
        return db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.platformAccounts.platform, this.platform), (0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.platformAccounts.isDefaultScraper), (0, drizzle_orm_1.desc)(schema_1.platformAccounts.lastVerifiedAt));
    }
    /**
     * 执行抓取。
     * 1. 找账号（优先"抓取专用号"）
     * 2. cookie 自检 + warm-up 活性探测
     * 3. 打开无头窗口
     * 4. 等 ready
     * 5. 执行抽取 JS
     * 6. 关窗
     */
    async run() {
        // 1. 账号选择
        const accounts = await this.pickAccount();
        const account = accounts[0];
        if (!account) {
            return {
                ok: false,
                topics: [],
                errorType: 'no-account',
                errorMessage: `请先在「分发中心 → 账号」扫码登录${this.platform}`,
            };
        }
        const accountInfo = {
            id: account.id,
            name: account.accountName,
            isDefault: !!account.isDefaultScraper,
        };
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, account.id);
        // 2. cookie 存在性
        const hasCookie = await (0, browser_automation_1.hasAnyCookie)(partition, this.cookieDomains || this.cookieDomain);
        if (!hasCookie) {
            return {
                ok: false,
                topics: [],
                errorType: 'cookie-expired',
                errorMessage: `${this.platform} 登录态已失效，请重新扫码`,
                accountUsed: accountInfo,
            };
        }
        // 2.5 warm-up 活性探测（失败时提前返回，避免 30s 超时）
        const liveness = await this.probeLiveness(partition);
        if (liveness === 'expired') {
            logger_1.logger.info(`[Scraper:${this.platform}] warm-up 探测 → expired（账号 #${account.id} ${account.accountName}）`);
            return {
                ok: false,
                topics: [],
                errorType: 'cookie-expired',
                errorMessage: `${this.platform} 登录已过期（探测到登录跳转），请重新扫码`,
                accountUsed: accountInfo,
            };
        }
        // 3. 打开无头窗口
        let win = null;
        try {
            win = (0, browser_automation_1.openAutomationWindow)({
                url: this.targetUrl,
                partition,
                visible: false,
                title: `[scraper] ${this.platform}`,
            });
            // 4. 等页面 ready
            try {
                await (0, browser_automation_1.waitForCondition)(win, this.readySignal, {
                    timeoutMs: this.timeoutMs,
                    intervalMs: 500,
                });
            }
            catch (err) {
                const currentUrl = win.webContents.getURL();
                const maybeLogin = /login|passport|scan|qrcode/i.test(currentUrl);
                await this.snapshotOnFail(win, maybeLogin ? 'login-expired' : 'timeout');
                return {
                    ok: false,
                    topics: [],
                    errorType: maybeLogin ? 'cookie-expired' : 'timeout',
                    errorMessage: maybeLogin
                        ? `${this.platform} 登录已过期，请重新扫码`
                        : `${this.platform} 页面加载超时：${String(err).slice(0, 120)}`,
                    accountUsed: accountInfo,
                };
            }
            // 5. 抽取数据
            let topics = [];
            try {
                const raw = await (0, browser_automation_1.evaluate)(win, this.extractScript());
                if (!Array.isArray(raw)) {
                    await this.snapshotOnFail(win, 'non-array-result');
                    return {
                        ok: false,
                        topics: [],
                        errorType: 'page-changed',
                        errorMessage: `${this.platform} 页面结构变化，抽取脚本返回非数组`,
                        accountUsed: accountInfo,
                    };
                }
                topics = raw
                    .filter((t) => t && typeof t === 'object' && t.keyword)
                    .map((t) => ({
                    keyword: String(t.keyword).trim().slice(0, 120),
                    heatScore: Number(t.heatScore) || 0,
                    category: t.category ? String(t.category).slice(0, 32) : null,
                    trend: ['rising', 'stable', 'falling'].includes(t.trend) ? t.trend : 'stable',
                    sourceUrl: t.sourceUrl ? String(t.sourceUrl) : this.targetUrl,
                }))
                    .filter((t) => t.keyword.length >= 2);
            }
            catch (err) {
                await this.snapshotOnFail(win, 'extract-failed');
                return {
                    ok: false,
                    topics: [],
                    errorType: 'page-changed',
                    errorMessage: `${this.platform} 抽取脚本执行失败：${String(err).slice(0, 120)}`,
                    accountUsed: accountInfo,
                };
            }
            if (topics.length === 0) {
                await this.snapshotOnFail(win, 'empty-result');
                return {
                    ok: false,
                    topics: [],
                    errorType: 'page-changed',
                    errorMessage: `${this.platform} 抽取到 0 条，可能页面改版`,
                    accountUsed: accountInfo,
                };
            }
            logger_1.logger.info(`[Scraper:${this.platform}] 抓到 ${topics.length} 条（账号 #${account.id} ${account.accountName}${accountInfo.isDefault ? ' ★' : ''}）`);
            return { ok: true, topics, accountUsed: accountInfo };
        }
        catch (err) {
            logger_1.logger.error(`[Scraper:${this.platform}] unexpected: ${err}`);
            return {
                ok: false,
                topics: [],
                errorType: 'unknown',
                errorMessage: String(err?.message || err),
                accountUsed: accountInfo,
            };
        }
        finally {
            if (win)
                (0, browser_automation_1.forceCloseWindow)(win);
        }
    }
}
exports.BaseTopicScraper = BaseTopicScraper;
//# sourceMappingURL=base.js.map
