"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationLogs = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** 操作日志（通用：业务操作记录 + 主线 C 调度器状态） */
exports.operationLogs = (0, sqlite_core_1.sqliteTable)('operation_logs', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    module: (0, sqlite_core_1.text)('module').notNull(), // topic-radar | copywriting | video | distribute | scheduler
    level: (0, sqlite_core_1.text)('level').notNull().default('info'), // info | warn | error
    message: (0, sqlite_core_1.text)('message').notNull(),
    context: (0, sqlite_core_1.text)('context'), // JSON 字符串
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=common.js.map