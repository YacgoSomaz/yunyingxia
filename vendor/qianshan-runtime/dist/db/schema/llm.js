"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmCustomSlots = exports.llmTierConfig = exports.llmKeys = exports.llmRouting = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** 场景 → (provider, model) 路由表 */
exports.llmRouting = (0, sqlite_core_1.sqliteTable)('llm_routing', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    scene: (0, sqlite_core_1.text)('scene').notNull().unique(),
    provider: (0, sqlite_core_1.text)('provider').notNull(),
    model: (0, sqlite_core_1.text)('model').notNull(),
    updatedAt: (0, sqlite_core_1.text)('updated_at').$defaultFn(() => new Date().toISOString()),
});
/** 各 provider 的凭据（apiKey 用 cryptoStorage.encrypt 加密存） */
exports.llmKeys = (0, sqlite_core_1.sqliteTable)('llm_keys', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    provider: (0, sqlite_core_1.text)('provider').notNull().unique(),
    apiKey: (0, sqlite_core_1.text)('api_key').notNull(),
    baseUrl: (0, sqlite_core_1.text)('base_url'),
    createdAt: (0, sqlite_core_1.text)('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: (0, sqlite_core_1.text)('updated_at').$defaultFn(() => new Date().toISOString()),
});
/**
 * 档位配置：category → tier。
 * 每个任务类（text-fast / text-long / image / video / vision）用户各选一档。
 * 未配置的类使用 DEFAULT_TIER_PER_CATEGORY。
 */
exports.llmTierConfig = (0, sqlite_core_1.sqliteTable)('llm_tier_config', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    category: (0, sqlite_core_1.text)('category').notNull().unique(), // 'text-fast' | 'text-long' | 'image' | 'video' | 'vision'
    tier: (0, sqlite_core_1.text)('tier').notNull(), // 'cheap' | 'recommended' | 'premium' | 'custom:{slotId}'
    updatedAt: (0, sqlite_core_1.text)('updated_at').$defaultFn(() => new Date().toISOString()),
});
/**
 * 用户自定义模型槽：给每个任务类加"我常用的模型"。
 * label：展示名，如"人物系列"
 * modelId：实际调用时传给 API 的 model 字符串，如 "vidu-q3-pro"
 * provider：归属 provider（切 provider 时会隐藏属于其他 provider 的槽）
 */
exports.llmCustomSlots = (0, sqlite_core_1.sqliteTable)('llm_custom_slots', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    category: (0, sqlite_core_1.text)('category').notNull(), // 同上 5 类
    provider: (0, sqlite_core_1.text)('provider').notNull(), // 'lingyaai' | 'openai' | ...
    label: (0, sqlite_core_1.text)('label').notNull(), // 用户自定义名字
    modelId: (0, sqlite_core_1.text)('model_id').notNull(), // 实际 model 字符串
    createdAt: (0, sqlite_core_1.text)('created_at').$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=llm.js.map