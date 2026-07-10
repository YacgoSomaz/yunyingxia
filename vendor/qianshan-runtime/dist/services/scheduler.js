"use strict";
/**
 * 主线 C：发布调度器
 *
 * 职责：
 *   1. 每分钟 tick：检查 `publish_schedules.is_active=1` 的计划，匹配 cron 则触发
 *   2. 每分钟 tick：检查 `publish_tasks.status='scheduled'` 且 `scheduled_at <= now` 的任务 → 执行
 *   3. 失败任务（status='failed' 且 retry_count < max_retries）指数退避重试
 *   4. 账号登录态 SSE：新 `/api/distribute/events` 频道，通过这里广播
 *
 * 为了零额外依赖，cron 解析由本文件内部实现，支持标准 5 字段：
 *   minute hour dayOfMonth month dayOfWeek
 *   每字段支持：*  *\/N  a,b,c  a-b  a-b/c
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduler = exports.Scheduler = void 0;
exports.cronMatches = cronMatches;
exports.cronHitsDay = cronHitsDay;
exports.cronFiresInDay = cronFiresInDay;
exports.parseTimeSlots = parseTimeSlots;
exports.subscribeEvents = subscribeEvents;
exports.broadcastEvent = broadcastEvent;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
const distribute_1 = require("./distribute");
// ══════════════════════════════════════════════════════════════════
// 1. Cron 解析（极简版）
// ══════════════════════════════════════════════════════════════════
const FIELD_RANGE = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // dayOfMonth
    [1, 12], // month
    [0, 6], // dayOfWeek (0=Sunday)
];
function parseField(field, min, max) {
    const result = new Set();
    if (!field)
        return result;
    for (const part of field.split(',')) {
        let step = 1;
        let range = part;
        const slash = part.split('/');
        if (slash.length === 2) {
            range = slash[0];
            step = parseInt(slash[1], 10) || 1;
        }
        let start = min;
        let end = max;
        if (range === '*' || range === '') {
            // ok
        }
        else if (range.includes('-')) {
            const [a, b] = range.split('-').map((x) => parseInt(x, 10));
            if (!Number.isNaN(a))
                start = a;
            if (!Number.isNaN(b))
                end = b;
        }
        else {
            const n = parseInt(range, 10);
            if (!Number.isNaN(n)) {
                start = n;
                end = n;
            }
        }
        for (let i = start; i <= end; i += step) {
            if (i >= min && i <= max)
                result.add(i);
        }
    }
    return result;
}
/** 判断一个 cron 表达式是否在给定时刻匹配 */
function cronMatches(expr, at = new Date()) {
    if (!expr)
        return false;
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5)
        return false;
    const fields = parts.map((f, i) => parseField(f, FIELD_RANGE[i][0], FIELD_RANGE[i][1]));
    const now = {
        minute: at.getMinutes(),
        hour: at.getHours(),
        dayOfMonth: at.getDate(),
        month: at.getMonth() + 1,
        dayOfWeek: at.getDay(),
    };
    return (fields[0].has(now.minute) &&
        fields[1].has(now.hour) &&
        fields[2].has(now.dayOfMonth) &&
        fields[3].has(now.month) &&
        fields[4].has(now.dayOfWeek));
}
/** 支持 "HH:MM" 时间段数组：若当前分钟命中任一 slot 则匹配 */
function timeSlotMatches(slotsJson, at = new Date()) {
    if (!slotsJson)
        return false;
    let slots = [];
    try {
        slots = JSON.parse(slotsJson);
    }
    catch {
        return false;
    }
    const hh = at.getHours().toString().padStart(2, '0');
    const mm = at.getMinutes().toString().padStart(2, '0');
    const cur = `${hh}:${mm}`;
    return slots.includes(cur);
}
/** 解析 cron 表达式为 5 个字段 Set，失败返回 null */
function parseCronFields(expr) {
    if (!expr)
        return null;
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5)
        return null;
    try {
        return parts.map((f, i) => parseField(f, FIELD_RANGE[i][0], FIELD_RANGE[i][1]));
    }
    catch {
        return null;
    }
}
/** 某天是否命中 cron（只看日/月/周字段，不细到分钟） */
function cronHitsDay(expr, date) {
    const fields = parseCronFields(expr);
    if (!fields)
        return false;
    return (fields[2].has(date.getDate()) &&
        fields[3].has(date.getMonth() + 1) &&
        fields[4].has(date.getDay()));
}
/** 某天内 cron 触发的时分列表（最多 cap 个，防 '* * * * *' 爆表） */
function cronFiresInDay(expr, date, cap = 24) {
    const fields = parseCronFields(expr);
    if (!fields || !cronHitsDay(expr, date))
        return [];
    const fires = [];
    const hours = Array.from(fields[1]).sort((a, b) => a - b);
    const minutes = Array.from(fields[0]).sort((a, b) => a - b);
    for (const h of hours) {
        for (const m of minutes) {
            fires.push({ h, m });
            if (fires.length >= cap)
                return fires;
        }
    }
    return fires;
}
/** 解析 "HH:MM" 数组为 { h, m } 列表 */
function parseTimeSlots(slotsJson) {
    if (!slotsJson)
        return [];
    try {
        const arr = JSON.parse(slotsJson);
        return arr
            .map((s) => {
            const [h, m] = s.split(':').map((x) => parseInt(x, 10));
            return { h, m };
        })
            .filter((x) => !Number.isNaN(x.h) && !Number.isNaN(x.m));
    }
    catch {
        return [];
    }
}
const subscribers = new Map();
let nextSubId = 1;
function subscribeEvents(res) {
    const id = nextSubId++;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.write(`: connected ${id}\n\n`);
    subscribers.set(id, { id, res });
    res.on('close', () => subscribers.delete(id));
    return id;
}
function broadcastEvent(event, data) {
    const payload = `data: ${JSON.stringify({ type: event, data, at: new Date().toISOString() })}\n\n`;
    for (const sub of subscribers.values()) {
        try {
            sub.res.write(payload);
        }
        catch {
            subscribers.delete(sub.id);
        }
    }
}
// ══════════════════════════════════════════════════════════════════
// 3. 调度器
// ══════════════════════════════════════════════════════════════════
class Scheduler {
    timer = null;
    lastTickMinute = '';
    lastMetricsHourKey = '';
    /** 启动：每 30s 检查一次，避免漏掉分钟边界 */
    start(intervalMs = 30_000) {
        if (this.timer)
            return;
        logger_1.logger.info('[Scheduler] started');
        this.tick().catch((e) => logger_1.logger.error('[Scheduler] first tick failed: ' + String(e)));
        this.timer = setInterval(() => {
            this.tick().catch((e) => logger_1.logger.error('[Scheduler] tick failed: ' + String(e)));
        }, intervalMs);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger_1.logger.info('[Scheduler] stopped');
        }
    }
    async tick() {
        const now = new Date();
        const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
        const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        await this.runDueTasks(now);
        await this.retryFailedTasks(now);
        // 每分钟最多跑一次 schedule 扫描
        if (minuteKey !== this.lastTickMinute) {
            this.lastTickMinute = minuteKey;
            await this.runMatchingSchedules(now);
            await this.checkAccountHealth(now);
        }
        // 每小时最多跑一次"全量数据指标抓取"，让数据看板有内容
        if (hourKey !== this.lastMetricsHourKey) {
            this.lastMetricsHourKey = hourKey;
            this.refreshMetricsBackground().catch((e) => logger_1.logger.warn('[Scheduler] refreshMetrics failed: ' + String(e)));
        }
    }
    /**
     * 后台静默拉取所有已发布作品的最新数据快照。
     * 不阻塞 tick 主流程，失败也不打扰用户。
     * 抓回来的数据写到 content_metrics，数据看板自动展示。
     */
    async refreshMetricsBackground() {
        try {
            const results = await distribute_1.distribute.refreshAllMetrics();
            // refreshAllMetrics 返回 [{accountId, platform, ok?, refreshed?, ...}]
            // 累计成功更新的任务数（每个账号 r.refreshed 是该账号的任务数）
            const totalRefreshed = (results || []).reduce((s, r) => s + (Number(r?.refreshed) || 0), 0);
            if (totalRefreshed > 0) {
                logger_1.logger.info(`[Scheduler] metrics refreshed: ${totalRefreshed} tasks across ${results.length} accounts`);
                broadcastEvent('metrics-refreshed', { count: totalRefreshed });
            }
        }
        catch (err) {
            // 网络抖动 / 平台限流不打日志噪音，下次 tick 会重试
            logger_1.logger.warn('[Scheduler] refreshAllMetrics: ' + String(err).slice(0, 200));
        }
    }
    // ─── A. 定时任务：status='scheduled' 且 scheduled_at <= now ───
    async runDueTasks(now) {
        const nowIso = now.toISOString();
        const due = await db_1.db
            .select()
            .from(schema_1.publishTasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.publishTasks.status, 'scheduled'), (0, drizzle_orm_1.lte)(schema_1.publishTasks.scheduledAt, nowIso)));
        for (const task of due) {
            try {
                await distribute_1.distribute.executePublish(task.id);
                broadcastEvent('task-published', { taskId: task.id, title: task.title });
                await this.log('info', `定时任务发布成功 #${task.id}`, { taskId: task.id });
            }
            catch (err) {
                await this.log('error', `定时任务失败 #${task.id}: ${String(err)}`, {
                    taskId: task.id,
                });
                broadcastEvent('task-failed', { taskId: task.id, error: String(err) });
            }
        }
    }
    // ─── B. 失败重试：status='failed' 且 retry_count < max_retries ───
    async retryFailedTasks(now) {
        // 列对列比较下推到 SQL，避免全表 failed 扫表+JS 过滤
        // COALESCE 兜底 null（默认值分别是 0 / 2）
        const candidates = await db_1.db
            .select()
            .from(schema_1.publishTasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.publishTasks.status, 'failed'), (0, drizzle_orm_1.sql) `COALESCE(${schema_1.publishTasks.retryCount}, 0) < COALESCE(${schema_1.publishTasks.maxRetries}, 2)`));
        for (const task of candidates) {
            // 指数退避：next = updatedAt + 2^retry * 60s
            const lastTs = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;
            const waitMs = Math.pow(2, task.retryCount ?? 0) * 60_000;
            if (now.getTime() - lastTs < waitMs)
                continue;
            try {
                await db_1.db
                    .update(schema_1.publishTasks)
                    .set({
                    retryCount: (task.retryCount ?? 0) + 1,
                    updatedAt: now.toISOString(),
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.publishTasks.id, task.id));
                await distribute_1.distribute.executePublish(task.id);
                broadcastEvent('task-retry-ok', { taskId: task.id });
                await this.log('info', `重试成功 #${task.id}`, {
                    taskId: task.id,
                    retry: (task.retryCount ?? 0) + 1,
                });
            }
            catch (err) {
                await this.log('warn', `重试失败 #${task.id}: ${String(err)}`, {
                    taskId: task.id,
                    retry: (task.retryCount ?? 0) + 1,
                });
            }
        }
    }
    // ─── C. 计划（cron / timeSlots）触发 ───
    async runMatchingSchedules(now) {
        const schedules = await db_1.db
            .select()
            .from(schema_1.publishSchedules)
            .where((0, drizzle_orm_1.eq)(schema_1.publishSchedules.isActive, 1));
        for (const sch of schedules) {
            const hit = (sch.cronExpr && cronMatches(sch.cronExpr, now)) ||
                timeSlotMatches(sch.timeSlots, now);
            if (!hit)
                continue;
            try {
                // 这里只负责把 schedule 事件广播出去 + 标记 lastRunAt
                // 具体的创建任务工作由前端选择模板触发（MVP 阶段）
                // 后续可以基于 task_template_id 自动生成草稿
                await db_1.db
                    .update(schema_1.publishSchedules)
                    .set({ lastRunAt: now.toISOString(), lastError: null })
                    .where((0, drizzle_orm_1.eq)(schema_1.publishSchedules.id, sch.id));
                broadcastEvent('schedule-fired', {
                    scheduleId: sch.id,
                    name: sch.name,
                    platform: sch.platform,
                });
                await this.log('info', `计划触发 #${sch.id} ${sch.name}`, {
                    scheduleId: sch.id,
                });
            }
            catch (err) {
                await db_1.db
                    .update(schema_1.publishSchedules)
                    .set({ lastError: String(err) })
                    .where((0, drizzle_orm_1.eq)(schema_1.publishSchedules.id, sch.id));
                await this.log('error', `计划执行失败 #${sch.id}: ${String(err)}`, {
                    scheduleId: sch.id,
                });
            }
        }
    }
    // ─── D. 账号登录态健康检查：6h 未校验的账号广播提醒（不主动登录） ───
    async checkAccountHealth(now) {
        const STALE_MS = 6 * 60 * 60 * 1000;
        const accounts = await db_1.db.select().from(schema_1.platformAccounts).where((0, drizzle_orm_1.eq)(schema_1.platformAccounts.isActive, 1));
        for (const a of accounts) {
            const last = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : 0;
            if (a.verifyStatus === 'expired') {
                broadcastEvent('account-expired', {
                    accountId: a.id,
                    platform: a.platform,
                    accountName: a.accountName,
                });
            }
            else if (!last || now.getTime() - last > STALE_MS) {
                // 过旧，提醒前端触发校验
                broadcastEvent('account-stale', {
                    accountId: a.id,
                    platform: a.platform,
                    accountName: a.accountName,
                });
            }
        }
    }
    // ─── 工具 ───
    async log(level, message, ctx) {
        try {
            await db_1.db.insert(schema_1.operationLogs).values({
                module: 'scheduler',
                level,
                message,
                context: ctx ? JSON.stringify(ctx) : null,
            });
        }
        catch (err) {
            logger_1.logger.warn('[Scheduler] log insert failed: ' + String(err));
        }
    }
    async listLogs(limit = 50) {
        return db_1.db
            .select()
            .from(schema_1.operationLogs)
            .where((0, drizzle_orm_1.eq)(schema_1.operationLogs.module, 'scheduler'))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.operationLogs.id))
            .limit(limit);
    }
}
exports.Scheduler = Scheduler;
exports.scheduler = new Scheduler();
//# sourceMappingURL=scheduler.js.map