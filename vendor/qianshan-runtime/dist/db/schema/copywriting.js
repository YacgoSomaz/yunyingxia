"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templates = exports.titleCandidates = exports.copywritingAdaptations = exports.customForbiddenWords = exports.copywritings = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** 文案主表 */
exports.copywritings = (0, sqlite_core_1.sqliteTable)('copywritings', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    title: (0, sqlite_core_1.text)('title').notNull(),
    topic: (0, sqlite_core_1.text)('topic').notNull(),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    outline: (0, sqlite_core_1.text)('outline'),
    scenes: (0, sqlite_core_1.text)('scenes'),
    finalText: (0, sqlite_core_1.text)('final_text'),
    subtitles: (0, sqlite_core_1.text)('subtitles'),
    wordCount: (0, sqlite_core_1.integer)('word_count').default(0),
    generationMode: (0, sqlite_core_1.text)('generation_mode').notNull(),
    status: (0, sqlite_core_1.text)('status').default('draft'),
    llmModel: (0, sqlite_core_1.text)('llm_model'),
    /** 主线 A：引用 topics.id（来源选题） */
    topicId: (0, sqlite_core_1.integer)('topic_id'),
    /** 主线 A：冗余存关键词，便于列表页展示而无需 JOIN */
    sourceKeyword: (0, sqlite_core_1.text)('source_keyword'),
    /** 内容合规审核：pending | clean | warning | risky */
    auditLevel: (0, sqlite_core_1.text)('audit_level').default('pending'),
    /** 审核结果 JSON（AuditResult 序列化） */
    auditResult: (0, sqlite_core_1.text)('audit_result'),
    auditedAt: (0, sqlite_core_1.text)('audited_at'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: (0, sqlite_core_1.text)('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 用户自定义违禁词 */
exports.customForbiddenWords = (0, sqlite_core_1.sqliteTable)('custom_forbidden_words', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    word: (0, sqlite_core_1.text)('word').notNull(),
    category: (0, sqlite_core_1.text)('category').default('custom'),
    severity: (0, sqlite_core_1.text)('severity').default('medium'),
    note: (0, sqlite_core_1.text)('note'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 多平台适配版本 */
exports.copywritingAdaptations = (0, sqlite_core_1.sqliteTable)('copywriting_adaptations', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id')
        .notNull()
        .references(() => exports.copywritings.id),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    adaptedText: (0, sqlite_core_1.text)('adapted_text').notNull(),
    adaptedTitle: (0, sqlite_core_1.text)('adapted_title'),
    tags: (0, sqlite_core_1.text)('tags'),
    /** 适配版本的审核结果 */
    auditLevel: (0, sqlite_core_1.text)('audit_level').default('pending'),
    auditResult: (0, sqlite_core_1.text)('audit_result'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 标题候选 */
exports.titleCandidates = (0, sqlite_core_1.sqliteTable)('title_candidates', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id')
        .notNull()
        .references(() => exports.copywritings.id),
    titleText: (0, sqlite_core_1.text)('title_text').notNull(),
    style: (0, sqlite_core_1.text)('style').notNull(),
    score: (0, sqlite_core_1.integer)('score').default(0),
    isSelected: (0, sqlite_core_1.integer)('is_selected').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 文案模板库 */
exports.templates = (0, sqlite_core_1.sqliteTable)('templates', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    category: (0, sqlite_core_1.text)('category').notNull(),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    structure: (0, sqlite_core_1.text)('structure').notNull(),
    exampleText: (0, sqlite_core_1.text)('example_text'),
    usageCount: (0, sqlite_core_1.integer)('usage_count').default(0),
    isBuiltin: (0, sqlite_core_1.integer)('is_builtin').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=copywriting.js.map