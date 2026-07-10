"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const one_click_1 = require("../services/one-click");
const scene_enrich_1 = require("../services/scene-enrich");
const sse_manager_1 = require("../services/sse-manager");
const logger_1 = require("../utils/logger");
const paths_1 = require("../utils/paths");
const validate_1 = require("../utils/validate");
const ai_video_gen_1 = require("../services/ai-video-gen");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
// ─── Schemas ───
const AnalyzeSchema = zod_1.z.object({
    scriptText: zod_1.z.string().min(1).max(2000),
});
const StyleHintSchema = zod_1.z
    .enum(['auto', 'chinese', 'western', 'japanese', 'universal'])
    .optional();
const QualityModeSchema = zod_1.z.enum(['budget', 'balanced', 'premium', 'unlimited']).optional();
const GenerationModeSchema = zod_1.z.enum(['library', 'ai-image', 'ai-video']).optional();
const SearchSchema = zod_1.z.object({
    keywords: zod_1.z.array(zod_1.z.string()).min(1).max(8),
    perProvider: zod_1.z.number().int().min(1).max(20).optional(),
    styleHint: StyleHintSchema,
});
const SearchMixedSchema = zod_1.z.object({
    keywords: zod_1.z.array(zod_1.z.string()).min(1).max(8),
    resolution: zod_1.z.string().default('1080x1920'),
    videoCount: zod_1.z.number().int().min(1).max(10).optional(),
    imageCount: zod_1.z.number().int().min(1).max(20).optional(),
    styleHint: StyleHintSchema,
});
const SceneSchema = zod_1.z.object({
    index: zod_1.z.number().int().positive(),
    text: zod_1.z.string().min(1).max(500),
    duration: zod_1.z.number().min(1).max(60),
    keywords: zod_1.z.array(zod_1.z.string()).default([]),
    // V2 新字段（analyze-v2 返回的 EnrichedScene 会带）
    searchKeywords: zod_1.z.array(zod_1.z.string()).optional(),
    videoPromptCN: zod_1.z.string().max(500).optional(),
    videoPromptEN: zod_1.z.string().max(500).optional(),
    emotion: zod_1.z.enum(['excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous']).optional(),
    shotType: zod_1.z.enum(['close-up', 'medium', 'wide', 'pov', 'aerial']).optional(),
    // 素材选择
    mediaKind: zod_1.z.enum(['video', 'image', 'upload']).optional(),
    imageSource: zod_1.z.enum(['ai', 'upload']).optional(),
    imageUrl: zod_1.z.string().url().optional(),
    videoUrl: zod_1.z.string().url().optional(),
    videoDuration: zod_1.z.number().min(0).optional(),
    imagePath: zod_1.z.string().optional(),
    // mixed-video-image 模式专用：8s 视频段对应的伴生静态图（local path），合成时 xfade 拼到视频后面
    mixedImagePath: zod_1.z.string().optional(),
    imageCredit: zod_1.z.string().optional(),
    // 分镜级生成模式（generate 里根据此路由到 库搜 / AI 图生成 / AI 视频 / 数据可视化 / 视频+图混合）
    generationMode: zod_1.z.enum(['library', 'ai-image', 'ai-video', 'data-viz', 'mixed-video-image']).optional(),
    aiImagePromptCN: zod_1.z.string().max(500).optional(),
    aiImagePromptEN: zod_1.z.string().max(500).optional(),
    // AI 文生图的负向 prompt（"不要画什么"），来自视觉风格预设的 negativePrompt 字段
    negativePrompt: zod_1.z.string().max(2000).optional(),
    // 是否保留 AI 视频本身的原音（环境音/音效），默认 false。仅视频分镜有效
    keepOriginalAudio: zod_1.z.boolean().optional(),
    // 数据可视化配置
    isDataScene: zod_1.z.boolean().optional(),
    dataVizConfig: zod_1.z.object({
        vizType: zod_1.z.enum(['grid-highlight', 'growth-bar', 'cost-compare', 'big-number']),
        numbers: zod_1.z.array(zod_1.z.string()),
        label: zod_1.z.string().optional(),
        subtitle: zod_1.z.string().optional(),
        labels: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
    // 数字人画中画(默认 false 不叠;true 时该分镜会调 wan2.2-s2v 生成数字人 mp4 叠到右下角)
    useAvatar: zod_1.z.boolean().optional(),
});
const GenerateSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200),
    scriptText: zod_1.z.string().min(1).max(2000),
    // 用户原文（口语化前），用于"继续编辑"还原 step 1 顶部对比 Alert，
    // 不参与后续合成流程；老客户端不传时退化为 undefined
    originalScript: zod_1.z.string().max(2000).optional(),
    // 1800 字文案常规就 50+ 个分镜,原 max(12) 会让前端静默 400 失败
    scenes: zod_1.z.array(SceneSchema).min(1).max(100),
    voiceId: zod_1.z.string().min(1).default('dashscope-longanhuan'),
    subtitleStyle: zod_1.z.string().min(1).default('standard'),
    /** 字幕字号 override(1080p 基准像素,实际渲染按视频短边缩放)。不传 = 用 subtitleStyle 预设 */
    subtitleFontSize: zod_1.z.number().int().min(20).max(160).optional(),
    /** 字幕距底距离 override(1080p 基准像素,实际按 height 缩放)。不传 = 用 subtitleStyle 预设 */
    subtitleMarginV: zod_1.z.number().int().min(0).max(1500).optional(),
    resolution: zod_1.z.string().default('1080x1920'),
    bgmId: zod_1.z.number().int().positive().optional(),
    bgmVolume: zod_1.z.number().min(0).max(100).optional(), // BGM 混音音量 0-50%（相对人声）
    aiVideoAudioVolume: zod_1.z.number().min(0).max(100).optional(), // AI 视频原音音量 0-50%
    copywritingId: zod_1.z.number().int().positive().optional(),
    /** 视觉风格预设 id（来自 stylePresets, module='visual'）。null = 默认电影写实 */
    visualStyleId: zod_1.z.number().int().nullable().optional(),
    // AI 图 provider:云端化后所有值都规范成 'cloud',底层按用户云端 image 配置走
    preferredImageProvider: zod_1.z
        .preprocess(() => 'cloud', zod_1.z.enum(['cloud']))
        .optional(),
    // 语速/语调调节（可选；"+10%" / "-5Hz" 这种格式）
    voiceRate: zod_1.z.string().max(10).optional(),
    voicePitch: zod_1.z.string().max(10).optional(),
    // 尾段过渡（最后一帧冻结 + 整体淡黑 + 配音/BGM 渐隐）
    // 不传 = 服务端走默认值（全开），enabled:false 才彻底关闭
    tail: zod_1.z
        .object({
        enabled: zod_1.z.boolean().optional(),
        freezeMs: zod_1.z.number().int().min(0).max(10000).optional(),
        voiceFadeMs: zod_1.z.number().int().min(0).max(3000).optional(),
        bgmFadeMs: zod_1.z.number().int().min(0).max(5000).optional(),
        fadeBlackMs: zod_1.z.number().int().min(0).max(3000).optional(),
    })
        .optional(),
    // 数字人(画中画)全局设置 — 不传 = 不启用数字人(各分镜的 useAvatar 也会被忽略)
    avatar: zod_1.z
        .object({
        // 必填:用哪个形象(对应 avatar_assets.id)
        assetId: zod_1.z.number().int().positive(),
        // 分辨率 480P 便宜(¥0.5/秒) / 720P 贵(¥0.9/秒)
        resolution: zod_1.z.enum(['480P', '720P']).default('480P').optional(),
        // 画中画大小(px) — 对 circle/original = 短边长度,对 square = 边长
        pipSize: zod_1.z.number().int().min(80).max(800).default(280).optional(),
        // 距角的边距(px)
        pipMargin: zod_1.z.number().int().min(0).max(200).default(30).optional(),
        // 形状:circle = 原比例圆形遮罩 / original = 原比例不抠像 / square = 中心裁切方形
        shape: zod_1.z.enum(['circle', 'original', 'square']).default('original').optional(),
        // 旧字段(向后兼容,新版本忽略;true 对应 circle、false 对应 square)
        circle: zod_1.z.boolean().optional(),
        // 画中画位置:四角任选
        position: zod_1.z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('bottom-right').optional(),
    })
        .optional(),
});
// ─── Routes ───
// 音色 / 字幕样式（静态元数据，供前端选项用）
router.get('/voices', async (_req, res) => {
    try {
        res.json(ok(await one_click_1.oneClick.listVoices()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 音色试听：生成一小段预览音频（缓存命中秒回）
router.post('/voices/:id/preview', async (req, res) => {
    try {
        const { rate, pitch } = req.body || {};
        const audioPath = await one_click_1.oneClick.previewVoice(String(req.params.id), rate, pitch);
        res.json(ok({ audioPath }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 声音克隆：SiliconFlow CosyVoice2 zero-shot 克隆
// 前端上传音频到本地路径后，把路径 + 参考文字 + 名字传进来
const CloneVoiceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(32),
    audioPath: zod_1.z.string().min(1), // 本地音频文件绝对路径（10-30 秒）
    refText: zod_1.z.string().min(1).max(500),
});
router.post('/voices/clone', (0, validate_1.validateBody)(CloneVoiceSchema), async (req, res) => {
    try {
        const v = await one_click_1.oneClick.cloneCustomVoice(req.body);
        res.json(ok(v));
    }
    catch (err) {
        logger_1.logger.error('one-click/voices/clone error: ' + err);
        res.status(500).json(fail(err));
    }
});
// 自定义音色清单
router.get('/voices/custom', (_req, res) => {
    try {
        res.json(ok(one_click_1.oneClick.listCustomVoices()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/voices/custom/:id', async (req, res) => {
    try {
        const r = await one_click_1.oneClick.removeCustomVoice(String(req.params.id));
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/subtitle-styles', (_req, res) => {
    res.json(ok(one_click_1.oneClick.listSubtitleStyles()));
});
// 文案 → 分镜（老版，保留兼容）
router.post('/analyze', (0, validate_1.validateBody)(AnalyzeSchema), async (req, res) => {
    try {
        const result = await one_click_1.oneClick.analyzeScript(req.body.scriptText);
        res.json(ok(result));
    }
    catch (err) {
        logger_1.logger.error('one-click/analyze error: ' + err);
        res.status(500).json(fail(err));
    }
});
// 文案 → 分镜 V2（标点切 + 模板 + LLM 只补画面信息）
const AnalyzeV2Schema = zod_1.z.object({
    scriptText: zod_1.z.string().min(1).max(2000),
    template: zod_1.z
        .enum(['hook-argue-twist', 'list', 'story', 'contrast', 'tutorial'])
        .optional(),
    styleHint: StyleHintSchema,
    qualityMode: QualityModeSchema,
    /** 视觉风格预设 ID（来自 stylePresets, module='visual'）。不传 = 默认电影写实 */
    visualStyleId: zod_1.z.number().int().nullable().optional(),
});
router.post('/analyze-v2', (0, validate_1.validateBody)(AnalyzeV2Schema), async (req, res) => {
    try {
        const result = await one_click_1.oneClick.analyzeV2(req.body.scriptText, req.body.template, req.body.styleHint || 'auto', req.body.qualityMode || 'balanced', undefined, req.body.visualStyleId ?? null);
        res.json(ok(result));
    }
    catch (err) {
        logger_1.logger.error('one-click/analyze-v2 error: ' + err);
        res.status(500).json(fail(err));
    }
});
/**
 * analyze-v2 的 SSE 流式版：LLM token 实时推送给前端，避免"转圈 80s 无反馈"。
 * 事件：
 *   - {type:'chunk', content:'...'}  LLM 吐出的 token
 *   - {type:'progress', step, progress}  阶段提示
 *   - {type:'done', data:{...}}      最终 EnrichedScene 结果（与非流式同结构）
 *   - {type:'error', error}          错误
 */
router.post('/analyze-v2-stream', (0, validate_1.validateBody)(AnalyzeV2Schema), async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        sse.sendProgress('准备中', 0.02);
        const result = await one_click_1.oneClick.analyzeV2(req.body.scriptText, req.body.template, req.body.styleHint || 'auto', req.body.qualityMode || 'balanced', (chunk) => {
            // service 用 "__STAGE__|label|progress" 前缀的字符串送阶段事件
            // 普通字符串当 LLM token chunk
            if (chunk.startsWith('__STAGE__|')) {
                const parts = chunk.split('|');
                const label = parts[1] || '';
                const progress = parseFloat(parts[2] || '0') || 0;
                sse.sendProgress(label, progress);
            }
            else {
                sse.sendChunk(chunk);
            }
        }, req.body.visualStyleId ?? null);
        sse.sendDone(result);
    }
    catch (err) {
        logger_1.logger.error('one-click/analyze-v2-stream error: ' + err);
        sse.sendError(String(err?.message || err));
    }
});
// 手动批量口语化分镜文案：前端在 step 1 点"生成口语化"按钮时调用
// 一次 LLM 调用处理整个数组，LLM 拿到全篇上下文，短句也能改，结果按索引对齐回前端
const ColloquializeScenesSchema = zod_1.z.object({
    texts: zod_1.z.array(zod_1.z.string().min(1).max(500)).min(1).max(120),
});
router.post('/colloquialize-scenes', (0, validate_1.validateBody)(ColloquializeScenesSchema), async (req, res) => {
    try {
        const texts = req.body.texts;
        const spokens = await (0, scene_enrich_1.colloquializeSceneTexts)(texts);
        res.json(ok({ spokens }));
    }
    catch (err) {
        logger_1.logger.error('one-click/colloquialize-scenes error: ' + err);
        res.status(500).json(fail(err));
    }
});
// 按分镜模式获取素材（库搜 / AI 图生成），含降级
const SearchForSceneSchema = zod_1.z.object({
    index: zod_1.z.number().int().positive(),
    /** 口播原文(给 refineSinglePrompt 当 LLM 输入)*/
    text: zod_1.z.string().max(2000).optional(),
    searchKeywords: zod_1.z.array(zod_1.z.string()).default([]),
    generationMode: zod_1.z.enum(['library', 'ai-image', 'ai-video', 'data-viz', 'mixed-video-image']),
    aiImagePromptCN: zod_1.z.string().max(500).optional(),
    aiImagePromptEN: zod_1.z.string().max(500).optional(),
    videoPromptCN: zod_1.z.string().max(500).optional(),
    videoPromptEN: zod_1.z.string().max(500).optional(),
    // 视觉风格的负向 prompt（来自 visualStyle.negativePrompt，enrichScenes 已落到 scene）
    negativePrompt: zod_1.z.string().max(2000).optional(),
    estDuration: zod_1.z.number().positive().optional(),
    dataVizConfig: zod_1.z.object({
        vizType: zod_1.z.enum(['grid-highlight', 'growth-bar', 'cost-compare', 'big-number']),
        numbers: zod_1.z.array(zod_1.z.string()),
        label: zod_1.z.string().optional(),
        subtitle: zod_1.z.string().optional(),
        labels: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
    /** 数据可视化标记 — 跟 generationMode 正交,refineSinglePrompt 按"信息图"风格写 prompt */
    isDataScene: zod_1.z.boolean().optional(),
    resolution: zod_1.z.string().default('1080x1920'),
    styleHint: StyleHintSchema,
});
router.post('/search-for-scene', (0, validate_1.validateBody)(SearchForSceneSchema), async (req, res) => {
    try {
        const aiDestDir = (0, paths_1.dataDir)('one-click-cache', 'ai-images');
        const aiVideoDestDir = (0, paths_1.dataDir)('one-click-cache', 'ai-generated');
        const result = await one_click_1.oneClick.searchForScene({
            index: req.body.index,
            text: req.body.text,
            searchKeywords: req.body.searchKeywords,
            generationMode: req.body.generationMode,
            aiImagePromptCN: req.body.aiImagePromptCN,
            aiImagePromptEN: req.body.aiImagePromptEN,
            videoPromptCN: req.body.videoPromptCN,
            videoPromptEN: req.body.videoPromptEN,
            negativePrompt: req.body.negativePrompt,
            estDuration: req.body.estDuration,
            dataVizConfig: req.body.dataVizConfig,
            isDataScene: req.body.isDataScene,
        }, {
            resolution: req.body.resolution,
            styleHint: req.body.styleHint || 'auto',
            aiDestDir,
            aiVideoDestDir,
        });
        res.json(ok(result));
    }
    catch (err) {
        logger_1.logger.error('one-click/search-for-scene error: ' + err);
        res.status(500).json(fail(err));
    }
});
// 让 AI 帮用户重写某个分镜的画面 prompt（在编辑对话框里点"✨ AI 重写"触发）
const RegenScenePromptSchema = zod_1.z.object({
    text: zod_1.z.string().min(1).max(500), // 分镜口播文本
    isVideoMode: zod_1.z.boolean().default(false), // 视频 prompt 还是图片 prompt
    aspect: zod_1.z.enum(['9:16', '16:9', '1:1']).default('9:16'),
    currentPrompt: zod_1.z.string().max(500).optional(), // 用户当前的 prompt（让 AI 改进，不是凭空生成）
    // 视觉风格预设 id，跟一键成片同步——LLM 会按对应风格写 prompt，
    // 后端再追加 styleTail（emotionVariant + fixedSuffix）保证最终 prompt 跟主路径口径一致
    visualStyleId: zod_1.z.number().int().nullable().optional(),
    // 当前分镜的情绪类型，用于挑对应 emotion 的 styleTail
    // （不传 → calm 兜底，跟主路径"未知 emotion 走 calm"逻辑一致）
    sceneEmotion: zod_1.z.enum(['excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous']).optional(),
    // 文案标题/主题，让 LLM 知道整支视频题材，重写时调性更一致
    topic: zod_1.z.string().max(200).optional(),
});
router.post('/regen-scene-prompt', (0, validate_1.validateBody)(RegenScenePromptSchema), async (req, res) => {
    try {
        const { llm } = require('../services/llm');
        const { styleEngine } = require('../services/style-engine/engine');
        const { DEFAULT_VISUAL_STYLE, getEmotionSuffix } = require('../services/style-engine/visual-styles');
        const { text, isVideoMode, aspect, currentPrompt, visualStyleId, sceneEmotion, topic } = req.body;
        // 加载视觉风格（不传 / 加载失败 → 默认电影写实，向后兼容）
        const visualStyle = visualStyleId
            ? (await styleEngine.getVisualStyle(visualStyleId).catch(() => null)) || DEFAULT_VISUAL_STYLE
            : DEFAULT_VISUAL_STYLE;
        const aspectHint = aspect === '9:16' ? '竖版构图（适合手机短视频）' :
            aspect === '16:9' ? '横版构图（适合横屏视频）' :
                '正方形构图';
        // ⚠️ 跟 scene-enrich.ts 主路径保持一致：四段式不写"风格段"，风格由系统追加
        const userPrompt = `给你一段短视频口播文案，请生成一段【${isVideoMode ? 'AI 视频' : 'AI 图片'}】生成 prompt。
${topic ? `\n## 整支视频主题\n${topic}\n` : ''}
## 输出要求
1. 中文，30-60 字（不含末尾系统追加的风格段）
2. 严格四段式：镜头类型 + 主体（年龄/族裔/衣着）+ 动作 + 环境
3. **严禁自己写"XX风格""XX摄影""电影级""4K""浅景深""艺术风"等风格词**——风格由系统统一追加，你写了会跟系统追加的风格打架
4. 中国语境优先（亚裔人物、汉字招牌、中式街景等）
5. 比例：${aspectHint}
${isVideoMode ? '6. 描述要包含动作/运镜（推近、平移、慢动作等）' : '6. 描述要静态画面，不要动作过程'}
7. 不要任何解释、序号、引号，只输出 prompt 文本本身
8. **角色一致性**：如果"当前 prompt"里有人物的年龄/族裔/衣着/特征描述（如"28岁亚裔男性，戴黑框眼镜，深棕色短发"），新 prompt **必须保留同一外观**——这是同一个人物在不同分镜出现，绝不能换人/换衣服/换发型

## 视觉风格指令（决定整支视频的调性，你写画面时要往这个方向贴主体/材质/光影）
${visualStyle.llmStyleRule}

## 口播文案
${text}
${currentPrompt ? `\n## 当前 prompt（可参考改进 + 必须继承其中的人物外观描述）\n${currentPrompt}` : ''}`;
        const result = await llm.completeWithScene('copy_adapt', // text-fast 类别，速度快
        isVideoMode ? '短视频画面 prompt 工程师（视频）' : '短视频画面 prompt 工程师（图片）', userPrompt, 0.8);
        const llmOutput = String(result || '')
            .trim()
            .replace(/^["「【\[]+|["」】\]]+$/g, '') // 去引号
            .replace(/^prompt[:：]?\s*/i, '') // 去前缀
            .slice(0, 400); // 留 100 字给 styleTail
        if (!llmOutput) {
            return res.status(500).json(fail(new Error('LLM 返回空')));
        }
        // 追加 styleTail：跟 enrichScenes 主路径同样的处理，保证 AI 生图/生视频拿到完整风格
        // 用分镜自己的 emotion，不传 → 'calm' 兜底（跟 getEmotionSuffix 内部白名单兜底逻辑一致）
        const styleTail = getEmotionSuffix(visualStyle, sceneEmotion || 'calm') + visualStyle.fixedSuffix;
        const finalPrompt = (llmOutput + styleTail).slice(0, 500);
        res.json(ok({ prompt: finalPrompt }));
    }
    catch (err) {
        logger_1.logger.error('one-click/regen-scene-prompt error: ' + err);
        res.status(500).json(fail(err));
    }
});
// AI 图片 provider 列表（给前端展示成本预估 + 配置状态）
router.get('/ai-image/providers', (_req, res) => {
    try {
        const { listImageProviders } = require('../services/ai-image-gen');
        res.json(ok(listImageProviders()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 单段重生成:只重做某一个分镜的 AI 视频
// 完全云端化后,所有旧 provider 字符串都规范成 'cloud',底层 CloudVideoAdapter
// 按用户云端 video 配置的 providerCode 自动分发(灵芽 / 百炼 / 速创等)
const RegenOneSchema = zod_1.z.object({
    provider: zod_1.z
        .preprocess(() => 'cloud', zod_1.z.enum(['cloud']))
        .default('cloud'),
    prompt: zod_1.z.string().min(1).max(500),
    aspect: zod_1.z.enum(['9:16', '16:9', '1:1']).default('9:16'),
    duration: zod_1.z.number().min(3).max(10).default(5),
    sceneIndex: zod_1.z.number().int().positive(),
    /** 口播原文 — 用于按需补写 prompt(切了 mode 但 prompt 还是图版/口播原文时触发)*/
    text: zod_1.z.string().max(2000).optional(),
    /** 另一种 mode 的 prompt — 用于检测"prompt 跟图版完全相同",触发补写时也作 LLM 参考输入 */
    aiImagePromptCN: zod_1.z.string().max(500).optional(),
    /** 数据可视化标记 — refineSinglePrompt 按"信息图视频"风格写 prompt(数字飞入/图表动画) */
    isDataScene: zod_1.z.boolean().optional(),
});
router.post('/ai-video/regenerate-one', (0, validate_1.validateBody)(RegenOneSchema), async (req, res) => {
    try {
        const destDir = (0, paths_1.dataDir)('one-click-cache', 'ai-generated');
        // 按需补写 prompt — 跟 searchForScene 入口逻辑保持一致
        let effectivePrompt = req.body.prompt;
        const sceneText = (req.body.text || '').trim();
        const otherPrompt = (req.body.aiImagePromptCN || '').trim();
        const currentPrompt = effectivePrompt.trim();
        const needRefine = (!!sceneText && currentPrompt === sceneText) ||
            (!!otherPrompt && currentPrompt === otherPrompt);
        if (needRefine && sceneText) {
            logger_1.logger.info(`[regenerate-one] scene#${req.body.sceneIndex} ai-video prompt 需要补写 ` +
                `(sameAsText=${currentPrompt === sceneText}, sameAsImage=${currentPrompt === otherPrompt})`);
            const { refineSinglePrompt } = require('../services/scene-enrich');
            effectivePrompt = await refineSinglePrompt(sceneText, otherPrompt, 'ai-video');
        }
        const result = await (0, ai_video_gen_1.regenerateOne)(req.body.provider, {
            prompt: effectivePrompt,
            aspect: req.body.aspect,
            duration: req.body.duration,
        }, destDir);
        res.json(ok({ sceneIndex: req.body.sceneIndex, result }));
    }
    catch (err) {
        logger_1.logger.warn(`[ai-video/regenerate-one] failed: ${String(err?.message || err)}`);
        res.status(500).json(fail(err));
    }
});
// AI 自动选 BGM
const AutoBgmSchema = zod_1.z.object({
    emotions: zod_1.z.array(zod_1.z.string()).min(1),
    videoDuration: zod_1.z.number().positive(),
});
router.post('/auto-bgm', (0, validate_1.validateBody)(AutoBgmSchema), async (req, res) => {
    try {
        const { pickBgmByEmotion } = require('../services/bgm-matcher');
        const { videoWorkshop } = require('../services/video-workshop');
        const lib = await videoWorkshop.listBgm();
        const picked = pickBgmByEmotion(req.body.emotions, req.body.videoDuration, lib);
        res.json(ok({ bgm: picked, available: lib.length }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 模板列表
router.get('/templates', (_req, res) => {
    try {
        const { TEMPLATE_META } = require('../services/scene-enrich');
        const list = Object.entries(TEMPLATE_META).map(([id, meta]) => ({
            id,
            label: meta.label,
            desc: meta.desc,
            example: meta.example,
        }));
        res.json(ok(list));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 搜图（仅图片，兼容老调用）
router.post('/search-images', (0, validate_1.validateBody)(SearchSchema), async (req, res) => {
    try {
        const list = await one_click_1.oneClick.search(req.body.keywords, req.body.perProvider, req.body.styleHint || 'auto');
        res.json(ok(list));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 混合搜：Pexels 视频 + Pexels/Unsplash 图片（新接口，前端分镜配图首选）
router.post('/search-mixed', (0, validate_1.validateBody)(SearchMixedSchema), async (req, res) => {
    try {
        const result = await one_click_1.oneClick.searchMixed(req.body.keywords, req.body.resolution, req.body.videoCount, req.body.imageCount, req.body.styleHint || 'auto');
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 合成（SSE）
router.post('/generate-stream', (0, validate_1.validateBody)(GenerateSchema), async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await one_click_1.oneClick.generate(req.body, sse);
    }
    catch (err) {
        logger_1.logger.error('one-click/generate error: ' + err);
        sse.sendError(String(err));
    }
});
// 列表
router.get('/list', async (req, res) => {
    try {
        const { page = '1', pageSize = '20' } = req.query;
        const result = await one_click_1.oneClick.list(Number(page), Number(pageSize));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 详情
router.get('/:id', async (req, res) => {
    try {
        const row = await one_click_1.oneClick.get(Number(req.params.id));
        if (!row)
            return res.status(404).json(fail('not found'));
        res.json(ok(row));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 删除
router.delete('/:id', async (req, res) => {
    try {
        const r = await one_click_1.oneClick.remove(Number(req.params.id));
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/batch-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];
        const r = await one_click_1.oneClick.removeMany(ids);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 导出草稿包（zip 下载）—— 适用于叙事型/对 AI 素材不满意想自己改的场景
router.get('/:id/export-draft', async (req, res) => {
    try {
        const zipPath = await one_click_1.oneClick.exportDraft(Number(req.params.id));
        res.download(zipPath, `oneclick-${req.params.id}-draft.zip`);
    }
    catch (err) {
        logger_1.logger.error('one-click/export-draft error: ' + err);
        res.status(500).json(fail(err));
    }
});
// ═══════════════ AI 视频生成（B 路线）═══════════════
// 列 provider + configured 状态
router.get('/ai-video/providers', (_req, res) => {
    try {
        res.json(ok((0, ai_video_gen_1.listProviders)()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 估算总成本：给 N 个分镜配 AI 视频要花多少钱
router.post('/ai-video/estimate', async (req, res) => {
    try {
        const { provider: rawProvider = 'lingyaai', scenes = [] } = req.body;
        const { normalizeVideoProvider } = require('../services/ai-video-gen');
        const provider = normalizeVideoProvider(rawProvider);
        const adapter = (0, ai_video_gen_1.getAdapter)(provider);
        const totalSec = scenes.reduce((sum, s) => sum + (s.duration || 5), 0);
        const costPerScene = scenes.map((s) => ({
            index: s.index,
            duration: s.duration,
            cost: adapter.estimateCost(s.duration || 5),
        }));
        const totalCost = costPerScene.reduce((sum, c) => sum + c.cost, 0);
        res.json(ok({
            provider,
            providerName: adapter.name,
            totalSeconds: totalSec,
            totalCostCny: Math.round(totalCost * 100) / 100,
            perScene: costPerScene,
        }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 批量生成（SSE）—— 给 scenes[] 每个都生成一段 AI 视频，实时推进度
router.post('/ai-video/generate-stream', async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        const { provider: rawProvider = 'lingyaai', scenes = [], resolution = '1080x1920' } = req.body;
        const { normalizeVideoProvider } = require('../services/ai-video-gen');
        const provider = normalizeVideoProvider(rawProvider);
        if (!Array.isArray(scenes) || scenes.length === 0) {
            return sse.sendError('scenes 为空');
        }
        const [w, h] = resolution.split('x').map(Number);
        const aspect = w < h ? '9:16' : w > h ? '16:9' : '1:1';
        const requests = scenes.map((s) => ({
            sceneIndex: s.index,
            // 优先用 v2 的 videoPromptCN（即梦中文理解更好），回落到 EN 或关键词拼接
            prompt: s.videoPromptCN ||
                s.videoPromptEN ||
                (s.searchKeywords || s.keywords || []).join(', ') ||
                s.text,
            aspect,
            duration: Math.min(10, s.duration || 5),
        }));
        const destDir = (0, paths_1.dataDir)('one-click-cache', 'ai-generated');
        const results = await (0, ai_video_gen_1.generateBatch)(provider, requests, destDir, (idx, status, err) => {
            sse.sendProgress(`分镜 ${idx}: ${status === 'start' ? '生成中…' : status === 'done' ? '完成 ✓' : '失败 ✗ ' + (err || '')}`, status === 'done' ? 100 : 50);
        });
        sse.sendDone({ results });
    }
    catch (err) {
        sse.sendError(String(err));
    }
});
exports.default = router;
//# sourceMappingURL=one-click.js.map