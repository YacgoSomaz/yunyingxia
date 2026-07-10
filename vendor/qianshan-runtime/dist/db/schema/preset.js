"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customVoices = exports.generationVariants = exports.stylePresets = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** 风格预设 */
exports.stylePresets = (0, sqlite_core_1.sqliteTable)('style_presets', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    description: (0, sqlite_core_1.text)('description'),
    module: (0, sqlite_core_1.text)('module').notNull(),
    config: (0, sqlite_core_1.text)('config').notNull(),
    isBuiltin: (0, sqlite_core_1.integer)('is_builtin').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 生成变体 */
exports.generationVariants = (0, sqlite_core_1.sqliteTable)('generation_variants', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    sourceType: (0, sqlite_core_1.text)('source_type').notNull(),
    sourceId: (0, sqlite_core_1.integer)('source_id').notNull(),
    variantIndex: (0, sqlite_core_1.integer)('variant_index').notNull(),
    content: (0, sqlite_core_1.text)('content').notNull(),
    isSelected: (0, sqlite_core_1.integer)('is_selected').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 自定义克隆音色（百炼 CosyVoice voice_id 元数据） */
exports.customVoices = (0, sqlite_core_1.sqliteTable)('custom_voices', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    /** 用户起的名字（前端展示用） */
    name: (0, sqlite_core_1.text)('name').notNull(),
    /** 百炼返回的 voice_id，形如 cosyvoice-v3.5-plus-xxx-yyy。dispatchTTS 直接传给 cosyvoice 接口 */
    voiceId: (0, sqlite_core_1.text)('voice_id').notNull().unique(),
    /** 克隆使用的目标模型，TTS 合成时也得用这个 model（v3.5-plus 等） */
    targetModel: (0, sqlite_core_1.text)('target_model').notNull(),
    /** 用户上传的参考文本（克隆时请用户跟读，方便后期回顾） */
    refText: (0, sqlite_core_1.text)('ref_text'),
    /** 上传时的本地音频文件路径（本地引用，方便重新克隆 / 排查） */
    audioPath: (0, sqlite_core_1.text)('audio_path'),
    /** 克隆时上传到百炼的临时 oss:// URL（48h 失效，仅记录） */
    uploadUrl: (0, sqlite_core_1.text)('upload_url'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=preset.js.map