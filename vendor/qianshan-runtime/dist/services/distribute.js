"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.distribute = exports.DistributeService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const llm_1 = require("./llm");
const style_engine_1 = require("./style-engine");
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const drizzle_orm_1 = require("drizzle-orm");
const publishers_1 = require("./publishers");
const crypto_storage_1 = require("../utils/crypto-storage");
// ─── Mock 发布器：按平台返回假 postId ───
function mockPublish(platform, title) {
    const id = `${platform}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const url = `mock://${platform}/post/${id}`;
    logger_1.logger.info(`[Distribute/Mock] Published to ${platform}: "${title}" -> ${id}`);
    return { postId: id, url };
}
// ─── Mock 指标生成器 ───
function mockFetchMetrics(platform) {
    const base = { douyin: 5000, xiaohongshu: 2000, bilibili: 1500, weibo: 3000, weixin: 800 }[platform] || 1000;
    const views = Math.floor(base * (0.5 + Math.random() * 1.5));
    return {
        views,
        likes: Math.floor(views * (0.05 + Math.random() * 0.15)),
        comments: Math.floor(views * (0.005 + Math.random() * 0.02)),
        shares: Math.floor(views * (0.003 + Math.random() * 0.015)),
        followersGained: Math.floor(views * (0.001 + Math.random() * 0.005)),
    };
}
class DistributeService {
    // ═══════════════ 账号管理 ═══════════════
    async addAccount(data) {
        return db_1.db
            .insert(schema_1.platformAccounts)
            .values({
            platform: data.platform,
            accountName: data.accountName,
            // 敏感字段落库前用 safeStorage 加密
            cookieData: data.cookieData ? crypto_storage_1.cryptoStorage.encrypt(data.cookieData) : null,
            accessToken: data.accessToken ? crypto_storage_1.cryptoStorage.encrypt(data.accessToken) : null,
        })
            .returning();
    }
    /** 列出已经实现了真实发布器的平台（前端用于只允许用户选这些） */
    listSupportedPlatforms() {
        return (0, publishers_1.listSupportedPlatforms)();
    }
    /**
     * 打开扫码登录窗，绑定 Electron session 到这个 accountId。
     * 该方法只能在 Electron 主进程上下文调用（Express 就跑在主进程，可直接调）。
     */
    async loginAccount(id) {
        const [account] = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        if (!account)
            throw new Error('Account not found');
        const publisher = (0, publishers_1.getPublisher)(account.platform);
        if (!publisher) {
            return {
                ok: false,
                error: `平台 ${account.platform} 暂未实现真实发布器`,
            };
        }
        const r = await publisher.login(id);
        if (r.ok) {
            await db_1.db
                .update(schema_1.platformAccounts)
                .set({ lastLoginAt: new Date().toISOString(), isActive: 1 })
                .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        }
        return r;
    }
    async listAccounts(platform) {
        if (platform) {
            return db_1.db
                .select()
                .from(schema_1.platformAccounts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.platformAccounts.platform, platform), (0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1)));
        }
        return db_1.db.select().from(schema_1.platformAccounts).where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1));
    }
    async removeAccount(id) {
        const [account] = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        if (account) {
            // 清空该账号对应的 Electron session partition（登录凭据）
            const pub = (0, publishers_1.getPublisher)(account.platform);
            if (pub) {
                try {
                    await pub.unbind(id);
                }
                catch (err) {
                    logger_1.logger.warn(`[Distribute] unbind partition failed: ${err}`);
                }
            }
        }
        return db_1.db
            .update(schema_1.platformAccounts)
            .set({ isActive: 0 })
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
    }
    async verifyAccount(id) {
        const [account] = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        if (!account)
            throw new Error('Account not found');
        const now = new Date().toISOString();
        // 真实 Publisher 优先：无论 USE_MOCK 都走真校验（校验不依赖 API key）
        const publisher = (0, publishers_1.getPublisher)(account.platform);
        if (publisher) {
            const r = await publisher.verify(id);
            await db_1.db
                .update(schema_1.platformAccounts)
                .set({
                lastVerifiedAt: now,
                verifyStatus: r.ok ? 'ok' : 'expired',
            })
                .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
            return r;
        }
        // Mock 模式 & 未实现的平台：直接标记为可用
        if (config_1.USE_MOCK) {
            await db_1.db
                .update(schema_1.platformAccounts)
                .set({
                lastVerifiedAt: now,
                verifyStatus: 'ok',
            })
                .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
            return { ok: true, mock: true };
        }
        return { ok: false, error: `平台 ${account.platform} 暂未实现真实发布器` };
    }
    /**
     * 把指定账号设为该平台的"抓取专用号"，清掉同平台其它账号的该标记。
     * 选题雷达会优先用它跑 DOM 抓取。
     */
    async setDefaultScraperAccount(id) {
        const [account] = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        if (!account)
            throw new Error('Account not found');
        // 清掉同平台其它默认标记
        await db_1.db
            .update(schema_1.platformAccounts)
            .set({ isDefaultScraper: 0 })
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.platform, account.platform));
        // 设置当前账号为默认
        await db_1.db
            .update(schema_1.platformAccounts)
            .set({ isDefaultScraper: 1 })
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        return { ok: true, platform: account.platform, accountId: id };
    }
    /** 取消"抓取专用号"标记 */
    async clearDefaultScraperAccount(id) {
        await db_1.db
            .update(schema_1.platformAccounts)
            .set({ isDefaultScraper: 0 })
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, id));
        return { ok: true };
    }
    /** 批量校验所有已绑定账号（启动时自活用） */
    async verifyAllAccounts() {
        const accounts = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1));
        const results = [];
        for (const acc of accounts) {
            try {
                const r = await this.verifyAccount(acc.id);
                results.push({ id: acc.id, ok: r.ok, error: r.error });
            }
            catch (err) {
                results.push({ id: acc.id, ok: false, error: String(err?.message || err) });
            }
        }
        return results;
    }
    // ═══════════════ 发布任务 ═══════════════
    async createPublishTask(data) {
        // DB 里 title NOT NULL，但视频号等平台没独立 title → 用 description 前 50 字兜底
        const safeTitle = (data.title || '').trim() ||
            (data.description || '').trim().slice(0, 50) ||
            '[无标题]';
        return db_1.db
            .insert(schema_1.publishTasks)
            .values({
            accountId: data.accountId,
            platform: data.platform,
            contentType: data.contentType,
            title: safeTitle,
            description: data.description,
            mediaPaths: data.mediaPaths ? JSON.stringify(data.mediaPaths) : null,
            tags: data.tags ? JSON.stringify(data.tags) : null,
            coverPath: data.coverPath,
            platformFields: data.platformFields ? JSON.stringify(data.platformFields) : null,
            scheduledAt: data.scheduledAt,
            status: data.scheduledAt ? 'scheduled' : 'draft',
            copywritingId: data.copywritingId ?? null,
            adVideoId: data.adVideoId ?? null,
            slideshowId: data.slideshowId ?? null,
            coverId: data.coverId ?? null,
        })
            .returning();
    }
    /** 主线 A：按文案 id 列所有相关的发布任务 */
    async listByCopywritingId(copywritingId) {
        return db_1.db
            .select()
            .from(schema_1.publishTasks)
            .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.copywritingId, copywritingId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.publishTasks.id));
    }
    async listPublishTasks(filter) {
        if (filter?.platform && filter?.status) {
            return db_1.db
                .select()
                .from(schema_1.publishTasks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.publishTasks.platform, filter.platform), (0, drizzle_orm_1.eq)(schema_1.publishTasks.status, filter.status)))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.publishTasks.id));
        }
        if (filter?.platform) {
            return db_1.db
                .select()
                .from(schema_1.publishTasks)
                .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.platform, filter.platform))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.publishTasks.id));
        }
        if (filter?.status) {
            return db_1.db
                .select()
                .from(schema_1.publishTasks)
                .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.status, filter.status))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.publishTasks.id));
        }
        return db_1.db.select().from(schema_1.publishTasks).orderBy((0, drizzle_orm_1.desc)(schema_1.publishTasks.id));
    }
    async getPublishTask(id) {
        const [row] = await db_1.db.select().from(schema_1.publishTasks).where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
        return row;
    }
    async updatePublishTask(id, data) {
        const update = {
            ...data,
            updatedAt: new Date().toISOString(),
        };
        if (data.tags)
            update.tags = JSON.stringify(data.tags);
        return db_1.db
            .update(schema_1.publishTasks)
            .set(update)
            .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id))
            .returning();
    }
    async removePublishTask(id) {
        // 先删子表（content_metrics 外键引用 publish_tasks.id），再删任务本身
        await db_1.db.delete(schema_1.contentMetrics).where((0, drizzle_orm_1.eq)(schema_1.contentMetrics.publishTaskId, id));
        return db_1.db.delete(schema_1.publishTasks).where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
    }
    /**
     * 立即发布。优先级：
     *   1. 有真实 Publisher 的平台（例如 B 站） → 始终走真实发布，忽略 USE_MOCK
     *      （平台分发不依赖 API key，只依赖 cookie 自动化，所以 Mock 不该拦截）
     *   2. 没有真实 Publisher 的平台 + USE_MOCK=1 → Mock 兜底，方便演示
     *   3. 没有真实 Publisher 的平台 + USE_MOCK=0 → 直接报错
     */
    async executePublish(id) {
        const [task] = await db_1.db.select().from(schema_1.publishTasks).where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
        if (!task)
            throw new Error('Publish task not found');
        if (task.status === 'published')
            throw new Error('任务已发布');
        try {
            await db_1.db
                .update(schema_1.publishTasks)
                .set({ status: 'publishing', updatedAt: new Date().toISOString() })
                .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
            // ─── 真实发布：委托给对应平台的 Publisher ───
            const publisher = (0, publishers_1.getPublisher)(task.platform);
            if (!publisher) {
                // 平台未实现真实发布器
                if (config_1.USE_MOCK) {
                    // Mock 兜底（用于演示未实现平台）
                    await new Promise((r) => setTimeout(r, 600));
                    const { postId } = mockPublish(task.platform, task.title);
                    await db_1.db
                        .update(schema_1.publishTasks)
                        .set({
                        status: 'published',
                        platformPostId: postId,
                        publishedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
                    return { ok: true, mock: true, platformPostId: postId };
                }
                throw new Error(`平台 ${task.platform} 暂未实现真实发布器。已实现：${(0, publishers_1.listSupportedPlatforms)()
                    .map((p) => p.platform)
                    .join(', ')}`);
            }
            const mediaPaths = task.mediaPaths
                ? JSON.parse(task.mediaPaths)
                : [];
            const tags = task.tags ? JSON.parse(task.tags) : [];
            const platformFields = task.platformFields
                ? (() => {
                    try {
                        return JSON.parse(task.platformFields);
                    }
                    catch {
                        return undefined;
                    }
                })()
                : undefined;
            const result = await publisher.publish({
                accountId: task.accountId,
                title: task.title,
                description: task.description || undefined,
                tags,
                mediaPaths,
                coverPath: task.coverPath || undefined,
                contentType: task.contentType,
                platformFields,
            });
            if (!result.ok) {
                throw new Error(result.error || '发布失败（未知原因）');
            }
            await db_1.db
                .update(schema_1.publishTasks)
                .set({
                status: 'published',
                platformPostId: result.platformPostId || null,
                publishedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
            return {
                ok: true,
                platformPostId: result.platformPostId,
                url: result.url,
            };
        }
        catch (err) {
            const msg = String(err);
            await db_1.db
                .update(schema_1.publishTasks)
                .set({
                status: 'failed',
                errorMsg: msg,
                updatedAt: new Date().toISOString(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, id));
            logger_1.logger.error(`[Distribute] Publish task ${id} failed: ${msg}`);
            throw err;
        }
    }
    /** 批量一键多平台分发：为每个 accountId 创建一个发布任务并立即执行 */
    async multiPublish(data) {
        const results = [];
        for (const accountId of data.accountIds) {
            const [account] = await db_1.db
                .select()
                .from(schema_1.platformAccounts)
                .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, accountId));
            if (!account) {
                results.push({ accountId, ok: false, error: 'Account not found' });
                continue;
            }
            const [task] = await this.createPublishTask({
                accountId,
                platform: account.platform,
                contentType: data.contentType,
                title: data.title,
                description: data.description,
                mediaPaths: data.mediaPaths,
                tags: data.tags,
                coverPath: data.coverPath,
                copywritingId: data.copywritingId,
                adVideoId: data.adVideoId,
                slideshowId: data.slideshowId,
                coverId: data.coverId,
                platformFields: data.platformFields,
            });
            try {
                const r = await this.executePublish(task.id);
                results.push({ accountId, taskId: task.id, ...r });
            }
            catch (e) {
                results.push({ accountId, taskId: task.id, ok: false, error: String(e) });
            }
        }
        return results;
    }
    // ═══════════════ 数据监控 ═══════════════
    /**
     * 单任务指标拉取。优先级：
     *   1. 有真实 Publisher → 走真实抓取（打开作品管理页 / 调 JSON API，按标题匹配到这条任务）
     *   2. 否则 + USE_MOCK → 走 Mock
     *   3. 否则 → 报错
     */
    async fetchMetrics(taskId) {
        const [task] = await db_1.db.select().from(schema_1.publishTasks).where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, taskId));
        if (!task)
            throw new Error('Task not found');
        if (task.status !== 'published')
            throw new Error('任务尚未发布，无数据可拉取');
        const publisher = (0, publishers_1.getPublisher)(task.platform);
        if (publisher) {
            try {
                const list = await publisher.fetchMetrics(task.accountId);
                const matched = this.matchMetric(list, task);
                if (matched) {
                    const [inserted] = await db_1.db
                        .insert(schema_1.contentMetrics)
                        .values({
                        publishTaskId: taskId,
                        views: matched.views || 0,
                        likes: matched.likes || 0,
                        comments: matched.comments || 0,
                        shares: matched.shares || 0,
                        followersGained: 0,
                        fetchedAt: new Date().toISOString(),
                    })
                        .returning();
                    return inserted;
                }
                throw new Error('在平台「作品管理」页没有匹配到这条作品（标题可能不一致或尚未索引）');
            }
            catch (err) {
                // 有 publisher 但抓失败：真实模式直接报错；mock 模式降级为 mock
                if (!config_1.USE_MOCK)
                    throw err;
                logger_1.logger.warn(`[Distribute] 真实指标抓取失败，降级 Mock: ${err}`);
            }
        }
        else if (!config_1.USE_MOCK) {
            throw new Error(`平台 ${task.platform} 暂未实现真实指标抓取`);
        }
        // Mock 兜底
        const metric = mockFetchMetrics(task.platform);
        const [inserted] = await db_1.db
            .insert(schema_1.contentMetrics)
            .values({
            publishTaskId: taskId,
            ...metric,
            fetchedAt: new Date().toISOString(),
        })
            .returning();
        return inserted;
    }
    /** 在平台返回的作品列表里匹配当前 task —— 优先 platformPostId，否则按标题 */
    matchMetric(list, task) {
        if (!list || !list.length)
            return null;
        if (task.platformPostId) {
            const byId = list.find((x) => x.platformPostId && x.platformPostId === task.platformPostId);
            if (byId)
                return byId;
        }
        // 标题精确匹配
        const exact = list.find((x) => x.title.trim() === task.title.trim());
        if (exact)
            return exact;
        // 标题前缀 ≥ 15 字模糊匹配
        const prefix = task.title.trim().slice(0, 15);
        if (prefix.length >= 6) {
            const fuzzy = list.find((x) => x.title.startsWith(prefix));
            if (fuzzy)
                return fuzzy;
        }
        return null;
    }
    /**
     * 按账号一次性刷新所有已发布任务的指标。
     * 拉一次平台列表 → 逐条 task 匹配 → 批量写入 content_metrics。
     */
    async refreshMetricsForAccount(accountId) {
        const [account] = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.id, accountId));
        if (!account)
            throw new Error('Account not found');
        const publisher = (0, publishers_1.getPublisher)(account.platform);
        if (!publisher) {
            throw new Error(`平台 ${account.platform} 暂未实现真实指标抓取`);
        }
        const tasks = await db_1.db
            .select()
            .from(schema_1.publishTasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.publishTasks.accountId, accountId), (0, drizzle_orm_1.eq)(schema_1.publishTasks.status, 'published')));
        if (tasks.length === 0) {
            return { ok: true, matched: 0, total: 0, message: '该账号下没有已发布任务' };
        }
        const platformList = await publisher.fetchMetrics(accountId);
        const now = new Date().toISOString();
        let matched = 0;
        const details = [];
        for (const t of tasks) {
            const m = this.matchMetric(platformList, t);
            if (!m) {
                details.push({ taskId: t.id, title: t.title, ok: false, error: '未匹配到' });
                continue;
            }
            await db_1.db.insert(schema_1.contentMetrics).values({
                publishTaskId: t.id,
                views: m.views || 0,
                likes: m.likes || 0,
                comments: m.comments || 0,
                shares: m.shares || 0,
                followersGained: 0,
                fetchedAt: now,
            });
            // 顺便补全 platformPostId（若历史任务没存到）
            if (!t.platformPostId && m.platformPostId) {
                await db_1.db
                    .update(schema_1.publishTasks)
                    .set({ platformPostId: m.platformPostId })
                    .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, t.id));
            }
            matched++;
            details.push({
                taskId: t.id,
                title: t.title,
                ok: true,
                views: m.views,
                likes: m.likes,
            });
        }
        return { ok: true, total: tasks.length, matched, details };
    }
    /** 一键刷新所有账号下所有任务的最新指标 */
    async refreshAllMetrics() {
        const accounts = await db_1.db
            .select()
            .from(schema_1.platformAccounts)
            .where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1));
        const results = [];
        for (const acc of accounts) {
            try {
                const r = await this.refreshMetricsForAccount(acc.id);
                results.push({ accountId: acc.id, platform: acc.platform, ...r });
            }
            catch (err) {
                results.push({
                    accountId: acc.id,
                    platform: acc.platform,
                    ok: false,
                    error: String(err?.message || err),
                });
            }
        }
        return results;
    }
    async listMetrics(taskId) {
        return db_1.db
            .select()
            .from(schema_1.contentMetrics)
            .where((0, drizzle_orm_1.eq)(schema_1.contentMetrics.publishTaskId, taskId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.contentMetrics.fetchedAt));
    }
    /** 聚合统计：按平台求总浏览/点赞 */
    async overviewByPlatform() {
        const tasks = await db_1.db.select().from(schema_1.publishTasks);
        const allMetrics = await db_1.db.select().from(schema_1.contentMetrics);
        const metricMap = new Map();
        for (const m of allMetrics) {
            const existing = metricMap.get(m.publishTaskId);
            if (!existing || (m.fetchedAt || '') > (existing.fetchedAt || '')) {
                metricMap.set(m.publishTaskId, m);
            }
        }
        const agg = {};
        for (const t of tasks) {
            if (!agg[t.platform]) {
                agg[t.platform] = { views: 0, likes: 0, comments: 0, shares: 0, taskCount: 0 };
            }
            agg[t.platform].taskCount += 1;
            const m = metricMap.get(t.id);
            if (m) {
                agg[t.platform].views += m.views || 0;
                agg[t.platform].likes += m.likes || 0;
                agg[t.platform].comments += m.comments || 0;
                agg[t.platform].shares += m.shares || 0;
            }
        }
        return agg;
    }
    // ═══════════════ AI 发布建议 ═══════════════
    async suggestPublishTime(platform, contentCategory) {
        const result = await llm_1.llm.completeJSONWithScene('distribute_suggest_time', '自媒体运营专家', style_engine_1.styleEngine.renderPrompt('distribute_suggest_time', {
            platform,
            category: contentCategory || '通用',
        }));
        const items = Array.isArray(result) ? result : result?.suggestions || [];
        const rows = [];
        for (const it of items) {
            const [row] = await db_1.db
                .insert(schema_1.publishSuggestions)
                .values({
                platform,
                suggestedTime: it.time || it.suggested_time || '20:00',
                reason: it.reason || '',
                confidence: Number(it.confidence) || 70,
            })
                .returning();
            rows.push(row);
        }
        return rows;
    }
    async listSuggestions(platform) {
        if (platform) {
            return db_1.db
                .select()
                .from(schema_1.publishSuggestions)
                .where((0, drizzle_orm_1.eq)(schema_1.publishSuggestions.platform, platform))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.publishSuggestions.id));
        }
        return db_1.db.select().from(schema_1.publishSuggestions).orderBy((0, drizzle_orm_1.desc)(schema_1.publishSuggestions.id));
    }
    // ═══════════════ 发布计划 ═══════════════
    async createSchedule(data) {
        return db_1.db
            .insert(schema_1.publishSchedules)
            .values({
            name: data.name,
            platform: data.platform,
            cronExpr: data.cronExpr,
            timeSlots: JSON.stringify(data.timeSlots),
        })
            .returning();
    }
    async listSchedules() {
        return db_1.db
            .select()
            .from(schema_1.publishSchedules)
            .where((0, drizzle_orm_1.eq)(schema_1.publishSchedules.isActive, 1))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.publishSchedules.id));
    }
    async toggleSchedule(id, isActive) {
        return db_1.db
            .update(schema_1.publishSchedules)
            .set({ isActive: isActive ? 1 : 0 })
            .where((0, drizzle_orm_1.eq)(schema_1.publishSchedules.id, id))
            .returning();
    }
    async removeSchedule(id) {
        return db_1.db.delete(schema_1.publishSchedules).where((0, drizzle_orm_1.eq)(schema_1.publishSchedules.id, id));
    }
    /** 初始化样例账号 + 发布计划（仅 Mock 模式体验用） */
    async seedMockAccounts() {
        if (!config_1.USE_MOCK)
            return; // 真实模式不造假账号
        const existing = await db_1.db.select().from(schema_1.platformAccounts).limit(1);
        if (existing.length > 0)
            return;
        const samples = [
            { platform: 'douyin', accountName: '示例抖音号' },
            { platform: 'xiaohongshu', accountName: '示例小红书号' },
            { platform: 'bilibili', accountName: '示例 B 站号' },
            { platform: 'weibo', accountName: '示例微博号' },
        ];
        for (const s of samples) {
            await db_1.db.insert(schema_1.platformAccounts).values({
                ...s,
                cookieData: crypto_storage_1.cryptoStorage.encrypt('(mock-cookie)'),
                lastLoginAt: new Date().toISOString(),
            });
        }
    }
}
exports.DistributeService = DistributeService;
exports.distribute = new DistributeService();
//# sourceMappingURL=distribute.js.map