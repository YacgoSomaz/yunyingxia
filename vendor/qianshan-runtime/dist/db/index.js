"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlite = exports.db = void 0;
exports.ensureColumn = ensureColumn;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const better_sqlite3_2 = require("drizzle-orm/better-sqlite3");
const migrator_1 = require("drizzle-orm/better-sqlite3/migrator");
const schema = __importStar(require("./schema/index"));
const paths_1 = require("../utils/paths");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// 数据库文件：
//   dev  → packages/main/data/qianshan.db
//   prod → userData/data/qianshan.db（用户可写，卸载/升级保留）
const DB_PATH = (0, paths_1.dataDir)('qianshan.db');
const sqlite = new better_sqlite3_1.default(DB_PATH);
exports.sqlite = sqlite;
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const _drizzle = (0, better_sqlite3_2.drizzle)(sqlite, { schema });
/**
 * 启动时自动迁移：drizzle 自带版本表 __drizzle_migrations，已应用的不会重跑。
 * 用户拿到打包后的 .exe 第一次启动，db 是新建的空文件，必须靠这一步建出
 * 所有表结构。
 *
 * migrations 目录解析：
 *   dev:  __dirname = packages/main/dist/db   → ../../drizzle/migrations
 *   prod: __dirname = app.asar/dist/db        → ../../drizzle/migrations  (asar 内)
 *   两者结构一致，所以 path 相同。
 */
function runMigrations() {
    const candidates = [
        path_1.default.join(__dirname, '..', '..', 'drizzle', 'migrations'),
        // dev 备用：源代码 src/db → ../../../drizzle/migrations
        path_1.default.join(__dirname, '..', '..', '..', 'drizzle', 'migrations'),
    ];
    const folder = candidates.find((p) => {
        try {
            return fs_1.default.existsSync(p);
        }
        catch {
            return false;
        }
    });
    if (!folder) {
        console.warn('[DB] migrations folder not found. Tables will rely on ensureTable fallbacks.');
        return;
    }
    try {
        (0, migrator_1.migrate)(_drizzle, { migrationsFolder: folder });
        console.log('[DB] migrations applied from:', folder);
    }
    catch (err) {
        console.warn('[DB] migrate() failed (continuing with ensureTable fallbacks):', err);
    }
}
runMigrations();
/**
 * 幂等地添加列。SQLite 不支持 IF NOT EXISTS on ADD COLUMN（3.35 以下），
 * 先查 table_info 再决定是否 ALTER。
 */
