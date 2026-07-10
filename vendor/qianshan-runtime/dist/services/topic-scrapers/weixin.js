"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeixinScraper = void 0;
const base_1 = require("./base");
const selectors_1 = require("./selectors");
const browser_automation_1 = require("../publishers/browser-automation");
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../../utils/logger");
class WeixinScraper extends base_1.BaseTopicScraper {
    platform = 'weixin';
    targetUrl = 'https://channels.weixin.qq.com/platform/post/create';
    cookieDomain = '.weixin.qq.com';
    /** 视频号创作者主页；未登录会跳扫码 */
    probeUrl = 'https://channels.weixin.qq.com/platform';
    readySignal = `
    (() => {
      // 视频号发布页：出现 "话题" 二字或 "X万" 数字均视为就绪
      const body = document.body.innerText || '';
      return /话题|热点|#/.test(body) && /[0-9.]+\\s*(万|w)/i.test(body);
    })()
  `.trim();
    extractScript() {
        const categoryRegex = (0, selectors_1.buildCategoryRegex)('weixin');
        return `
      (async () => {
        try {
          window.scrollBy(0, 500);
          await new Promise((r) => setTimeout(r, 500));
        } catch (e) { /* noop */ }

        const out = [];
        const seen = new Set();
        const reAnchored = /([0-9.]+)\\s*(万|亿|w|k)\\s*(浏览|讨论|播放|参与|阅读)/i;
        const reHash = /#([^#\\s][^#]{1,40}?)#/;
        const reBare = /([0-9.]+)\\s*(万|亿)/;
        const all = document.querySelectorAll('div, span, a, li, p');

        for (const el of all) {
          if (el.children.length > 3) continue;
          const txt = (el.textContent || '').trim();
          if (txt.length > 80) continue;
          const hitAnchor = reAnchored.exec(txt);
          const hitHash = reHash.exec(txt);
          const hitBare = reBare.exec(txt);
          if (!hitAnchor && !hitHash && !hitBare) continue;

          let card = el.parentElement;
          for (let i = 0; i < 4 && card; i++) {
            const cardText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
            if (cardText.length >= 3 && cardText.length <= 200) break;
            card = card.parentElement;
          }
          if (!card) continue;

          const fullText = (card.textContent || '').replace(/\\s+/g, ' ').trim();
          const matched = reAnchored.exec(fullText) || reBare.exec(fullText);
          let heat = 0;
          if (matched) {
            const n = parseFloat(matched[1]);
            const unit = (matched[2] || '').toLowerCase();
            if (!isNaN(n)) {
              if (unit === '亿') heat = Math.round(n * 100000000);
              else if (unit === '万' || unit === 'w') heat = Math.round(n * 10000);
              else if (unit === 'k') heat = Math.round(n * 1000);
              else heat = Math.round(n);
            }
          }

          // 标题优先从 #话题# 里抽，其次从卡片文本去热度
          let title = '';
          const hashMatch = reHash.exec(fullText);
          if (hashMatch) {
            title = hashMatch[1].trim();
          } else {
            title = fullText
              .replace(reAnchored, '')
              .replace(reBare, '')
              .trim();
            title = title.replace(/^#/, '').replace(/#$/, '').trim();
            title = title.replace(/^[0-9]+\\s*[.、]?\\s*/, '').trim();
          }
          if (!title || title.length < 2 || title.length > 80) continue;
          if (seen.has(title)) continue;
          seen.add(title);

          const cat = fullText.match(${categoryRegex});

          out.push({
            keyword: title,
            heatScore: heat,
            category: cat ? cat[1] : null,
            trend: 'stable',
            sourceUrl: 'https://channels.weixin.qq.com/platform/post/create',
          });
          if (out.length >= 30) break;
        }
        return out;
      })()
    `.trim();
    }
    /**
     * 覆盖 run()，在打开窗口后立即注入 fetch 拦截器，
     * 尝试从 XHR 响应解析话题，失败再走 DOM 抽取。
     */
    async run() {
        // 1. 账号选择（优先抓取专用号）
        const accounts = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.platformAccounts.platform, this.platform), (0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.platformAccounts.isDefaultScraper), (0, drizzle_orm_1.desc)(schema_1.platformAccounts.lastVerifiedAt));
        const account = accounts[0];
        if (!account) {
            return {
                ok: false,
                topics: [],
                errorType: 'no-account',
                errorMessage: '请先在「分发中心 → 账号」扫码登录视频号',
            };
        }
        const accountInfo = {
            id: account.id,
            name: account.accountName,
            isDefault: !!account.isDefaultScraper,
        };
        const partition = (0, browser_automation_1.partitionForAccount)(this.platform, account.id);
        const hasCookie = await (0, browser_automation_1.hasAnyCookie)(partition, this.cookieDomain);
        if (!hasCookie) {
            return {
                ok: false,
                topics: [],
                errorType: 'cookie-expired',
                errorMessage: '视频号登录态已失效，请重新扫码',
                accountUsed: accountInfo,
            };
        }
        // 2. warm-up 活性探测
        const liveness = await this.probeLiveness(partition);
        if (liveness === 'expired') {
            logger_1.logger.info(`[Scraper:weixin] warm-up 探测 → expired（账号 #${account.id}）`);
            return {
                ok: false,
                topics: [],
                errorType: 'cookie-expired',
                errorMessage: '视频号登录已过期（探测到登录跳转），请重新扫码',
                accountUsed: accountInfo,
            };
        }
        let win = null;
        try {
            win = (0, browser_automation_1.openAutomationWindow)({
                url: this.targetUrl,
                partition,
                visible: false,
                title: '[scraper] weixin',
            });
            // ── 策略 1：XHR 拦截 ──────────────────────────────────────────────
            const xhrTopics = await this.tryXhrCapture(win);
            if (xhrTopics !== null && xhrTopics.length > 0) {
                logger_1.logger.info(`[Scraper:weixin] XHR 命中 ${xhrTopics.length} 条（账号 #${account.id} ${account.accountName}${accountInfo.isDefault ? ' ★' : ''}）`);
                return { ok: true, topics: xhrTopics, accountUsed: accountInfo };
            }
            // ── 策略 2：DOM 抽取 ──────────────────────────────────────────────
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
                        ? '视频号登录已过期，请重新扫码'
                        : `视频号页面加载超时：${String(err).slice(0, 120)}`,
                    accountUsed: accountInfo,
                };
            }
            let topics = [];
            try {
                const raw = await (0, browser_automation_1.evaluate)(win, this.extractScript());
                if (!Array.isArray(raw)) {
                    await this.snapshotOnFail(win, 'non-array-result');
                    return {
                        ok: false,
                        topics: [],
                        errorType: 'page-changed',
                        errorMessage: '视频号页面结构变化，抽取脚本返回非数组',
                        accountUsed: accountInfo,
                    };
                }
                topics = raw
                    .filter((t) => t && typeof t === 'object' && t.keyword)
                    .map((t) => ({
                    keyword: String(t.keyword).trim().slice(0, 120),
                    heatScore: Number(t.heatScore) || 0,
                    category: t.category ? String(t.category).slice(0, 32) : null,
                    trend: ['rising', 'stable', 'falling'].includes(t.trend)
                        ? t.trend
                        : 'stable',
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
                    errorMessage: `视频号抽取脚本执行失败：${String(err).slice(0, 120)}`,
                    accountUsed: accountInfo,
                };
            }
            if (topics.length === 0) {
                await this.snapshotOnFail(win, 'empty-result');
                return {
                    ok: false,
                    topics: [],
                    errorType: 'page-changed',
                    errorMessage: '视频号抽取到 0 条，可能页面改版',
                    accountUsed: accountInfo,
                };
            }
            logger_1.logger.info(`[Scraper:weixin] DOM 抽取 ${topics.length} 条（账号 #${account.id} ${account.accountName}${accountInfo.isDefault ? ' ★' : ''}）`);
            return { ok: true, topics, accountUsed: accountInfo };
        }
        catch (err) {
            logger_1.logger.error(`[Scraper:weixin] unexpected: ${err}`);
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
    /**
     * 注入 fetch 拦截器，等待页面发出热点相关 XHR 后解析。
     * 返回 null 表示未命中（调用方降级到 DOM）；返回空数组也视为未命中。
     */
    async tryXhrCapture(win) {
        const keywords = (0, selectors_1.getXhrKeywords)('weixin');
        const kwJson = JSON.stringify(keywords);
        // 等 dom-ready 后注入，此时页面 JS 刚开始执行，API 调用还未发出
        await new Promise((resolve) => {
            if (win.webContents.isLoading()) {
                win.webContents.once('dom-ready', () => resolve());
            }
            else {
                resolve();
            }
        });
        try {
            // 注入 fetch 补丁，把命中关键词的 JSON 响应存到 window.__wxCapture
            await win.webContents.executeJavaScript(`
        (() => {
          if (window.__wxCaptureInstalled) return;
          window.__wxCaptureInstalled = true;
          window.__wxCapture = [];
          const _origFetch = window.fetch.bind(window);
          window.fetch = async function(input, init) {
            const res = await _origFetch(input, init);
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const kws = ${kwJson};
            if (kws.some(k => url.toLowerCase().includes(k))) {
              res.clone().json().then(data => {
                window.__wxCapture.push({ url, data });
              }).catch(() => {});
            }
            return res;
          };
        })()
      `);
        }
        catch {
            // executeJavaScript 失败时静默降级
            return null;
        }
        // 等待 API 响应（最多 8 秒）
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 800));
            try {
                const captured = await win.webContents.executeJavaScript('window.__wxCapture || []');
                if (captured.length === 0)
                    continue;
                const topics = this.parseXhrData(captured);
                if (topics.length > 0)
                    return topics;
            }
            catch {
                break;
            }
        }
        return null;
    }
    /** 从拦截到的 XHR 响应数组中启发式解析话题列表 */
    parseXhrData(captured) {
        const results = [];
        for (const { data } of captured) {
            // 递归找第一个"像话题列表"的数组
            const list = this.findTopicArray(data);
            if (!list)
                continue;
            for (const item of list) {
                const keyword = String(item.topicName || item.name || item.title || item.keyword || item.word || '').trim();
                if (!keyword || keyword.length < 2 || keyword.length > 80)
                    continue;
                results.push({
                    keyword,
                    heatScore: Number(item.hotScore || item.heat || item.score || item.playCount || 0),
                    category: item.category || item.type || null,
                    trend: 'stable',
                    sourceUrl: 'https://channels.weixin.qq.com/platform/post/create',
                });
                if (results.length >= 50)
                    break;
            }
            if (results.length > 0)
                break;
        }
        return results;
    }
    /** 在嵌套对象中找第一个含 topicName/name/title 字段的对象数组（深度 ≤ 4） */
    findTopicArray(obj, depth = 0) {
        if (depth > 4 || !obj || typeof obj !== 'object')
            return null;
        if (Array.isArray(obj)) {
            if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
                const first = obj[0];
                if (first.topicName || first.name || first.title || first.keyword || first.word) {
                    return obj;
                }
            }
            for (const item of obj) {
                const found = this.findTopicArray(item, depth + 1);
                if (found)
                    return found;
            }
        }
        else {
            for (const val of Object.values(obj)) {
                const found = this.findTopicArray(val, depth + 1);
                if (found)
                    return found;
            }
        }
        return null;
    }
}
exports.WeixinScraper = WeixinScraper;
//# sourceMappingURL=weixin.js.map