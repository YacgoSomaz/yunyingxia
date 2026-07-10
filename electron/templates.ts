import type { TemplateDefinition } from '../shared/contracts'

export const BUILTIN_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'topic_analyze', name: '选题分析', description: '从热点提炼可创作的内容角度',
    variables: ['keyword', 'platform', 'heat_score'],
    content: '你是万山自媒体的内容策划师。围绕话题“{{keyword}}”为{{platform}}分析 3 到 5 个可执行角度。热度参考：{{heat_score}}。请返回 JSON 对象，包含 angles、target_audience、competition_level、score。'
  },
  {
    id: 'copy_outline', name: '文案大纲', description: '将主题拆成可拍摄的短视频结构',
    variables: ['topic', 'platform', 'style', 'notes'],
    content: '你是短视频文案策划师。主题：{{topic}}。平台：{{platform}}。风格：{{style}}。补充要求：{{notes}}。请生成口播大纲并返回 JSON 对象，items 为场景数组；每项含 scene_id、title、duration_hint、key_points。'
  },
  {
    id: 'copy_expand_scene', name: '场景扩写', description: '把一个大纲场景写成口播稿',
    variables: ['scene_title', 'key_points', 'style'],
    content: '把以下短视频场景写成自然口语化的口播稿，长度 50 至 100 字。场景：{{scene_title}}。要点：{{key_points}}。风格：{{style}}。只输出正文。'
  },
  {
    id: 'copy_polish', name: '文案润色', description: '让整篇文案更顺畅、更有节奏',
    variables: ['raw_text', 'style'],
    content: '在不改变核心事实和结构的前提下润色以下文案。风格：{{style}}。原文：{{raw_text}}。只输出润色后的正文。'
  },
  {
    id: 'copy_subtitle', name: '字幕切分', description: '为口播稿生成字幕时间轴',
    variables: ['text', 'duration'],
    content: '将以下口播稿切分为字幕时间轴，总时长约 {{duration}} 秒。文案：{{text}}。返回 JSON 对象，items 为数组，每项含 start、end、text。'
  },
  {
    id: 'copy_title_generate', name: '标题生成', description: '生成多种风格的标题候选',
    variables: ['summary', 'platform'],
    content: '为以下内容生成 8 个适合{{platform}}的标题，覆盖悬念、数字、提问、故事、对比、权威、轻松和热点八种方向。内容摘要：{{summary}}。返回 JSON 对象，items 为数组，每项含 title、style。'
  },
  {
    id: 'copy_platform_adapt', name: '平台适配', description: '把既有文案改成目标平台表达',
    variables: ['target_platform', 'source_platform', 'text', 'adaptation_rules'],
    content: '把{{source_platform}}文案改写为适合{{target_platform}}发布的版本。原文：{{text}}。适配规则：{{adaptation_rules}}。保留事实，直接输出文案。'
  },
  {
    id: 'copy_video_rewrite', name: '视频文稿改写', description: '将字幕改写为原创表达',
    variables: ['subtitles', 'style', 'platform'],
    content: '把以下字幕改写为适合{{platform}}的原创文案。目标风格：{{style}}。字幕：{{subtitles}}。保留核心观点，避免复述原句，只输出正文。'
  },
  {
    id: 'copy_text_rewrite', name: '文本改写', description: '润色、扩写、压缩或重写现有文稿',
    variables: ['source_text', 'platform', 'style', 'mode_instruction', 'notes'],
    content: '你是自媒体文案编辑。原文：{{source_text}}。目标平台：{{platform}}。风格：{{style}}。任务：{{mode_instruction}}。额外要求：{{notes}}。直接输出处理后的文案，不要解释。'
  },
  {
    id: 'video_expand_prompt', name: '视频画面扩写', description: '把创意概念扩成视频镜头描述',
    variables: ['product_name', 'creative_desc'],
    content: '你是广告创意导演。围绕产品“{{product_name}}”和创意“{{creative_desc}}”，输出 2 至 4 个连续镜头。返回 JSON 对象，items 包含 scene、description、duration。'
  },
  {
    id: 'video_translate_en', name: '画面中译英', description: '将视频画面描述翻译为英文提示词',
    variables: ['text'],
    content: 'Translate this Chinese visual scene into concise English for an AI video model. Keep camera, light, action and composition details. Output English only. Chinese: {{text}}'
  }
]
