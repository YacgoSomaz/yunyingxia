"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.externalCredentials = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/**
 * 外部 API 凭据（Pixabay / Pexels 等，apiKey 用 cryptoStorage 加密存）
 *
 * 和 llm_keys 分开，因为这些服务不走 llm-config 的 provider/model 路由逻辑，
 * 纯粹是「拿 key 就能调」。
 */
exports.externalCredentials = (0, sqlite_core_1.sqliteTable)('external_credentials', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    /** 服务标识：pixabay | pexels | ... */
    provider: (0, sqlite_core_1.text)('provider').notNull().unique(),
    apiKey: (0, sqlite_core_1.text)('api_key').notNull(),
    /** 可选自定义 endpoint */
    baseUrl: (0, sqlite_core_1.text)('base_url'),
    createdAt: (0, sqlite_core_1.text)('created_at').$defaultFn(() => new Date().toISOString()),
    updatedAt: (0, sqlite_core_1.text)('updated_at').$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=external-credentials.js.map