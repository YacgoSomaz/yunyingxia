"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentCalendar = exports.topicAnalyses = exports.topics = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** 热搜话题 */
exports.topics = (0, sqlite_core_1.sqliteTable)('topics', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    keyword: (0, sqlite_core_1.text)('keyword').notNull(),
    heatScore: (0, sqlite_core_1.integer)('heat_score').default(0),
    category: (0, sqlite_core_1.text)('category'),
    trend: (0, sqlite_core_1.text)('trend').default('stable'),
    rawData: (0, sqlite_core_1.text)('raw_data'),
    /** 数据来源：real（官方/开放接口）| llm（大模型生成）| mock（占位） */
    source: (0, sqlite_core_1.text)('source').default('real'),
    /** 原始页面 URL（点进去能看到出处） */
    sourceUrl: (0, sqlite_core_1.text)('source_url'),
    /** 收藏/置顶（用户手动标记） */
    pinned: (0, sqlite_core_1.integer)('pinned').default(0),
    fetchedAt: (0, sqlite_core_1.text)('fetched_at').notNull(),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** AI 分析结果 */
exports.topicAnalyses = (0, sqlite_core_1.sqliteTable)('topic_analyses', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    topicId: (0, sqlite_core_1.integer)('topic_id')
        .notNull()
        .references(() => exports.topics.id),
    angles: (0, sqlite_core_1.text)('angles').notNull(),
    targetAudience: (0, sqlite_core_1.text)('target_audience'),
    contentSuggestions: (0, sqlite_core_1.text)('content_suggestions'),
    competitionLevel: (0, sqlite_core_1.text)('competition_level').default('medium'),
    score: (0, sqlite_core_1.integer)('score').default(0),
    llmModel: (0, sqlite_core_1.text)('llm_model'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 内容日历 */
exports.contentCalendar = (0, sqlite_core_1.sqliteTable)('content_calendar', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    /** 日期（YYYY-MM-DD，存用户本地日） */
    date: (0, sqlite_core_1.text)('date').notNull(),
    /** 当日具体时间（HH:mm，可空） */
    timeOfDay: (0, sqlite_core_1.text)('time_of_day'),
    topicId: (0, sqlite_core_1.integer)('topic_id').references(() => exports.topics.id),
    /** 关联到已有文案（从文案库"加入日历"时写入） */
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id'),
    title: (0, sqlite_core_1.text)('title').notNull(),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    status: (0, sqlite_core_1.text)('status').default('planned'),
    notes: (0, sqlite_core_1.text)('notes'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=topic.js.map