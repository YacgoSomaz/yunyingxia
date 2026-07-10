"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishSuggestions = exports.publishSchedules = exports.contentMetrics = exports.publishTasks = exports.platformAccounts = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** 平台账号 */
exports.platformAccounts = (0, sqlite_core_1.sqliteTable)('platform_accounts', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    accountName: (0, sqlite_core_1.text)('account_name').notNull(),
    cookieData: (0, sqlite_core_1.text)('cookie_data'),
    accessToken: (0, sqlite_core_1.text)('access_token'),
    isActive: (0, sqlite_core_1.integer)('is_active').default(1),
    lastLoginAt: (0, sqlite_core_1.text)('last_login_at'),
    /** 最后一次真校验（打开投稿页看是否未被踢回登录）的时间 */
    lastVerifiedAt: (0, sqlite_core_1.text)('last_verified_at'),
    /** 最近校验结果：'ok' | 'expired' | null（从未校验） */
    verifyStatus: (0, sqlite_core_1.text)('verify_status'),
    /** 是否为该平台"抓取专用号"——选题雷达优先用此账号跑抓取 */
    isDefaultScraper: (0, sqlite_core_1.integer)('is_default_scraper').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 发布任务 */
exports.publishTasks = (0, sqlite_core_1.sqliteTable)('publish_tasks', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    accountId: (0, sqlite_core_1.integer)('account_id')
        .notNull()
        .references(() => exports.platformAccounts.id),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    contentType: (0, sqlite_core_1.text)('content_type').notNull(),
    title: (0, sqlite_core_1.text)('title').notNull(),
    description: (0, sqlite_core_1.text)('description'),
    mediaPaths: (0, sqlite_core_1.text)('media_paths'),
    tags: (0, sqlite_core_1.text)('tags'),
    coverPath: (0, sqlite_core_1.text)('cover_path'),
    /** 平台专属字段（JSON），由 PlatformFieldSpec 驱动；通用字段仍走 title/description/tags 列 */
    platformFields: (0, sqlite_core_1.text)('platform_fields'),
    scheduledAt: (0, sqlite_core_1.text)('scheduled_at'),
    publishedAt: (0, sqlite_core_1.text)('published_at'),
    status: (0, sqlite_core_1.text)('status').default('draft'),
    platformPostId: (0, sqlite_core_1.text)('platform_post_id'),
    errorMsg: (0, sqlite_core_1.text)('error_msg'),
    /** 主线 A：作品来源关联 */
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id'),
    adVideoId: (0, sqlite_core_1.integer)('ad_video_id'),
    slideshowId: (0, sqlite_core_1.integer)('slideshow_id'),
    coverId: (0, sqlite_core_1.integer)('cover_id'),
    /** 主线 C：调度器相关 */
    retryCount: (0, sqlite_core_1.integer)('retry_count').default(0),
    maxRetries: (0, sqlite_core_1.integer)('max_retries').default(2),
    scheduleId: (0, sqlite_core_1.integer)('schedule_id'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: (0, sqlite_core_1.text)('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 数据监控 */
exports.contentMetrics = (0, sqlite_core_1.sqliteTable)('content_metrics', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    publishTaskId: (0, sqlite_core_1.integer)('publish_task_id')
        .notNull()
        .references(() => exports.publishTasks.id),
    views: (0, sqlite_core_1.integer)('views').default(0),
    likes: (0, sqlite_core_1.integer)('likes').default(0),
    comments: (0, sqlite_core_1.integer)('comments').default(0),
    shares: (0, sqlite_core_1.integer)('shares').default(0),
    followersGained: (0, sqlite_core_1.integer)('followers_gained').default(0),
    /** 主线 D：'YYYY-MM-DD' 便于按天分桶 */
    snapshotDate: (0, sqlite_core_1.text)('snapshot_date'),
    fetchedAt: (0, sqlite_core_1.text)('fetched_at').notNull(),
});
/** 发布计划表 */
exports.publishSchedules = (0, sqlite_core_1.sqliteTable)('publish_schedules', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    cronExpr: (0, sqlite_core_1.text)('cron_expr'),
    timeSlots: (0, sqlite_core_1.text)('time_slots').notNull(),
    isActive: (0, sqlite_core_1.integer)('is_active').default(1),
    /** 主线 C：调度元数据 */
    nextRunAt: (0, sqlite_core_1.text)('next_run_at'),
    lastRunAt: (0, sqlite_core_1.text)('last_run_at'),
    lastError: (0, sqlite_core_1.text)('last_error'),
    taskTemplateId: (0, sqlite_core_1.integer)('task_template_id'),
    maxRetries: (0, sqlite_core_1.integer)('max_retries').default(2),
    accountIds: (0, sqlite_core_1.text)('account_ids'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** AI 发布建议 */
exports.publishSuggestions = (0, sqlite_core_1.sqliteTable)('publish_suggestions', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    suggestedTime: (0, sqlite_core_1.text)('suggested_time').notNull(),
    reason: (0, sqlite_core_1.text)('reason'),
    confidence: (0, sqlite_core_1.integer)('confidence').default(50), // 0-100
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
// operationLogs 已在 ./common.ts 定义（通用日志表：业务+调度器共用）
//# sourceMappingURL=distribute.js.map