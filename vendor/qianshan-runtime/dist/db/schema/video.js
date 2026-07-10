"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.covers = exports.videoRewrites = exports.coverTemplates = exports.slideshowVideos = exports.bgmLibrary = exports.adVideos = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/** AI 广告视频 */
exports.adVideos = (0, sqlite_core_1.sqliteTable)('ad_videos', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    productImagePath: (0, sqlite_core_1.text)('product_image_path').notNull(),
    creativeDesc: (0, sqlite_core_1.text)('creative_desc').notNull(),
    expandedPrompt: (0, sqlite_core_1.text)('expanded_prompt'),
    enPrompt: (0, sqlite_core_1.text)('en_prompt'),
    klingTaskId: (0, sqlite_core_1.text)('kling_task_id'),
    videoUrl: (0, sqlite_core_1.text)('video_url'),
    videoLocalPath: (0, sqlite_core_1.text)('video_local_path'),
    duration: (0, sqlite_core_1.integer)('duration').default(5),
    status: (0, sqlite_core_1.text)('status').default('pending'),
    errorMsg: (0, sqlite_core_1.text)('error_msg'),
    /** 主线 A：引用 copywritings.id */
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: (0, sqlite_core_1.text)('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 背景音乐库（slideshow_videos 依赖它，需先定义） */
exports.bgmLibrary = (0, sqlite_core_1.sqliteTable)('bgm_library', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    filePath: (0, sqlite_core_1.text)('file_path').notNull(),
    duration: (0, sqlite_core_1.integer)('duration').notNull(),
    mood: (0, sqlite_core_1.text)('mood').default('neutral'),
    bpm: (0, sqlite_core_1.integer)('bpm'),
    isBuiltin: (0, sqlite_core_1.integer)('is_builtin').default(0),
    coverUrl: (0, sqlite_core_1.text)('cover_url'),
});
/** 一键成片（底层表名保留 slideshow_videos 以兼容 publish_tasks.slideshow_id 外键） */
exports.slideshowVideos = (0, sqlite_core_1.sqliteTable)('slideshow_videos', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    title: (0, sqlite_core_1.text)('title').notNull(),
    images: (0, sqlite_core_1.text)('images').notNull(),
    scriptText: (0, sqlite_core_1.text)('script_text'),
    /** 用户输入的原文(分析阶段会被 LLM 改写成口语版,scriptText 存的是改写后的版本)
     *  仅用于"继续编辑"时还原 step 1 顶部的口语化对比 Alert,不参与任何后续合成流程 */
    originalScript: (0, sqlite_core_1.text)('original_script'),
    ttsAudioPath: (0, sqlite_core_1.text)('tts_audio_path'),
    bgmId: (0, sqlite_core_1.integer)('bgm_id').references(() => exports.bgmLibrary.id),
    outputPath: (0, sqlite_core_1.text)('output_path'),
    resolution: (0, sqlite_core_1.text)('resolution').default('1080x1920'),
    duration: (0, sqlite_core_1.integer)('duration').default(0),
    status: (0, sqlite_core_1.text)('status').default('draft'),
    /** 主线 A：引用 copywritings.id */
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id'),
    // ─── 一键成片新增字段 ───
    /** TTS 音色：xiaoxiao | yunxi | yunjian | xiaoyi */
    voiceId: (0, sqlite_core_1.text)('voice_id').default('xiaoxiao'),
    /** 字幕样式：standard | science | variety */
    subtitleStyle: (0, sqlite_core_1.text)('subtitle_style').default('standard'),
    /** 分镜数据 JSON：[{text, duration, keywords, imagePath, imageCredit}] */
    scenes: (0, sqlite_core_1.text)('scenes'),
    /** 视觉风格预设 id（来自 stylePresets, module='visual'）。
     *  null = 默认电影写实。"继续编辑"时用它恢复前端下拉默认值，
     *  并不直接参与合成（每个 scene 自带 negativePrompt + 已拼好的 aiImagePromptCN）*/
    visualStyleId: (0, sqlite_core_1.integer)('visual_style_id'),
    /** 字幕副本路径（SRT）*/
    srtPath: (0, sqlite_core_1.text)('srt_path'),
    /** 视频缩略图（抽第 2 秒的帧）*/
    thumbnailPath: (0, sqlite_core_1.text)('thumbnail_path'),
    errorMsg: (0, sqlite_core_1.text)('error_msg'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 封面模板（covers 依赖，需先定义） */
exports.coverTemplates = (0, sqlite_core_1.sqliteTable)('cover_templates', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    category: (0, sqlite_core_1.text)('category').notNull(),
    layoutConfig: (0, sqlite_core_1.text)('layout_config').notNull(),
    previewPath: (0, sqlite_core_1.text)('preview_path'),
    isBuiltin: (0, sqlite_core_1.integer)('is_builtin').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 视频洗稿任务（3 步独立：download → ASR → rewrite） */
exports.videoRewrites = (0, sqlite_core_1.sqliteTable)('video_rewrites', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    /** 来源：url（在线）或 local（用户上传） */
    sourceType: (0, sqlite_core_1.text)('source_type').notNull(),
    sourceUrl: (0, sqlite_core_1.text)('source_url'),
    sourcePath: (0, sqlite_core_1.text)('source_path'), // 下载后 / 上传后的本地路径
    platform: (0, sqlite_core_1.text)('platform'), // douyin / bilibili / youtube / local ...
    title: (0, sqlite_core_1.text)('title'),
    uploader: (0, sqlite_core_1.text)('uploader'),
    duration: (0, sqlite_core_1.integer)('duration'),
    thumbnail: (0, sqlite_core_1.text)('thumbnail'),
    /** ASR 结果 */
    transcriptText: (0, sqlite_core_1.text)('transcript_text'),
    transcriptSegments: (0, sqlite_core_1.text)('transcript_segments'), // JSON
    srtPath: (0, sqlite_core_1.text)('srt_path'),
    /** 洗稿结果 */
    rewrittenText: (0, sqlite_core_1.text)('rewritten_text'),
    /** 风格预设 id（可空，表示自由洗稿） */
    stylePresetId: (0, sqlite_core_1.integer)('style_preset_id'),
    /** 目标平台适配（可空）*/
    targetPlatform: (0, sqlite_core_1.text)('target_platform'),
    /** 当前步骤：download | asr | rewrite | done | failed */
    step: (0, sqlite_core_1.text)('step').default('download'),
    /** 整体状态 */
    status: (0, sqlite_core_1.text)('status').default('pending'),
    errorMsg: (0, sqlite_core_1.text)('error_msg'),
    /** 合规审核（洗稿成品）*/
    auditLevel: (0, sqlite_core_1.text)('audit_level').default('pending'),
    auditResult: (0, sqlite_core_1.text)('audit_result'),
    /** 同主线 A：可回落到 copywritings 表 */
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: (0, sqlite_core_1.text)('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
/** 封面图 */
exports.covers = (0, sqlite_core_1.sqliteTable)('covers', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    title: (0, sqlite_core_1.text)('title').notNull(),
    subtitle: (0, sqlite_core_1.text)('subtitle'),
    templateId: (0, sqlite_core_1.integer)('template_id').references(() => exports.coverTemplates.id),
    backgroundPath: (0, sqlite_core_1.text)('background_path'),
    outputPath: (0, sqlite_core_1.text)('output_path'),
    platform: (0, sqlite_core_1.text)('platform').notNull(),
    resolution: (0, sqlite_core_1.text)('resolution').default('1280x720'),
    /** 该封面所占的规格槽位：'cover_vertical' / 'cover_horizontal'；单图旧调用为 NULL */
    spec: (0, sqlite_core_1.text)('spec'),
    /** 主线 A：引用 copywritings.id */
    copywritingId: (0, sqlite_core_1.integer)('copywriting_id'),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=video.js.map