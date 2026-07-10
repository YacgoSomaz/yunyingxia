"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topicRadar = exports.TopicRadarService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const llm_1 = require("./llm");
const style_engine_1 = require("./style-engine");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const topic_data_sources_1 = require("./topic-data-sources");
const topic_scrapers_1 = require("./topic-scrapers");
const scheduler_1 = require("./scheduler");
// 离线/所有真实源都挂掉时的兜底样例（仅保留最少条数，避免用户看到空界面）
const OFFLINE_FALLBACK = {
    weibo: [
        { keyword: '（离线）微博热搜示例 1', heatScore: 10000, category: '时事', trend: 'rising' },
        { keyword: '（离线）微博热搜示例 2', heatScore: 8800, category: '娱乐', trend: 'stable' },
    ],
    baidu: [{ keyword: '（离线）百度风云榜示例', heatScore: 9000, category: '时事', trend: 'stable' }],
    zhihu: [{ keyword: '（离线）知乎热榜示例', heatScore: 7000, category: '知识', trend: 'stable' }],
    bilibili: [{ keyword: '（离线）B 站热搜示例', heatScore: 7800, category: '科技', trend: 'stable' }],
    douyin: [{ keyword: '（离线）抖音示例', heatScore: 7200, category: '生活', trend: 'stable' }],
    xiaohongshu: [{ keyword: '（离线）小红书示例', heatScore: 7100, category: '好物', trend: 'stable' }],
};
const LLM_PLATFORMS = new Set(['douyin', 'xiaohongshu', 'kuaishou', 'weixin']);
class TopicRadarService {
    /** 返回已支持的平台及其数据来源类型（前端展示用） */
    async listPlatforms() {
        // 带上每个平台最新一条的 fetchedAt —— 前端展示"数据新鲜度"
        const lastFetchRows = (await db_1.db
            .select({
            platform: schema_1.topics.platform,
            lastFetchedAt: (0, drizzle_orm_1.sql) `MAX(${schema_1.topics.fetchedAt})`,
            totalCount: (0, drizzle_orm_1.sql) `COUNT(*)`,
        })
            .from(schema_1.topics)
            .groupBy(schema_1.topics.platform));
        const lastByPlatform = new Map(lastFetchRows.map((r) => [r.platform, { lastFetchedAt: r.lastFetchedAt, totalCount: r.totalCount }]));
        return Object.entries(topic_data_sources_1.PLATFORM_META).map(([key, meta]) => {
            const stat = lastByPlatform.get(key);
            return {
                platform: key,
                label: meta.label,
                sourceType: meta.sourceType,
                note: meta.note,
                lastFetchedAt: stat?.lastFetchedAt || null,
                totalCount: stat?.totalCount || 0,
            };
        });
    }
    /**
     * 抓取热搜：
     *   - 对接真实数据源（微博/百度/知乎/B站）
     *   - 抖音/小红书等走 LLM 推测
     *   - 全挂时走本地兜底样例
     *   - USE_MOCK=1 强制走兜底（离线演示）
     */
    async fetchHotTopics(platform) {
        // 1. 拉数据（Mock 模式或真实源都走同一套存库逻辑）
        let candidates = [];
        let scraperError;
        let scraperErrorMessage;
        let scraperAccount;
        if (config_1.USE_MOCK) {
            candidates = (OFFLINE_FALLBACK[platform] || []).map((t) => ({ ...t, source: 'mock' }));
        }
        else {
            // ══ 阶段一：登录态 scraper 优先（对 douyin/xiaohongshu/kuaishou/weixin 生效）══
            if ((0, topic_scrapers_1.getScraper)(platform)) {
                const scraped = await (0, topic_scrapers_1.scrapeByPlatform)(platform);
                scraperAccount = scraped.accountUsed; // 成功失败都回传
                if (scraped.ok) {
                    candidates = scraped.topics.map((t) => ({
                        keyword: t.keyword,
                        heatScore: t.heatScore ?? 0,
                        category: t.category ?? null,
                        trend: t.trend ?? 'stable',
                        source: 'scraper',
                        sourceUrl: t.sourceUrl,
                    }));
                    logger_1.logger.info(`[TopicRadar] ${platform} scraper OK: ${candidates.length} 条`);
                }
                else {
                    scraperError = scraped.errorType;
                    scraperErrorMessage = scraped.errorMessage;
                    logger_1.logger.warn(`[TopicRadar] ${platform} scraper failed: ${scraped.errorType} — ${scraped.errorMessage}`);
                }
            }
            // ══ 阶段二：原有真实数据源（微博/百度/知乎/B站 + 其他平台的 LLM）══
            // 对需要登录态或 LLM 的平台，不能在没有依赖时静默显示离线示例。
            // 这样用户看到的每一条数据都有明确来源，也能直接知道下一步该做什么。
            const hasRealLlm = llm_1.llm.hasAnyRealCredential();
            if (candidates.length === 0 && (!LLM_PLATFORMS.has(platform) || hasRealLlm)) {
                try {
                    const fetched = await (0, topic_data_sources_1.fetchByPlatform)(platform);
                    candidates = fetched.map((t) => ({
                        keyword: t.keyword,
                        heatScore: t.heatScore,
                        category: t.category ?? null,
                        trend: t.trend ?? 'stable',
                        source: t.source,
                        sourceUrl: t.sourceUrl,
                        rawData: t.rawData,
                    }));
                }
                catch (err) {
                    logger_1.logger.error(`[TopicRadar] fetch ${platform} failed: ${String(err)}`);
                }
            }
            if (candidates.length === 0 && LLM_PLATFORMS.has(platform) && !hasRealLlm && !scraperError) {
                scraperError = 'no-llm';
                scraperErrorMessage = '未配置可用的 AI 服务。请到「设置」配置 LLM，或到「分发中心 → 账号」登录后使用平台实时热点。';
            }
            if (candidates.length === 0 && !scraperError) {
                scraperError = 'source-unavailable';
                scraperErrorMessage = '当前真实数据源未返回内容，请稍后重试。';
            }
            // ══ 阶段三：真实模式不再伪造离线数据；离线示例只允许 USE_MOCK=1 ══
            if (candidates.length === 0) {
                logger_1.logger.warn(`[TopicRadar] ${platform} no real data: ${scraperError} — ${scraperErrorMessage}`);
            }
        }
        if (candidates.length === 0)
            return { inserted: 0, source: 'none', scraperError, scraperErrorMessage, scraperAccount };
        // 2. 存库前先清理该平台**所有非收藏**的旧条目
        //    —— 避免 scraper 成功抓的新数据和昨天 LLM 的旧数据混杂
        //    —— 用户收藏（pinned=1）的条目保留
        try {
            await db_1.db
                .delete(schema_1.topics)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.topics.platform, platform), (0, drizzle_orm_1.eq)(schema_1.topics.pinned, 0)));
        }
        catch (err) {
            logger_1.logger.warn(`[TopicRadar] cleanup stale topics failed: ${String(err)}`);
        }
        // 3. 插入新条目
        const now = new Date().toISOString();
        for (const t of candidates) {
            try {
                await db_1.db.insert(schema_1.topics).values({
                    platform,
                    keyword: t.keyword,
                    heatScore: t.heatScore,
                    category: t.category ?? null,
                    trend: t.trend ?? 'stable',
                    source: t.source ?? 'real',
                    sourceUrl: t.sourceUrl ?? null,
                    rawData: t.rawData ? JSON.stringify(t.rawData) : null,
                    fetchedAt: now,
                });
            }
            catch (err) {
                logger_1.logger.warn(`[TopicRadar] insert failed for ${t.keyword}: ${String(err)}`);
            }
        }
        const source = candidates[0]?.source || 'real';
        return {
            inserted: candidates.length,
            source,
            scraperError,
            scraperErrorMessage,
            scraperAccount,
        };
    }
    /** AI 分析选题 */
    async analyzeTopic(topicId) {
        const [topic] = await db_1.db.select().from(schema_1.topics).where((0, drizzle_orm_1.eq)(schema_1.topics.id, topicId));
        if (!topic)
            throw new Error('Topic not found');
        const prompt = style_engine_1.styleEngine.renderPrompt('topic_analyze', {
            keyword: topic.keyword,
            platform: topic.platform,
            heat_score: String(topic.heatScore ?? 0),
        });
        const result = await llm_1.llm.completeJSONWithScene('topic_analyze', '你是自媒体内容策划专家。', prompt);
        const inserted = await db_1.db
            .insert(schema_1.topicAnalyses)
            .values({
            topicId,
            angles: JSON.stringify(result.angles ?? []),
            targetAudience: result.target_audience ?? null,
            contentSuggestions: JSON.stringify(result),
            competitionLevel: result.competition_level ?? 'medium',
            score: result.score ?? 0,
            llmModel: config_1.USE_MOCK ? 'mock-v1' : 'qwen-plus',
        })
            .returning();
        return { ...inserted[0], parsed: result };
    }
    /** 获取单条话题的分析结果（最新的一条） */
    async getAnalysis(topicId) {
        const rows = await db_1.db
            .select()
            .from(schema_1.topicAnalyses)
            .where((0, drizzle_orm_1.eq)(schema_1.topicAnalyses.topicId, topicId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.topicAnalyses.id))
            .limit(1);
        return rows[0] || null;
    }
    /** 删除单条话题（附带清掉它的 AI 分析结果） */
    async removeTopic(id) {
        await db_1.db.delete(schema_1.topicAnalyses).where((0, drizzle_orm_1.eq)(schema_1.topicAnalyses.topicId, id));
        await db_1.db.delete(schema_1.topics).where((0, drizzle_orm_1.eq)(schema_1.topics.id, id));
        return { removed: true, id };
    }
    async removeTopicMany(ids) {
        let n = 0;
        for (const id of ids) {
            try {
                await this.removeTopic(id);
                n++;
            }
            catch (err) {
                logger_1.logger.warn(`[TopicRadar] remove #${id} failed: ${err}`);
            }
        }
        return { removed: n };
    }
    /** 清空某个平台的所有话题 */
    async clearPlatform(platform) {
        // 先拿到该平台所有 topic id
        const rows = await db_1.db.select({ id: schema_1.topics.id }).from(schema_1.topics).where((0, drizzle_orm_1.eq)(schema_1.topics.platform, platform));
        const ids = rows.map((r) => r.id);
        if (ids.length === 0)
            return { removed: 0 };
        // 清 AI 分析
        for (const id of ids) {
            await db_1.db.delete(schema_1.topicAnalyses).where((0, drizzle_orm_1.eq)(schema_1.topicAnalyses.topicId, id));
        }
        // 清 topics
        await db_1.db.delete(schema_1.topics).where((0, drizzle_orm_1.eq)(schema_1.topics.platform, platform));
        return { removed: ids.length };
    }
    /**
     * 获取热搜列表 —— 支持过滤/排序/搜索。
     *
     * @param opts.platform 平台过滤
     * @param opts.keyword 模糊搜关键词（LIKE %kw%）
     * @param opts.category 分类精确过滤
     * @param opts.source 来源过滤（real|llm|mock）
     * @param opts.trend 趋势过滤（rising|stable|falling）
     * @param opts.pinnedOnly 只看收藏
     * @param opts.sort 排序：heat（默认）| time | pinned
     */
    async listTopics(opts = {}) {
        const { platform, keyword, category, source, trend, pinnedOnly, sort = 'heat', page = 1, pageSize = 20, } = opts;
        const conds = [];
        if (platform)
            conds.push((0, drizzle_orm_1.eq)(schema_1.topics.platform, platform));
        if (keyword)
            conds.push((0, drizzle_orm_1.like)(schema_1.topics.keyword, `%${keyword}%`));
        if (category)
            conds.push((0, drizzle_orm_1.eq)(schema_1.topics.category, category));
        if (source)
            conds.push((0, drizzle_orm_1.eq)(schema_1.topics.source, source));
        if (trend)
            conds.push((0, drizzle_orm_1.eq)(schema_1.topics.trend, trend));
        if (pinnedOnly)
            conds.push((0, drizzle_orm_1.eq)(schema_1.topics.pinned, 1));
        const where = conds.length > 0 ? (0, drizzle_orm_1.and)(...conds) : undefined;
        // 排序
        let orderClause;
        if (sort === 'time')
            orderClause = [(0, drizzle_orm_1.desc)(schema_1.topics.fetchedAt), (0, drizzle_orm_1.desc)(schema_1.topics.heatScore)];
        else if (sort === 'pinned')
            orderClause = [(0, drizzle_orm_1.desc)(schema_1.topics.pinned), (0, drizzle_orm_1.desc)(schema_1.topics.heatScore)];
        else
            orderClause = [(0, drizzle_orm_1.desc)(schema_1.topics.pinned), (0, drizzle_orm_1.desc)(schema_1.topics.heatScore)]; // 默认：置顶在前，然后热度
        // 真 total
        const totalRow = await (where
            ? db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.topics).where(where)
            : db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.topics));
        const total = Number(totalRow[0]?.c || 0);
        // 数据
        const base = where ? db_1.db.select().from(schema_1.topics).where(where) : db_1.db.select().from(schema_1.topics);
        const rows = await base
            .orderBy(...orderClause)
            .limit(pageSize)
            .offset((page - 1) * pageSize);
        // hasAnalysis 批量标记
        let analyzedSet = new Set();
        if (rows.length > 0) {
            const ids = rows.map((r) => r.id);
            const analyzed = await db_1.db
                .select({ topicId: schema_1.topicAnalyses.topicId })
                .from(schema_1.topicAnalyses)
                .where((0, drizzle_orm_1.inArray)(schema_1.topicAnalyses.topicId, ids));
            analyzedSet = new Set(analyzed.map((a) => a.topicId));
        }
        const items = rows.map((r) => ({ ...r, hasAnalysis: analyzedSet.has(r.id) }));
        return { items, page, pageSize, total };
    }
    /** 切换收藏状态 */
    async togglePin(id) {
        const [row] = await db_1.db.select().from(schema_1.topics).where((0, drizzle_orm_1.eq)(schema_1.topics.id, id));
        if (!row)
            throw new Error('Topic not found');
        const newPinned = row.pinned ? 0 : 1;
        await db_1.db.update(schema_1.topics).set({ pinned: newPinned }).where((0, drizzle_orm_1.eq)(schema_1.topics.id, id));
        return { id, pinned: newPinned };
    }
    /** 批量 AI 分析（逐条跑，任一条失败不影响其他） */
    async analyzeBatch(ids) {
        const results = [];
        for (const id of ids) {
            try {
                // 已分析过的跳过（避免重复烧 token）
                const existing = await this.getAnalysis(id);
                if (existing) {
                    results.push({ id, ok: true });
                    continue;
                }
                await this.analyzeTopic(id);
                results.push({ id, ok: true });
            }
            catch (err) {
                results.push({ id, ok: false, error: String(err?.message || err) });
            }
        }
        return results;
    }
    /** 内容日历 */
    async addCalendarItem(data) {
        return db_1.db
            .insert(schema_1.contentCalendar)
            .values({
            date: data.date,
            title: data.title,
            platform: data.platform,
            topicId: data.topicId,
            notes: data.notes,
            status: data.status ?? 'planned',
            timeOfDay: data.timeOfDay,
            copywritingId: data.copywritingId,
        })
            .returning();
    }
    async listCalendar(month) {
        if (month) {
            return db_1.db
                .select()
                .from(schema_1.contentCalendar)
                .where((0, drizzle_orm_1.like)(schema_1.contentCalendar.date, `${month}%`))
                .orderBy(schema_1.contentCalendar.date);
        }
        return db_1.db.select().from(schema_1.contentCalendar).orderBy(schema_1.contentCalendar.date);
    }
    async updateCalendarStatus(id, status) {
        return db_1.db
            .update(schema_1.contentCalendar)
            .set({ status })
            .where((0, drizzle_orm_1.eq)(schema_1.contentCalendar.id, id))
            .returning();
    }
    async removeCalendarItem(id) {
        return db_1.db.delete(schema_1.contentCalendar).where((0, drizzle_orm_1.eq)(schema_1.contentCalendar.id, id));
    }
    /**
     * 聚合日历：合并三种来源
     *  - 手动排期（content_calendar.date，天然就是本地日期）
     *  - 发布任务（publish_tasks.scheduledAt，ISO UTC → 按 server 本地时区转）
     *  - 调度器（publish_schedules：按 cronExpr / timeSlots 展开当月所有触发点）
     *
     * 返回按日期分组的结果：{ 'YYYY-MM-DD': Event[] }
     *
     * 说明：Electron 场景下 main 进程和用户在同一台机器，server 本地时区
     * 即用户的显示时区。跨月边界不再用字符串前缀过滤，避免 UTC/本地错位。
     */
    async listCombinedCalendar(month) {
        // month 形如 "YYYY-MM"，如果没传就用"当前本地月"（注意不能用 toISOString 拿）
        const now = new Date();
        const monthPrefix = month ||
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [yy, mm] = monthPrefix.split('-').map(Number);
        // 本地日期范围：当月 1 号 00:00 ~ 次月 1 号 00:00
        const monthStart = new Date(yy, mm - 1, 1, 0, 0, 0, 0);
        const monthEnd = new Date(yy, mm, 1, 0, 0, 0, 0);
        // SQL 范围广一点（各留一天缓冲），避免跨日边界 ISO 字符串漏查
        const sqlStart = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const sqlEnd = new Date(monthEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const [manual, tasks, schedules] = await Promise.all([
            db_1.db
                .select()
                .from(schema_1.contentCalendar)
                .where((0, drizzle_orm_1.like)(schema_1.contentCalendar.date, `${monthPrefix}%`))
                .orderBy(schema_1.contentCalendar.date),
            db_1.db
                .select()
                .from(schema_1.publishTasks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.publishTasks.scheduledAt} IS NOT NULL`, (0, drizzle_orm_1.sql) `${schema_1.publishTasks.scheduledAt} >= ${sqlStart}`, (0, drizzle_orm_1.sql) `${schema_1.publishTasks.scheduledAt} < ${sqlEnd}`)),
            db_1.db.select().from(schema_1.publishSchedules),
        ]);
        const byDate = new Map();
        const push = (e) => {
            if (!byDate.has(e.date))
                byDate.set(e.date, []);
            byDate.get(e.date).push(e);
        };
        const toLocalDate = (iso) => {
            // "2025-04-30T16:00:00Z" → local date string "YYYY-MM-DD"
            const d = new Date(iso);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const toLocalHHMM = (iso) => {
            const d = new Date(iso);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        // 1. 手动排期（date 本身就是本地 YYYY-MM-DD）
        for (const m of manual) {
            push({
                type: 'manual',
                id: m.id,
                date: m.date,
                title: m.title,
                platform: m.platform,
                status: m.status ?? undefined,
                notes: m.notes,
                timeOfDay: m.timeOfDay ?? null,
                copywritingId: m.copywritingId ?? null,
            });
        }
        // 2. 发布任务：按本地时区换算 date
        let taskInMonth = 0;
        for (const t of tasks) {
            if (!t.scheduledAt)
                continue;
            const localDate = toLocalDate(t.scheduledAt);
            if (!localDate.startsWith(monthPrefix))
                continue; // 边界外丢弃
            taskInMonth++;
            push({
                type: 'task',
                id: t.id,
                date: localDate,
                title: t.title,
                platform: t.platform,
                status: t.status ?? undefined,
                scheduledAt: t.scheduledAt,
                timeOfDay: toLocalHHMM(t.scheduledAt),
            });
        }
        // 3. 调度器：按 cron / timeSlots 展开本月每次触发
        let scheduleFireCount = 0;
        const activeSchedules = schedules.filter((s) => s.isActive);
        for (const s of activeSchedules) {
            const cronExpr = s.cronExpr || '';
            const slots = (0, scheduler_1.parseTimeSlots)(s.timeSlots);
            // 遍历本月每一天
            for (let d = 1; d <= 31; d++) {
                const day = new Date(yy, mm - 1, d);
                if (day.getMonth() !== mm - 1)
                    break; // 跨月了，停
                const dateKey = `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                // 当天触发时分集合（cron ∪ timeSlots）
                const fires = [];
                if (cronExpr && (0, scheduler_1.cronHitsDay)(cronExpr, day)) {
                    fires.push(...(0, scheduler_1.cronFiresInDay)(cronExpr, day, 12));
                }
                for (const slot of slots)
                    fires.push(slot);
                // 同一天多个触发点合并成一条事件（展示"多点"），否则单点展示时分
                if (fires.length === 0)
                    continue;
                const uniq = Array.from(new Set(fires.map((f) => `${String(f.h).padStart(2, '0')}:${String(f.m).padStart(2, '0')}`))).sort();
                scheduleFireCount += uniq.length;
                push({
                    type: 'schedule',
                    id: s.id,
                    date: dateKey,
                    title: `🔁 ${s.name}`,
                    platform: s.platform,
                    status: 'scheduled',
                    timeOfDay: uniq.length === 1 ? uniq[0] : `${uniq[0]}+${uniq.length - 1}`,
                    scheduledAt: s.nextRunAt,
                    notes: uniq.length > 1 ? `本日触发：${uniq.join(' / ')}` : null,
                });
            }
        }
        // 转成 array-of-{date, events}，前端好渲染
        const days = Array.from(byDate.entries())
            .map(([date, events]) => ({ date, events }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return {
            month: monthPrefix,
            days,
            counts: {
                manual: manual.length,
                task: taskInMonth,
                schedule: scheduleFireCount,
            },
        };
    }
}
exports.TopicRadarService = TopicRadarService;
exports.topicRadar = new TopicRadarService();
//# sourceMappingURL=topic-radar.js.map
