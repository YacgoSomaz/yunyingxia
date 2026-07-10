"use strict";
/**
 * 视觉风格模板系统
 *
 * 定义画面风格的完整配置（色调/构图/负向 prompt/LLM 指令），
 * 替代 scene-enrich.ts 中硬编码的"电影感写实摄影"单一风格。
 *
 * 每套模板包含：
 *   - baseStyle:       基础画面风格描述
 *   - emotionVariants: 6 种情绪各自的画面后缀（色调 + 对比度 + 构图）
 *   - negativePrompt:  AI 文生图的负向 prompt
 *   - llmStyleRule:    注入 LLM prompt 的风格指令（替换铁律 7 的硬编码描述）
 *   - fixedSuffix:     始终追加到 AI 图片 prompt 末尾的固定后缀
 *
 * 使用方式：
 *   1. 用户在前端选择视觉风格（预设 ID 或自定义配置）
 *   2. 后端从 DB 加载 → 传入 enrichScenes / generateImage
 *   3. enrichScenes 用 emotionVariants 替换原 EMOTION_STYLE_SUFFIX
 *   4. generateImage 用 negativePrompt 替换原 DEFAULT_NEGATIVE
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VISUAL_STYLE = void 0;
exports.getEmotionSuffix = getEmotionSuffix;
exports.parseVisualStyleConfig = parseVisualStyleConfig;
const VALID_EMOTIONS = [
    'excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous',
];
// ═══════════════════════════════════════════════════════════════
//  内置默认风格（电影写实）—— 与现有 scene-enrich.ts 硬编码完全一致
//  当未选择视觉风格时使用，确保 100% 向后兼容
// ═══════════════════════════════════════════════════════════════
exports.DEFAULT_VISUAL_STYLE = {
    baseStyle: '电影感写实摄影，自然光',
    emotionVariants: {
        excited: '，电影感写实摄影，自然光，暖色调高对比，动态构图，极致细节，无文字，无屏幕',
        serious: '，电影感写实摄影，自然光，冷色调低饱和，沉稳构图，极致细节，无文字，无屏幕',
        cheerful: '，电影感写实摄影，自然光，暖黄色调中等饱和，轻盈构图，极致细节，无文字，无屏幕',
        dramatic: '，电影感写实摄影，自然光，强明暗对比，紧张构图，极致细节，无文字，无屏幕',
        calm: '，电影感写实摄影，自然光，莫兰迪色调低对比，平稳构图，极致细节，无文字，无屏幕',
        humorous: '，电影感写实摄影，自然光，明亮饱和色调，明快构图，极致细节，无文字，无屏幕',
    },
    negativePrompt: 'low quality, blurry, deformed, extra fingers, bad hands, bad anatomy, watermark, ' +
        '(glowing brain:1.5), (matrix code rain:1.5), (floating money:1.4), (neon glow:1.3), ' +
        '(cartoon:1.4), (3d render:1.3), (plastic texture:1.3), (distorted text:1.5), ' +
        'screen UI, phone screen, computer screen, oversaturated, rainbow color',
    llmStyleRule: '所有画面：电影感写实摄影，自然光，无文字，无屏幕界面。' +
        '描述画面时优先描述物体材质（皮革、玻璃、皮肤、混凝土），而非光影特效。',
    fixedSuffix: '，极致细节，无文字，无屏幕',
};
// ═══════════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════════
/**
 * 获取指定情绪的画面后缀
 * 无效情绪 → fallback 到 calm（与 scene-enrich.ts 现有逻辑一致）
 */
function getEmotionSuffix(style, emotion) {
    const key = VALID_EMOTIONS.includes(emotion)
        ? emotion
        : 'calm';
    return style.emotionVariants[key] || style.emotionVariants.calm;
}
/**
 * 解析 config JSON 为 VisualStyleConfig
 * 容错：缺字段时用默认值兜底，永远不会崩
 */
function parseVisualStyleConfig(raw) {
    if (!raw || typeof raw !== 'object')
        return { ...exports.DEFAULT_VISUAL_STYLE };
    const obj = raw;
    return {
        baseStyle: String(obj.baseStyle || exports.DEFAULT_VISUAL_STYLE.baseStyle),
        emotionVariants: {
            excited: String(obj.emotionVariants?.excited || exports.DEFAULT_VISUAL_STYLE.emotionVariants.excited),
            serious: String(obj.emotionVariants?.serious || exports.DEFAULT_VISUAL_STYLE.emotionVariants.serious),
            cheerful: String(obj.emotionVariants?.cheerful || exports.DEFAULT_VISUAL_STYLE.emotionVariants.cheerful),
            dramatic: String(obj.emotionVariants?.dramatic || exports.DEFAULT_VISUAL_STYLE.emotionVariants.dramatic),
            calm: String(obj.emotionVariants?.calm || exports.DEFAULT_VISUAL_STYLE.emotionVariants.calm),
            humorous: String(obj.emotionVariants?.humorous || exports.DEFAULT_VISUAL_STYLE.emotionVariants.humorous),
        },
        negativePrompt: String(obj.negativePrompt || exports.DEFAULT_VISUAL_STYLE.negativePrompt),
        llmStyleRule: String(obj.llmStyleRule || exports.DEFAULT_VISUAL_STYLE.llmStyleRule),
        fixedSuffix: String(obj.fixedSuffix || exports.DEFAULT_VISUAL_STYLE.fixedSuffix),
    };
}
//# sourceMappingURL=visual-styles.js.map