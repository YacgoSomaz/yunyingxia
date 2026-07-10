"use strict";
/**
 * 主线 D：数据看板（Analytics）
 *
 * 依赖表：publish_tasks（status='published'）+ content_metrics
 *
 * 对外方法：
 *   1. dailyTrend({ days, platform? })           —— 按日趋势（views/likes/comments/shares）
 *   2. platformComparison({ days })              —— 平台对比（views/likes/tasks 累加）
 *   3. topContent({ limit, metric, days? })      —— 爆款 TopN 任务
 *   4. hourHeatmap({ days })                     —— 7×24 小时热度图（以 publishedAt 分桶）
 *   5. aiInsight({ days, platform? })            —— LLM 数据洞察（调 distribute_insight 场景）
 *   6. buildCsv({ days, platform? })             —— 导出明细 CSV
 *
 * 数据生成规则：
 *   - content_metrics.snapshotDate 若为空，按 fetchedAt 当天日期兜底
 *   - 每 task 取其「当天最新」一条 metric，去重；再按天聚合
 *   - dailyTrend 的 days 取最近 N 天（含今天）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analytics = exports.AnalyticsService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
// ══════════════════════════════════════════════════════════════════
// helpers
// ══════════════════════════════════════════════════════════════════
const MS_DAY = 24 * 60 * 60 * 1000;
function toDateKey(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function lastNDates(n) {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * MS_DAY);
        out.push(toDateKey(d.toISOString()));
    }
    return out;
}
/**
 * 将 metrics 列表按 taskId + 天 分桶，保留每天最新的一条快照。
 * 返回：Map<`${taskId}::${date}`, metric>
 */
