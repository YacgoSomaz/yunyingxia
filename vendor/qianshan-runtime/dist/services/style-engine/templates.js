"use strict";
// ══════════════════════════════════════════════════════════════════
//  集中管理所有业务场景的 System/User Prompt 模板，支持 {{var}} 插值
// ══════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATES = void 0;
exports.renderTemplate = renderTemplate;
const TEMPLATES = {
    topic_analyze: `你是一位资深自媒体内容策划师。请分析以下热搜话题，给出 3-5 个内容切入角度。
话题：{{keyword}}　平台：{{platform}}　热度：{{heat_score}}
请以 JSON 格式返回：
{ "angles": [{"title": "...", "description": "...", "difficulty": "easy|medium|hard"}], "target_audience": "...", "competition_level": "low|medium|high", "score": 0-100 }`,
    copy_outline: `你是一位短视频文案大师。根据以下要求生成视频文案大纲。
主题：{{topic}}　平台：{{platform}}　风格：{{style}}
注意事项：{{notes}}
请以 JSON 格式返回大纲：
[{"scene_id": 1, "title": "...", "duration_hint": "3-5s", "key_points": ["..."]}]`,
    copy_expand_scene: `根据以下场景大纲，写出完整的口播文案。
场景：{{scene_title}}　要点：{{key_points}}　风格：{{style}}
要求：口语化、有亲和力、单场景 50-100 字。`,
    copy_polish: `对以下文案进行最终润色，让语言更自然流畅。
原始文案：{{raw_text}}　风格：{{style}}
注意保持原意，不要加新内容。`,
    copy_subtitle: `将以下文案拆分为字幕时间轴。
文案：{{text}}　估计时长：{{duration}}s
以 JSON 数组返回：[{"start": 0.0, "end": 3.5, "text": "..."}]`,
    copy_title_generate: `为以下内容生成 8 个备选标题，分别采用不同风格。
内容摘要：{{summary}}　平台：{{platform}}
风格要求：1.悬念型 2.数字型 3.疑问型 4.故事型 5.对比型 6.权威型 7.Emoji型 8.追热型
JSON：[{"title": "...", "style": "suspense|number|question|story|contrast|authority|emoji|trending"}]`,
    copy_platform_adapt: `将以下文案适配到{{target_platform}}平台。
原文案（{{source_platform}}）：{{text}}
适配规则：{{adaptation_rules}}
直接返回适配后的文案文本。`,
    copy_video_rewrite: `你是一位视频文案改写专家。将以下视频字幕转化为原创文案。
原始字幕：{{subtitles}}　目标风格：{{style}}　目标平台：{{platform}}
要求：保留核心观点，完全重写语句，不要照抄。`,
    copy_text_rewrite: `你是一位自媒体文案加工专家。
原文：{{source_text}}
目标平台：{{platform}}　目标风格：{{style}}
加工任务：{{mode_instruction}}
额外要求：{{notes}}
要求：直接输出加工后的文案文本，不要加"以下是"之类的说明，不要加元信息。`,
    video_expand_prompt: `你是一位广告创意总监。用户提供了一张产品图和一段创意描述，请扩写为详细的视频画面描述。
产品：{{product_name}}　创意：{{creative_desc}}
请输出 2-4 段视频画面描述，每段 3-5 秒：
[{"scene": 1, "description": "详细画面描述", "duration": 5}]`,
    video_translate_en: `Translate the following Chinese video scene description to English for AI video generation API. Keep it visual and descriptive.
Chinese: {{text}}
Output English only, no explanation.`,
    distribute_suggest_time: `分析以下平台的最佳发布时间。
平台：{{platform}}　内容类型：{{content_type}}　历史数据：{{history_summary}}
JSON: [{"time": "HH:mm", "day": "weekday|weekend|daily", "reason": "...", "confidence": 0.0-1.0}]`,
};
exports.TEMPLATES = TEMPLATES;
/** 渲染模板：替换 {{var}} 变量（未传值时替换为空字符串） */
function renderTemplate(key, vars) {
    let tpl = TEMPLATES[key];
    // 先替换已知变量
    for (const [k, v] of Object.entries(vars)) {
        tpl = tpl.replaceAll(`{{${k}}}`, v ?? '');
    }
    // 清除未替换的占位符
    tpl = tpl.replace(/\{\{\w+\}\}/g, '');
    return tpl;
}
//# sourceMappingURL=templates.js.map