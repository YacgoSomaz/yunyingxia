"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const migrator_1 = require("drizzle-orm/better-sqlite3/migrator");
const index_1 = require("./index");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
try {
    const migrationsFolder = path_1.default.join(__dirname, '../../drizzle/migrations');
    console.log('[DB] Node version:', process.version);
    console.log('[DB] Migrations folder:', migrationsFolder);
    console.log('[DB] Folder exists:', fs_1.default.existsSync(migrationsFolder));
    if (!fs_1.default.existsSync(migrationsFolder)) {
        console.error('[DB] ERROR: migrations folder does not exist. Run `pnpm db:generate` first to create the schema migrations.');
        process.exit(1);
    }
    console.log('[DB] Running migrations...');
    (0, migrator_1.migrate)(index_1.db, { migrationsFolder });
    console.log('[DB] Migrations complete.');
    process.exit(0);
}
catch (err) {
    console.error('[DB] Migration FAILED:', err);
    if (err instanceof Error && err.stack)
        console.error(err.stack);
    process.exit(1);
}
//# sourceMappingURL=migrate.js.map