function latestByDay(metrics) {
    const out = new Map();
    for (const m of metrics) {
        const date = m.snapshotDate || toDateKey(m.fetchedAt);
        if (!date)
            continue;
        const key = `${m.publishTaskId}::${date}`;
        const prev = out.get(key);
        if (!prev || (m.fetchedAt || '') > (prev.fetchedAt || '')) {
            out.set(key, m);
        }
    }
    return out;
}
// ══════════════════════════════════════════════════════════════════
// Service
// ══════════════════════════════════════════════════════════════════
class AnalyticsService {
    /** 拉全量 tasks + metrics —— 看板量级可控，直接读取、内存聚合即可 */
    async loadAll() {
        const [tasks, metrics] = await Promise.all([
            db_1.db.select().from(schema_1.publishTasks),
            db_1.db.select().from(schema_1.contentMetrics),
        ]);
        return { tasks, metrics };
    }
    // ─── 1. 日趋势 ───
    async dailyTrend(opts = {}) {
        const days = Math.max(1, Math.min(opts.days ?? 14, 90));
        const dateKeys = lastNDates(days);
        const { tasks, metrics } = await this.loadAll();
        const taskMap = new Map();
        for (const t of tasks)
            taskMap.set(t.id, t);
        const filtered = opts.platform
            ? metrics.filter((m) => {
                const t = taskMap.get(m.publishTaskId);
                return t && t.platform === opts.platform;
            })
            : metrics;
        const latest = latestByDay(filtered);
        const agg = new Map();
        for (const d of dateKeys)
            agg.set(d, { views: 0, likes: 0, comments: 0, shares: 0, tasks: 0 });
        const taskDateSeen = new Set();
        for (const [key, m] of latest.entries()) {
            const [, date] = key.split('::');
            if (!agg.has(date))
                continue;
            const bucket = agg.get(date);
            bucket.views += m.views || 0;
            bucket.likes += m.likes || 0;
            bucket.comments += m.comments || 0;
            bucket.shares += m.shares || 0;
            const tKey = `${m.publishTaskId}::${date}`;
            if (!taskDateSeen.has(tKey)) {
                taskDateSeen.add(tKey);
                bucket.tasks += 1;
            }
        }
        return dateKeys.map((d) => ({ date: d, ...agg.get(d) }));
    }
    // ─── 2. 平台对比 ───
    async platformComparison(opts = {}) {
        const days = Math.max(1, Math.min(opts.days ?? 14, 365));
        const since = new Date(Date.now() - days * MS_DAY).toISOString();
        const { tasks, metrics } = await this.loadAll();
        const taskMap = new Map();
        for (const t of tasks)
            taskMap.set(t.id, t);
        // FIX 1: views/likes 是累计型指标，不能把同一 task 的多天快照加起来。
        //        → 每个 task 取全局最新一条 metric（无视 fetchedAt 窗口）
        // FIX 2: 窗口语义改为"在窗口内发布的作品"（按 task.publishedAt 判断），
        //        而不是"在窗口内采集到 metric 的"（之前的 bug：若某 task 最后采集
        //        早于窗口，会被完全漏掉，但作品还活着）
        const latestPerTask = new Map();
        for (const m of metrics) {
            const prev = latestPerTask.get(m.publishTaskId);
            if (!prev || (m.fetchedAt || '') > (prev.fetchedAt || '')) {
                latestPerTask.set(m.publishTaskId, m);
            }
        }
        const agg = {};
        for (const m of latestPerTask.values()) {
            const t = taskMap.get(m.publishTaskId);
            if (!t)
                continue;
            // 只统计在窗口内发布的作品
            if (!t.publishedAt || t.publishedAt < since)
                continue;
            const p = t.platform || 'unknown';
            if (!agg[p])
                agg[p] = { platform: p, views: 0, likes: 0, comments: 0, shares: 0, tasks: new Set() };
            agg[p].views += m.views || 0;
            agg[p].likes += m.likes || 0;
            agg[p].comments += m.comments || 0;
            agg[p].shares += m.shares || 0;
            agg[p].tasks.add(t.id);
        }
        return Object.values(agg).map((x) => ({
            platform: x.platform,
            views: x.views,
            likes: x.likes,
            comments: x.comments,
            shares: x.shares,
            tasks: x.tasks.size,
        }));
    }
    // ─── 3. 爆款 TopN ───
    async topContent(opts = {}) {
        const metricKey = opts.metric || 'views';
        const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
        const days = Math.max(1, Math.min(opts.days ?? 30, 365));
        const since = new Date(Date.now() - days * MS_DAY).toISOString();
        const { tasks, metrics } = await this.loadAll();
        const taskMap = new Map();
        for (const t of tasks)
            taskMap.set(t.id, t);
        // 取每个 task 全局最新一条 metric（不在 since 上过滤）
        const latest = new Map();
        for (const m of metrics) {
            const prev = latest.get(m.publishTaskId);
            if (!prev || (m.fetchedAt || '') > (prev.fetchedAt || '')) {
                latest.set(m.publishTaskId, m);
            }
        }
        const rows = [];
        for (const m of latest.values()) {
            const t = taskMap.get(m.publishTaskId);
            if (!t)
                continue;
            // 窗口语义：在 since 之后发布的作品
            if (!t.publishedAt || t.publishedAt < since)
                continue;
            rows.push({
                taskId: t.id,
                platform: t.platform,
                title: t.title,
                publishedAt: t.publishedAt,
                views: m.views || 0,
                likes: m.likes || 0,
                comments: m.comments || 0,
                shares: m.shares || 0,
                score: m[metricKey] || 0,
            });
        }
        rows.sort((a, b) => b.score - a.score);
        return rows.slice(0, limit);
    }
    // ─── 4. 7×24 小时热度图 ───
    async hourHeatmap(opts = {}) {
        const days = Math.max(1, Math.min(opts.days ?? 30, 365));
        const since = new Date(Date.now() - days * MS_DAY).toISOString();
        const { tasks, metrics } = await this.loadAll();
        const taskMap = new Map();
        for (const t of tasks)
            taskMap.set(t.id, t);
        // 7×24 矩阵（dayOfWeek 0=Sun / hour 0-23）
        const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
        const taskCount = Array.from({ length: 7 }, () => Array(24).fill(0));
        // 每个 task 取全局最新 metric（不在 since 上过滤），发布时间落桶
        const latest = new Map();
        for (const m of metrics) {
            const prev = latest.get(m.publishTaskId);
            if (!prev || (m.fetchedAt || '') > (prev.fetchedAt || '')) {
                latest.set(m.publishTaskId, m);
            }
        }
        for (const m of latest.values()) {
            const t = taskMap.get(m.publishTaskId);
            if (!t || !t.publishedAt)
                continue;
            // 窗口语义：在 since 之后发布的作品
            if (t.publishedAt < since)
                continue;
            const d = new Date(t.publishedAt);
            if (isNaN(d.getTime()))
                continue;
            const dow = d.getDay();
            const hr = d.getHours();
            matrix[dow][hr] += m.views || 0;
            taskCount[dow][hr] += 1;
        }
        const cells = [];
        for (let dow = 0; dow < 7; dow++) {
            for (let hr = 0; hr < 24; hr++) {
                cells.push({ dayOfWeek: dow, hour: hr, views: matrix[dow][hr], tasks: taskCount[dow][hr] });
            }
        }
        return cells;
    }
    // ─── 5. AI 数据洞察 ───
    async aiInsight(opts = {}) {
        const days = opts.days ?? 14;
        const [trend, platforms, top] = await Promise.all([
            this.dailyTrend({ days, platform: opts.platform }),
            this.platformComparison({ days }),
            this.topContent({ limit: 5, metric: 'views', days }),
        ]);
        // 汇总数字塞给 LLM，避免 Prompt 过长
        const totalViews = trend.reduce((s, d) => s + d.views, 0);
        const totalLikes = trend.reduce((s, d) => s + d.likes, 0);
        const totalShares = trend.reduce((s, d) => s + d.shares, 0);
        const totalTasks = trend.reduce((s, d) => s + d.tasks, 0);
        const summary = {
            range: `${trend[0]?.date || ''} ~ ${trend[trend.length - 1]?.date || ''}`,
            platformFilter: opts.platform || '全部',
            totals: { views: totalViews, likes: totalLikes, shares: totalShares, tasks: totalTasks },
            trend: trend.map((d) => ({ date: d.date, views: d.views, likes: d.likes })),
            platforms,
            topContent: top.map((t) => ({
                platform: t.platform,
                title: t.title.slice(0, 30),
                views: t.views,
                likes: t.likes,
            })),
        };
        // 没数据直接返回固定提示，不浪费 LLM token
        if (totalViews === 0 && totalTasks === 0) {
            return {
                summary,
                insights: [
                    {
                        title: '还没有数据',
                        detail: '当前范围内没有已发布作品或还没采集到指标。先去分发中心发布作品，等 24h 后再回来看数据。',
                        severity: 'info',
                    },
                ],
                recommendations: [
                    '在分发中心选一条文案 + 视频发布到至少 1 个平台',
                    '发布后等 24 小时让平台数据稳定下来',
                    '回到这里看哪些作品/时段表现更好，复制成功',
                ],
            };
        }
        const sys = '你是一位专业自媒体数据分析师。基于给定统计数据给出 4-6 条可操作的洞察（insights）：' +
            '关注趋势、爆款特征、平台差异、发布时段；每条洞察要具体、带数字支撑；' +
            '然后给出 2-3 条改进建议（recommendations）。' +
            '严格以 JSON 输出：{"insights":[{"title":"...","detail":"...","severity":"info|warn|good"}],"recommendations":["..."]}';
        const user = `数据摘要：\n${JSON.stringify(summary, null, 2)}`;
        try {
            const result = await llm_1.llm.completeJSONWithScene('distribute_insight', sys, user);
            return {
                summary,
                insights: Array.isArray(result.insights) ? result.insights : [],
                recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
            };
        }
        catch (err) {
            logger_1.logger.warn('[Analytics] aiInsight LLM failed, fallback to rule-based: ' + String(err));
            return {
                summary,
                insights: this.ruleBasedInsights(summary),
                recommendations: ['持续保持发布节奏', '重点关注表现最好的平台', '尝试在高峰时段发布'],
            };
        }
    }
    /** LLM 不可用时的兜底规则洞察 */
    ruleBasedInsights(summary) {
        const out = [];
        const { totals, platforms, trend } = summary;
        if (totals.views === 0) {
            out.push({
                title: '暂无已发布数据',
                detail: '还没有任何作品被发布或还没有抓取到指标，请先在「分发」中发布几条再来看板',
                severity: 'warn',
            });
            return out;
        }
        if (platforms.length > 1) {
            const best = [...platforms].sort((a, b) => b.views - a.views)[0];
            out.push({
                title: `${best.platform} 是你最好的平台`,
                detail: `累计 ${best.views.toLocaleString()} 浏览、${best.likes.toLocaleString()} 点赞，占比超其它平台`,
                severity: 'good',
            });
        }
        if (trend.length >= 3) {
            const last3 = trend.slice(-3).reduce((s, d) => s + d.views, 0);
            const prev3 = trend.slice(-6, -3).reduce((s, d) => s + d.views, 0);
            if (prev3 > 0) {
                const delta = ((last3 - prev3) / prev3) * 100;
                out.push({
                    title: delta >= 0 ? '近 3 天浏览上升' : '近 3 天浏览下降',
                    detail: `较上 3 天 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
                    severity: delta >= 0 ? 'good' : 'warn',
                });
            }
        }
        return out;
    }
    // ─── 6. CSV 导出 ───
    async buildCsv(opts = {}) {
        const days = Math.max(1, Math.min(opts.days ?? 30, 365));
        const since = new Date(Date.now() - days * MS_DAY).toISOString();
        const { tasks, metrics } = await this.loadAll();
        const taskMap = new Map();
        for (const t of tasks)
            taskMap.set(t.id, t);
        const rows = metrics
            .filter((m) => (m.fetchedAt || '') >= since)
            .filter((m) => {
            if (!opts.platform)
                return true;
            const t = taskMap.get(m.publishTaskId);
            return t && t.platform === opts.platform;
        })
            .sort((a, b) => (b.fetchedAt || '').localeCompare(a.fetchedAt || ''));
        const header = [
            'taskId',
            'platform',
            'title',
            'publishedAt',
            'snapshotDate',
            'fetchedAt',
            'views',
            'likes',
            'comments',
            'shares',
            'followersGained',
        ];
        const escape = (v) => {
            const s = v == null ? '' : String(v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replaceAll('"', '""') + '"';
            }
            return s;
        };
        const lines = [header.join(',')];
        for (const m of rows) {
            const t = taskMap.get(m.publishTaskId);
            if (!t)
                continue;
            lines.push([
                t.id,
                t.platform,
                t.title,
                t.publishedAt || '',
                m.snapshotDate || toDateKey(m.fetchedAt),
                m.fetchedAt,
                m.views || 0,
                m.likes || 0,
                m.comments || 0,
                m.shares || 0,
                m.followersGained || 0,
            ]
                .map(escape)
                .join(','));
        }
        // 加 BOM，保证 Excel 中文不乱码
        return '\ufeff' + lines.join('\n');
    }
    /** 汇总卡片：累计总数（给 Dashboard / Analytics 顶栏用） */
    async summary() {
        const { tasks, metrics } = await this.loadAll();
        const taskMap = new Map();
        for (const t of tasks)
            taskMap.set(t.id, t);
        const latest = new Map();
        for (const m of metrics) {
            const prev = latest.get(m.publishTaskId);
            if (!prev || (m.fetchedAt || '') > (prev.fetchedAt || '')) {
                latest.set(m.publishTaskId, m);
            }
        }
        let views = 0, likes = 0, comments = 0, shares = 0;
        for (const m of latest.values()) {
            views += m.views || 0;
            likes += m.likes || 0;
            comments += m.comments || 0;
            shares += m.shares || 0;
        }
        const publishedCount = tasks.filter((t) => t.status === 'published').length;
        return {
            totalTasks: tasks.length,
            publishedCount,
            views,
            likes,
            comments,
            shares,
        };
    }
}
exports.AnalyticsService = AnalyticsService;
exports.analytics = new AnalyticsService();
//# sourceMappingURL=analytics.js.map