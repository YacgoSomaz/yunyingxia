"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboard = void 0;
/**
 * 首页聚合服务 —— 一次 DB 往返返回首页需要的全部数据。
 *
 * 设计决策：
 * - 全部只读查询，并发跑，避免 N+1
 * - 返回结构对前端友好：stats / quickInsights / pipelines / todos
 * - 平台白名单过滤，防止历史脏数据（空 platform、未知 platform）混进统计
 */
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const SUPPORTED_PLATFORMS = [
    'douyin',
    'xiaohongshu',
    'bilibili',
    'weibo',
    'weixin',
    'kuaishou',
];
/** 本地日 YYYY-MM-DD（按机器时区） */
function localDay(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
function startOfTodayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}
function startOfWeekISO() {
    const d = new Date();
    const day = d.getDay() || 7; // 周一为 1，周日为 7
    d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}
class DashboardService {
    async summary() {
        const todayStart = startOfTodayISO();
        const weekStart = startOfWeekISO();
        const todayLocal = localDay();
        // ═══ 并发拉主表计数 + 最新 5 条文案 + 所有 tasks/metrics ═══
        const [copyCntRow, adCntRow, oneCntRow, coverCntRow, taskCntRow, todayCopyCntRow, weekCopyCntRow, recentCopies, allTasks, latestMetricsPerTask,] = await Promise.all([
            db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.copywritings),
            db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.adVideos),
            db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.slideshowVideos),
            db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.covers),
            db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.publishTasks),
            db_1.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)` })
                .from(schema_1.copywritings)
                .where((0, drizzle_orm_1.gte)(schema_1.copywritings.createdAt, todayStart)),
            db_1.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)` })
                .from(schema_1.copywritings)
                .where((0, drizzle_orm_1.gte)(schema_1.copywritings.createdAt, weekStart)),
            db_1.db.select().from(schema_1.copywritings).orderBy((0, drizzle_orm_1.desc)(schema_1.copywritings.id)).limit(5),
            db_1.db.select().from(schema_1.publishTasks),
            // 每个 task 取最新一条 metrics —— 用 JS 合并，SQLite 里 group-by+sub-select 写起来更绕
            db_1.db.select().from(schema_1.contentMetrics).orderBy((0, drizzle_orm_1.desc)(schema_1.contentMetrics.fetchedAt)),
        ]);
        // metrics：每个 task 只保留最新一条
        const metricMap = new Map();
        for (const m of latestMetricsPerTask) {
            if (!metricMap.has(m.publishTaskId))
                metricMap.set(m.publishTaskId, m);
        }
        // overview by platform（只算白名单平台）
        const overviewByPlatform = {};
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let publishedCount = 0;
        let todayPublished = 0;
        for (const t of allTasks) {
            if (!SUPPORTED_PLATFORMS.includes(t.platform))
                continue;
            if (!overviewByPlatform[t.platform]) {
                overviewByPlatform[t.platform] = {
                    views: 0,
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    taskCount: 0,
                };
            }
            const agg = overviewByPlatform[t.platform];
            agg.taskCount += 1;
            if (t.status === 'published' || t.publishedAt) {
                publishedCount += 1;
                if (t.publishedAt && t.publishedAt.slice(0, 10) === todayLocal)
                    todayPublished += 1;
            }
            const m = metricMap.get(t.id);
            if (m) {
                agg.views += m.views || 0;
                agg.likes += m.likes || 0;
                agg.comments += m.comments || 0;
                agg.shares += m.shares || 0;
                totalViews += m.views || 0;
                totalLikes += m.likes || 0;
                totalComments += m.comments || 0;
            }
        }
        // ═══ 为最近 5 条文案批量拉衍生作品（只拉 id 用于计数） ═══
        const copyIds = recentCopies.map((c) => c.id);
        const [relatedAd, relatedOne, relatedCover, relatedTasks] = copyIds.length === 0
            ? [[], [], [], []]
            : await Promise.all([
                db_1.db
                    .select({ id: schema_1.adVideos.id, copywritingId: schema_1.adVideos.copywritingId })
                    .from(schema_1.adVideos)
                    .where((0, drizzle_orm_1.sql) `${schema_1.adVideos.copywritingId} IN ${copyIds}`),
                db_1.db
                    .select({ id: schema_1.slideshowVideos.id, copywritingId: schema_1.slideshowVideos.copywritingId })
                    .from(schema_1.slideshowVideos)
                    .where((0, drizzle_orm_1.sql) `${schema_1.slideshowVideos.copywritingId} IN ${copyIds}`),
                db_1.db
                    .select({ id: schema_1.covers.id, copywritingId: schema_1.covers.copywritingId })
                    .from(schema_1.covers)
                    .where((0, drizzle_orm_1.sql) `${schema_1.covers.copywritingId} IN ${copyIds}`),
                db_1.db
                    .select({
                    id: schema_1.publishTasks.id,
                    copywritingId: schema_1.publishTasks.copywritingId,
                    status: schema_1.publishTasks.status,
                })
                    .from(schema_1.publishTasks)
                    .where((0, drizzle_orm_1.sql) `${schema_1.publishTasks.copywritingId} IN ${copyIds}`),
            ]);
        const countBy = (arr) => {
            const m = new Map();
            for (const r of arr) {
                if (r.copywritingId != null)
                    m.set(r.copywritingId, (m.get(r.copywritingId) || 0) + 1);
            }
            return m;
        };
        const adCountMap = countBy(relatedAd);
        const oneCountMap = countBy(relatedOne);
        const coverCountMap = countBy(relatedCover);
        const taskCountMap = countBy(relatedTasks);
        const publishedTaskCountMap = (() => {
            const m = new Map();
            for (const r of relatedTasks) {
                if (r.copywritingId != null && r.status === 'published') {
                    m.set(r.copywritingId, (m.get(r.copywritingId) || 0) + 1);
                }
            }
            return m;
        })();
        const pipelines = recentCopies.map((c) => {
            const adCount = adCountMap.get(c.id) || 0;
            const oneCount = oneCountMap.get(c.id) || 0;
            const coverCount = coverCountMap.get(c.id) || 0;
            const taskCount = taskCountMap.get(c.id) || 0;
            const publishedTaskCount = publishedTaskCountMap.get(c.id) || 0;
            // 智能下一步：
            //   无视频 → 去视频工坊
            //   有视频无任务 → 去分发
            //   有任务有未发布 → 去分发
            //   全部发布 → 看数据（copywriting 分析页）
            let nextAction = null;
            const hasVideo = adCount + oneCount > 0;
            if (!hasVideo)
                nextAction = { label: '生成视频', to: '/video' };
            else if (taskCount === 0)
                nextAction = { label: '去分发', to: '/distribute' };
            else if (taskCount > publishedTaskCount)
                nextAction = { label: '完成发布', to: '/distribute' };
            return {
                copywriting: {
                    id: c.id,
                    title: c.title,
                    platform: c.platform,
                    wordCount: c.wordCount || 0,
                    status: c.status || 'draft',
                    auditLevel: c.auditLevel ?? null,
                    createdAt: c.createdAt,
                },
                adVideoCount: adCount,
                oneClickVideoCount: oneCount,
                coverCount,
                taskCount,
                publishedTaskCount,
                nextAction,
            };
        });
        // ═══ 待办面板：全局扫描（有上限，避免 N 条慢查）═══
        // 1) 最近没视频的文案（最多 5）
        const allCopiesForTodo = await db_1.db
            .select({ id: schema_1.copywritings.id, title: schema_1.copywritings.title, platform: schema_1.copywritings.platform })
            .from(schema_1.copywritings)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.copywritings.id))
            .limit(20);
        const copyHasVideo = new Set();
        {
            const [adAll, oneAll] = await Promise.all([
                db_1.db
                    .select({ copywritingId: schema_1.adVideos.copywritingId })
                    .from(schema_1.adVideos)
                    .where((0, drizzle_orm_1.sql) `${schema_1.adVideos.copywritingId} IS NOT NULL`),
                db_1.db
                    .select({ copywritingId: schema_1.slideshowVideos.copywritingId })
                    .from(schema_1.slideshowVideos)
                    .where((0, drizzle_orm_1.sql) `${schema_1.slideshowVideos.copywritingId} IS NOT NULL`),
            ]);
            for (const r of adAll)
                if (r.copywritingId)
                    copyHasVideo.add(r.copywritingId);
            for (const r of oneAll)
                if (r.copywritingId)
                    copyHasVideo.add(r.copywritingId);
        }
        const copiesWithoutVideo = allCopiesForTodo
            .filter((c) => !copyHasVideo.has(c.id))
            .slice(0, 5);
        // 2) 有视频但没发布任务
        const allVideosForTodo = [];
        {
            const [adAll, oneAll] = await Promise.all([
                db_1.db
                    .select({
                    id: schema_1.adVideos.id,
                    title: schema_1.adVideos.creativeDesc,
                    copywritingId: schema_1.adVideos.copywritingId,
                    status: schema_1.adVideos.status,
                })
                    .from(schema_1.adVideos)
                    .orderBy((0, drizzle_orm_1.desc)(schema_1.adVideos.id))
                    .limit(20),
                db_1.db
                    .select({
                    id: schema_1.slideshowVideos.id,
                    title: schema_1.slideshowVideos.title,
                    copywritingId: schema_1.slideshowVideos.copywritingId,
                    status: schema_1.slideshowVideos.status,
                })
                    .from(schema_1.slideshowVideos)
                    .orderBy((0, drizzle_orm_1.desc)(schema_1.slideshowVideos.id))
                    .limit(20),
            ]);
            const taskCwIds = new Set(allTasks.map((t) => t.copywritingId).filter(Boolean));
            for (const r of adAll) {
                if (r.status !== 'completed' && r.status !== 'done')
                    continue;
                if (!r.copywritingId || taskCwIds.has(r.copywritingId))
                    continue;
                allVideosForTodo.push({
                    id: r.id,
                    title: r.title?.slice(0, 40) || `广告视频 #${r.id}`,
                    kind: 'adVideo',
                    copywritingId: r.copywritingId,
                });
            }
            for (const r of oneAll) {
                if (r.status !== 'completed' && r.status !== 'done')
                    continue;
                if (!r.copywritingId || taskCwIds.has(r.copywritingId))
                    continue;
                allVideosForTodo.push({
                    id: r.id,
                    title: r.title || `一键成片 #${r.id}`,
                    kind: 'oneClick',
                    copywritingId: r.copywritingId,
                });
            }
        }
        const videosWithoutTask = allVideosForTodo.slice(0, 5);
        // 3) 失败任务
        const failedTaskRows = await db_1.db
            .select({
            id: schema_1.publishTasks.id,
            title: schema_1.publishTasks.title,
            platform: schema_1.publishTasks.platform,
            errorMsg: schema_1.publishTasks.errorMsg,
        })
            .from(schema_1.publishTasks)
            .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.status, 'failed'))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.publishTasks.id))
            .limit(5);
        // 4) 需人工处理的审核
        const riskyAudits = await db_1.db
            .select({
            id: schema_1.copywritings.id,
            title: schema_1.copywritings.title,
            auditLevel: schema_1.copywritings.auditLevel,
        })
            .from(schema_1.copywritings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.copywritings.auditLevel} IS NOT NULL`, (0, drizzle_orm_1.sql) `${schema_1.copywritings.auditLevel} IN ('warning','risky')`))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.copywritings.id))
            .limit(5);
        return {
            stats: {
                totalCopy: Number(copyCntRow[0]?.c || 0),
                totalAdVideo: Number(adCntRow[0]?.c || 0),
                totalOneClickVideo: Number(oneCntRow[0]?.c || 0),
                totalCover: Number(coverCntRow[0]?.c || 0),
                totalTask: Number(taskCntRow[0]?.c || 0),
                publishedCount,
                totalViews,
                totalLikes,
                totalComments,
                todayNewCopy: Number(todayCopyCntRow[0]?.c || 0),
                weekNewCopy: Number(weekCopyCntRow[0]?.c || 0),
                todayPublished,
            },
            overviewByPlatform,
            pipelines,
            todos: {
                copiesWithoutVideo,
                videosWithoutTask,
                failedTasks: failedTaskRows.map((r) => ({
                    id: r.id,
                    title: r.title,
                    platform: r.platform,
                    errorMsg: r.errorMsg,
                })),
                riskyAudits: riskyAudits.map((r) => ({
                    id: r.id,
                    title: r.title,
                    auditLevel: r.auditLevel || 'pending',
                })),
            },
        };
    }
}
exports.dashboard = new DashboardService();
//# sourceMappingURL=dashboard.js.map