function ensureColumn(table, column, definition) {
    try {
        const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all();
        if (rows.some((r) => r.name === column))
            return;
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`[DB] added column ${table}.${column}`);
    }
    catch (err) {
        console.warn(`[DB] ensureColumn ${table}.${column} failed:`, err);
    }
}
/** 幂等建表 —— drizzle 迁移 sql 只覆盖首次建表，新增表用这个手动建 */
function ensureTable(sqlCreate) {
    try {
        sqlite.exec(sqlCreate);
    }
    catch (err) {
        console.warn('[DB] ensureTable failed:', err);
    }
}
// ─── 既有表轻量迁移 ───
ensureColumn('bgm_library', 'cover_url', 'TEXT');
ensureColumn('platform_accounts', 'last_verified_at', 'TEXT');
ensureColumn('platform_accounts', 'verify_status', 'TEXT');
ensureColumn('platform_accounts', 'is_default_scraper', 'INTEGER DEFAULT 0');
// ─── 主线 A：pipeline 外键列 ───
ensureColumn('copywritings', 'topic_id', 'INTEGER');
ensureColumn('copywritings', 'source_keyword', 'TEXT');
ensureColumn('ad_videos', 'copywriting_id', 'INTEGER');
ensureColumn('slideshow_videos', 'copywriting_id', 'INTEGER');
ensureColumn('covers', 'copywriting_id', 'INTEGER');
ensureColumn('publish_tasks', 'copywriting_id', 'INTEGER');
ensureColumn('publish_tasks', 'ad_video_id', 'INTEGER');
ensureColumn('publish_tasks', 'slideshow_id', 'INTEGER');
ensureColumn('publish_tasks', 'cover_id', 'INTEGER');
// 平台专属字段 JSON（动态表单驱动）
ensureColumn('publish_tasks', 'platform_fields', 'TEXT');
// 封面套图规格槽位（cover_vertical / cover_horizontal），单图旧调用为 NULL
ensureColumn('covers', 'spec', 'TEXT');
// ─── 主线 C：调度器列 ───
ensureColumn('publish_schedules', 'next_run_at', 'TEXT');
ensureColumn('publish_schedules', 'last_run_at', 'TEXT');
ensureColumn('publish_schedules', 'last_error', 'TEXT');
ensureColumn('publish_schedules', 'task_template_id', 'INTEGER');
ensureColumn('publish_schedules', 'max_retries', 'INTEGER DEFAULT 2');
ensureColumn('publish_schedules', 'account_ids', 'TEXT');
ensureColumn('publish_tasks', 'retry_count', 'INTEGER DEFAULT 0');
ensureColumn('publish_tasks', 'max_retries', 'INTEGER DEFAULT 2');
ensureColumn('publish_tasks', 'schedule_id', 'INTEGER');
// ─── 主线 D：看板快照日期 ───
ensureColumn('content_metrics', 'snapshot_date', 'TEXT');
// ─── 选题雷达：区分真实源 / LLM 源 ───
ensureColumn('topics', 'source', "TEXT DEFAULT 'real'");
ensureColumn('topics', 'source_url', 'TEXT');
ensureColumn('topics', 'pinned', 'INTEGER DEFAULT 0');
// ─── 内容日历：手动排期扩展字段 ───
ensureColumn('content_calendar', 'time_of_day', 'TEXT');
ensureColumn('content_calendar', 'copywriting_id', 'INTEGER');
// ─── 内容合规审核：copywritings 扩列 + 自定义词库表 ───
ensureColumn('copywritings', 'audit_level', "TEXT DEFAULT 'pending'");
ensureColumn('copywritings', 'audit_result', 'TEXT');
ensureColumn('copywritings', 'audited_at', 'TEXT');
ensureColumn('copywriting_adaptations', 'audit_level', "TEXT DEFAULT 'pending'");
ensureColumn('copywriting_adaptations', 'audit_result', 'TEXT');
ensureTable(`
CREATE TABLE IF NOT EXISTS custom_forbidden_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  category TEXT DEFAULT 'custom',
  severity TEXT DEFAULT 'medium',
  note TEXT,
  created_at TEXT
);`);
// ─── 一键成片：slideshow_videos 扩列（视频工坊产品路线切换到"文案→视频"）───
ensureColumn('slideshow_videos', 'voice_id', "TEXT DEFAULT 'xiaoxiao'");
ensureColumn('slideshow_videos', 'subtitle_style', "TEXT DEFAULT 'standard'");
ensureColumn('slideshow_videos', 'scenes', 'TEXT'); // JSON 分镜数据
ensureColumn('slideshow_videos', 'srt_path', 'TEXT'); // 字幕副本路径
ensureColumn('slideshow_videos', 'thumbnail_path', 'TEXT'); // 缩略图
ensureColumn('slideshow_videos', 'error_msg', 'TEXT');
// 用户原文（口语化前），用于"继续编辑"还原 step 1 顶部对比 Alert
ensureColumn('slideshow_videos', 'original_script', 'TEXT');
// 视觉风格预设 id（来自 stylePresets, module='visual'），用于"继续编辑"恢复前端下拉
ensureColumn('slideshow_videos', 'visual_style_id', 'INTEGER');
// 启动时清掉旧"图文成片"数据（已确认不再使用；保留表结构供"一键成片"复用）
try {
    const result = sqlite.prepare('SELECT COUNT(*) as n FROM slideshow_videos').get();
    if (result.n > 0) {
        // 仅当旧记录的 scenes 列为 null 时删除（判定它们是老图文成片数据）
        const deleted = sqlite.prepare(`DELETE FROM slideshow_videos WHERE scenes IS NULL`).run();
        if (deleted.changes > 0) {
            console.log(`[DB] cleared ${deleted.changes} legacy slideshow rows`);
        }
    }
}
catch (e) {
    console.warn('[DB] legacy slideshow cleanup skipped:', e);
}
// ─── 主线 B：模型中心两张新表（drizzle 的 0000 迁移里没有，手动建） ───
ensureTable(`
CREATE TABLE IF NOT EXISTS llm_routing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT
);`);
// llm_tier_config:vision 类已废弃改为 voice(语音 TTS),老用户行迁移
try {
    const r = sqlite
        .prepare(`UPDATE llm_tier_config SET category = 'voice' WHERE category = 'vision'`)
        .run();
    if (r.changes > 0) {
        console.log(`[DB] migrated llm_tier_config: vision → voice (${r.changes} row)`);
    }
}
catch {
    /* noop */
}
// llm_routing：旧场景 slideshow_script 迁移到 one_click_split（必须在 ensureTable 之后）
try {
    const r = sqlite
        .prepare(`UPDATE llm_routing SET scene = 'one_click_split' WHERE scene = 'slideshow_script'`)
        .run();
    if (r.changes > 0) {
        console.log(`[DB] migrated llm_routing: slideshow_script → one_click_split (${r.changes} row)`);
    }
}
catch {
    /* noop */
}
// 外部 API 凭据（Pixabay / Pexels）
ensureTable(`
CREATE TABLE IF NOT EXISTS external_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  base_url TEXT,
  created_at TEXT,
  updated_at TEXT
);`);
ensureTable(`
CREATE TABLE IF NOT EXISTS llm_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  base_url TEXT,
  created_at TEXT,
  updated_at TEXT
);`);
// ─── 档位配置（任务类 → 档位） ───
ensureTable(`
CREATE TABLE IF NOT EXISTS llm_tier_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL,
  updated_at TEXT
);`);
// ─── 用户自定义模型槽 ───
ensureTable(`
CREATE TABLE IF NOT EXISTS llm_custom_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at TEXT
);`);
// ─── 阶段 2：视频洗稿表（3 步独立） ───
ensureTable(`
CREATE TABLE IF NOT EXISTS video_rewrites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_url TEXT,
  source_path TEXT,
  platform TEXT,
  title TEXT,
  uploader TEXT,
  duration INTEGER,
  thumbnail TEXT,
  transcript_text TEXT,
  transcript_segments TEXT,
  srt_path TEXT,
  rewritten_text TEXT,
  style_preset_id INTEGER,
  target_platform TEXT,
  step TEXT DEFAULT 'download',
  status TEXT DEFAULT 'pending',
  error_msg TEXT,
  audit_level TEXT DEFAULT 'pending',
  audit_result TEXT,
  copywriting_id INTEGER,
  created_at TEXT,
  updated_at TEXT
);`);
// ─── 自定义克隆音色：百炼 CosyVoice voice_id 元数据表 ───
ensureTable(`
CREATE TABLE IF NOT EXISTS custom_voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  voice_id TEXT NOT NULL UNIQUE,
  target_model TEXT NOT NULL,
  ref_text TEXT,
  audio_path TEXT,
  upload_url TEXT,
  created_at TEXT
);`);
// ─── 数字人形象素材(用户上传 / 系统预设) ───
ensureTable(`
CREATE TABLE IF NOT EXISTS avatar_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  local_path TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT
);`);
// ─── 主线 C：operation_logs（供 scheduler 等写日志） ───
// 旧版本遗留：表里有 NOT NULL 的 action 列，当前代码只写 module/level/message/context。
// scheduler 日志是诊断型数据，丢了无所谓 —— 检测到旧 schema 就 drop 重建。
try {
    const cols = sqlite
        .prepare(`PRAGMA table_info(operation_logs)`)
        .all();
    const hasAction = cols.some((c) => c.name === 'action');
    const hasMessage = cols.some((c) => c.name === 'message');
    if (hasAction || !hasMessage) {
        sqlite.exec('DROP TABLE IF EXISTS operation_logs');
        console.log('[DB] dropped legacy operation_logs (rebuilding with current schema)');
    }
}
catch { /* 表不存在就走下面的建表 */ }
ensureTable(`
CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  context TEXT,
  created_at TEXT
);`);
exports.db = _drizzle;
//# sourceMappingURL=index.js.map