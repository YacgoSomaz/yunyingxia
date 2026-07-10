"use strict";
// ══════════════════════════════════════════════════════════════════════
//  档位常量 + 简化的"cheap fallback"工具
//
//  完全云端化后,3 档(cheap/recommended/premium)的语义已经不在桌面端维护了,
//  用户在 qianshanai.cn 直接选具体 modelName。本文件只剩:
//   ① 任务类 / 档位 / 标签等枚举(给 UI / 类型用)
//   ② resolveTier(): 用于"主模型超时 → 自动重试 cheap 档兜底"这一处降级
//      —— 按云端 providerCode 给出一个稳妥的便宜 model name(不再查 TIER_MAP 大表)
// ══════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCENE_TO_CATEGORY = exports.DEFAULT_TIER_PER_CATEGORY = exports.TIER_LABELS = exports.CATEGORY_LABELS = void 0;
exports.resolveTier = resolveTier;
exports.CATEGORY_LABELS = {
    'text-fast': '📝 短文本(标题/字幕/翻译)',
    'text-long': '📄 长文本(大纲/分镜/润色/洗稿)',
    image: '🎨 AI 图片',
    video: '🎞️ AI 视频',
    voice: '🎙️ 语音(TTS / 配音)',
};
exports.TIER_LABELS = {
    cheap: '💰 省钱',
    recommended: '⭐ 推荐',
    premium: '🚀 最强',
};
/** 默认档位(没选过时的兜底) */
exports.DEFAULT_TIER_PER_CATEGORY = {
    'text-fast': 'recommended',
    'text-long': 'recommended',
    image: 'recommended',
    video: 'cheap',
    voice: 'recommended',
};
exports.SCENE_TO_CATEGORY = {
    // 短文本
    topic_analyze: 'text-fast',
    copy_subtitle: 'text-fast',
    copy_title: 'text-fast',
    copy_adapt: 'text-fast',
    video_translate_en: 'text-fast',
    distribute_suggest_time: 'text-fast',
    // 长文本
    copy_outline: 'text-long',
    copy_expand: 'text-long',
    copy_polish: 'text-long',
    copy_rewrite: 'text-long',
    video_expand_prompt: 'text-long',
    one_click_split: 'text-long',
    distribute_insight: 'text-long',
    generic: 'text-fast',
};
/**
 * "cheap 档兜底"工具 — 只在主模型超时时重试时用一次。
 * provider = 云端 user_llm_config.providerCode (lingya/aliyun_dashscope/deepseek/wuyinkeji/cool/bltcy/geek)
 *
 * 注:不再查大档位表。每家中转/直连给一个保守的便宜 model name 即可,
 *    用户云端 key 不一定有这个 model 的访问权 → 失败会被外层 catch 然后跳过(返 null)。
 */
function resolveTier(provider, category, _tier) {
    if (category !== 'text-fast' && category !== 'text-long')
        return null;
    switch (provider) {
        case 'aliyun_dashscope':
        case 'qwen': // 兼容老 routing 写的 'qwen'
            return { model: 'qwen-turbo', capability: 'basic', price: '¥0.3→¥0.6/M' };
        case 'deepseek':
            return { model: 'deepseek-chat', capability: 'basic', price: '¥1→¥2/M' };
        // 灵芽 / 速创 / 柏拉图 / Geek / coolapis 等 OpenAI-compat 中转
        // 共用 deepseek-v4-flash 这种通用便宜 model name
        case 'lingya':
        case 'lingyaai':
        case 'wuyinkeji':
        case 'cool':
        case 'bltcy':
        case 'geek':
        default:
            return { model: 'deepseek-v4-flash', capability: 'basic', price: '¥1→¥2/M' };
    }
}
//# sourceMappingURL=llm-tiers.js.map