"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATE_META = exports.MAX_SCENES = void 0;
exports.computePacing = computePacing;
exports.calcVideoQuota = calcVideoQuota;
exports.refineSinglePrompt = refineSinglePrompt;
exports.enrichScenes = enrichScenes;
exports.convertToSpokenScript = convertToSpokenScript;
exports.colloquializeSceneTexts = colloquializeSceneTexts;
exports.splitAndEnrichScenes = splitAndEnrichScenes;
exports.applyTemplatePacing = applyTemplatePacing;
/**
 * 分镜"加工"阶段 —— 给已切分好的分镜补齐：
 *   - videoPrompt：给 AI 视频生成用的镜头描述（中英双语，Seedance 友好）
 *   - searchKeywords：给 Pexels 搜素材用的英文词组
 *   - emotion：情绪标签（用于 BGM 匹配 / 转场选择）
 *
 * 关键原则：LLM 只做它擅长的"理解 + 描述"，不做它不擅长的"切分/节奏"。
 *
 * 调用模式：
 *   - 一次给 LLM 完整上下文（所有 scenes），让它一次返回所有 scenes 的 enriched 版本
 *   - 相比"每 scene 一次调用"节省 3-5 倍成本，且 LLM 能看到上下文做连贯性优化
 */
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
const locale_detect_1 = require("../utils/locale-detect");
const visual_styles_1 = require("./style-engine/visual-styles");
/**
 * 情绪白名单（与 visual-styles.ts 中 VisualEmotion 一致）。
 *
 * 风格后缀（baseStyle + 6 种 emotion variants + negativePrompt + llmStyleRule）
 * 已迁移到 style-engine/visual-styles.ts 的 VisualStyleConfig，
 * 通过 visualStyle 参数从 splitAndEnrichScenes 一路注入到 enrichScenes / retryEmptyPrompts，
 * 不再硬编码"电影感写实"单一风格。
 */
const VALID_EMOTIONS = ['excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous'];
/**
 * 总分镜数上限（防止长文案 + 快节奏导演建议切出几十上百段，
 * 让 SceneEnrich 每段一次 LLM 调用拖到天荒地老）。
 * 超过这个值会反算 secPerScene = estDurationSec / MAX_SCENES，
 * 让下游字数/秒数范围跟着抬高，保持 LLM 切分提示词与实际目标一致。
 */
exports.MAX_SCENES = 40;
/**
 * 由导演给的 suggestedAvgDuration 推出 (secPerScene, targetSceneCount)。
 * 唯一真理来源——splitAndEnrichV2 和 one-click 标点降级都必须从这里取，
 * 否则两条切分路径节奏会漂。
 *
 * 夹紧逻辑：
 *   1. secPerScene 先夹到 [2, 10]（导演异常值/null 兜底 5）
 *   2. targetSceneCount = round(estDurationSec / secPerScene)
 *   3. 若 > MAX_SCENES，反算 secPerScene = estDurationSec / MAX_SCENES（再夹一次 ≥2），
 *      targetSceneCount = MAX_SCENES
 *   4. 否则 targetSceneCount 保底 ≥3
 */
function computePacing(estDurationSec, rawAvgFromDirector) {
    let secPerScene = Math.max(2, Math.min(10, Number(rawAvgFromDirector) || 5));
    let targetSceneCount = Math.round(estDurationSec / secPerScene);
    if (targetSceneCount > exports.MAX_SCENES) {
        secPerScene = Math.max(2, estDurationSec / exports.MAX_SCENES);
        targetSceneCount = exports.MAX_SCENES;
    }
    else {
        targetSceneCount = Math.max(3, targetSceneCount);
    }
    return { secPerScene, targetSceneCount };
}
/**
 * 按总分镜数算 ai-video 软上限（防失控刷账单）
 * 真正决定 ai-video 还是 ai-image 的是 LLM 按"内容动态性"判断，这里只是兜底
 */
function calcVideoQuota(totalScenes, qualityMode) {
    if (qualityMode === 'unlimited')
        return Infinity;
    if (qualityMode === 'budget')
        return 0;
    const n = Math.max(0, Number(totalScenes) || 0);
    if (qualityMode === 'premium')
        return Math.max(2, Math.floor(n * 0.5));
    // balanced 兜底
    return Math.max(1, Math.floor(n * 0.25));
}
/**
 * 共享正则：识别分镜文本中的"人物/动作/情绪"信号。
 * 用于两个地方：
 *   1. `inferModeFallback` —— LLM 失败时本地启发式判断
 *   2. 主流程后处理 —— 如果 LLM 错判为 library 但文本含人物/动作，强制升级 ai-image
 *      （因为 Pexels/Pixabay/Unsplash 对中国人物场景素材严重不足）
 */
const PERSON_WORDS = /(老王|小李|小张|张三|李四|老板|同事|朋友|妈妈|爸爸|女朋友|男朋友|程序员|外卖|打工人|宝妈|大学生|主播|博主|网红|明星|工人|老师|学生|医生|护士|律师|警察|司机|服务员|年轻人|中年人|老人|男孩|女孩|男人|女人|他|她|我|你们|他们|她们)/;
const ACTION_WORDS = /(哭|笑|吼|吵|打|跑|摔|跳|躺|坐|站|走|骂|怒|慌|崩溃|发抖|颤抖|叹气|盯着|望着|看着|抓起|抬头|低头|握住|拥抱|挥手|点头|摇头)/;
const EMOTION_WORDS = /(开心|兴奋|紧张|焦虑|绝望|无奈|伤心|难过|愤怒|生气|害怕|恐惧|惊讶|好奇|迷茫|失落|疲惫|放松)/;
/**
 * 判断分镜文本是否含"人物/动作/情绪"信号。
 * 含这些信号的分镜不适合走 Pexels 英文素材库（库存中国人物/场景稀缺）。
 */
function hasHumanSignals(text) {
    return PERSON_WORDS.test(text) || ACTION_WORDS.test(text) || EMOTION_WORDS.test(text);
}
exports.TEMPLATE_META = {
    'hook-argue-twist': {
        label: '钩子+论证+反转',
        desc: '开头抛爆点，中段陈述，结尾反转（适合知识科普）',
        example: '为什么 90% 的人都想错了 → 因为他们忽略了... → 其实正确的做法是...',
        pacing: ['fast', 'medium', 'medium', 'slow', 'fast'],
    },
    list: {
        label: '清单型',
        desc: '盘点 N 个点，节奏明快（适合技巧/推荐）',
        example: '3 个让你专注的方法 → 方法 1 → 方法 2 → 方法 3 → 总结',
        pacing: ['fast', 'medium', 'medium', 'medium', 'medium', 'fast'],
    },
    story: {
        label: '故事起承转合',
        desc: '开场抓人 → 发展 → 转折 → 结尾（适合经历/案例）',
        example: '我朋友老王 → 做了这件事 → 没想到 → 最后他...',
        pacing: ['medium', 'medium', 'slow', 'fast', 'medium'],
    },
    contrast: {
        label: '对比型',
        desc: '先 A 后 B 强对比（适合改造/效果展示）',
        example: '以前我是这样做 → 结果很糟 → 后来改成这样 → 效果翻倍',
        pacing: ['medium', 'slow', 'medium', 'fast'],
    },
    tutorial: {
        label: '教程型',
        desc: '一步一步教（适合操作/方法讲解）',
        example: '第一步：... → 第二步：... → 第三步：... → 效果如图',
        pacing: ['medium', 'medium', 'medium', 'medium', 'slow'],
    },
};
/**
 * 单条 scene 的目标 prompt 按需补写。
 *
 * 触发场景:用户在前端 Segmented 切了 ai-image ↔ ai-video,但目标 mode 的 prompt 缺失或
 *           跟另一个 mode 完全相同(LLM 偷懒)→ 进 searchForScene 前先调一次 LLM 重写,
 *           生成针对该 mode 的精准 prompt,然后再跑生成。
 *
 * 设计原则:
 *   - 单条 scene 单次 LLM 调用(轻量,不分批不流式)
 *   - 输出短(单字段 30-60 字),非流式 chat 就够,maxTokens 默认 8192 绰绰有余
 *   - 走 'one_click_split' scene 路由(跟拆分镜同档位,通常是 cheap/fast model)
 *   - 失败时直接返回原 prompt,不阻塞生成主流程
 *
 * @param sceneText 分镜口播文本
 * @param otherPrompt 另一种 mode 的 prompt(给 LLM 看意境参考,可空)
 * @param targetMode 目标生成模式
 * @returns 精写后的 prompt;失败时返回 otherPrompt 或 sceneText 兜底
 */
async function refineSinglePrompt(sceneText, otherPrompt, targetMode) {
    const modeDesc = targetMode === 'ai-video'
        ? '强调镜头运动/动作动势(如"推近"、"闪过"、"冲向"、"扫过"等),描写正在发生的动态画面'
        : '强调构图层次/光影/质感,描写画面凝固在某个瞬间的静态质感,**去掉所有动作词**';
    const prompt = `你是短视频导演助手,为下面这一个分镜补写一份针对"${targetMode === 'ai-video' ? 'AI 视频' : 'AI 图片'}"的画面描述。

分镜口播文本:
"${sceneText}"

${otherPrompt ? `参考(另一种 mode 的 prompt,你需要写一个**不同侧重**的版本):\n"${otherPrompt}"\n` : ''}

输出要求:
1. 中文,30-60 字
2. ${modeDesc}
3. 严格遵守四段式描述:镜头(角度/景别) + 主体(具体人物/物体描述) + 动作(${targetMode === 'ai-video' ? '正在做什么' : '此刻的姿态'}) + 环境(背景/光线)
4. **禁止写风格词**(如"电影级""4K""浅景深""高级感"等),风格由系统统一追加
5. 如果出现具体人物,写明年龄/族裔/衣着特征

输出 JSON,只一个 prompt 字段:
{"prompt": "你写的画面描述"}`;
    try {
        const result = await llm_1.llm.completeJSONWithScene('one_click_split', '短视频导演助手', prompt);
        const refined = String(result?.prompt || '').trim();
        if (refined && refined.length >= 10) {
            logger_1.logger.info(`[refineSinglePrompt] ${targetMode} 补写成功 (${refined.length} 字): ${refined.slice(0, 40)}...`);
            return refined;
        }
        logger_1.logger.warn(`[refineSinglePrompt] ${targetMode} LLM 返回内容过短或为空,回退原 prompt`);
    }
    catch (err) {
        logger_1.logger.warn(`[refineSinglePrompt] ${targetMode} LLM 调用失败,回退原 prompt: ${String(err?.message || err).slice(0, 120)}`);
    }
    // 失败兜底:返回另一种 mode 的 prompt(至少有内容),还不行就用口播原文
    return otherPrompt || sceneText;
}
/**
 * 给切好的分镜批量加元信息
 *
 * @param scenes 已由 scene-splitter 切好的分镜数组
 * @param topic 文案主题（帮 LLM 理解上下文）
 * @param template 可选：指定使用哪个模板（影响 pacing）
 * @param styleHint 画面风格（影响关键词地域修饰）。'auto' = 自动语境检测
 */
async function enrichScenes(scenes, topic, template, styleHint = 'auto', qualityMode = 'balanced', onProgress, directorResult, visualStyle = visual_styles_1.DEFAULT_VISUAL_STYLE) {
    if (scenes.length === 0)
        return [];
    // 决定实际语境：auto → 跑检测；手动指定则用手动值
    let effective;
    if (styleHint === 'chinese')
        effective = 'chinese';
    else if (styleHint === 'western' || styleHint === 'japanese')
        effective = 'international';
    else if (styleHint === 'universal')
        effective = 'unknown';
    else {
        const joined = (topic || '') + '\n' + scenes.map((s) => s.text).join('\n');
        effective = (0, locale_detect_1.detectLocale)(joined);
    }
    logger_1.logger.info(`[SceneEnrich] styleHint=${styleHint}, effective locale=${effective}`);
    // 质量档位 = "成本上限",不再卡死配额。**真正决定 ai-video 还是 ai-image 的是内容动态性**(见下面铁律)。
    // 配额只是软上限,防止内容判定失控时刷爆账单。按总分镜数比例算（详见 calcVideoQuota）。
    const promptVideoQuota = calcVideoQuota(scenes.length, qualityMode);
    const promptVideoQuotaText = promptVideoQuota === Infinity ? '不限' : `${promptVideoQuota} 个`;
    const qualityRule = qualityMode === 'budget'
        ? `\n**质量档位=省钱**：禁用 "ai-video"。所有动态/静态画面统一走 "ai-image"（Kolors ~¥0.04/张）。只有纯空镜/抽象背景才用 "library"。\n`
        : qualityMode === 'unlimited'
            ? `\n**质量档位=不限**：按内容动态性自由选 "ai-video" / "ai-image"（见下方"画面生成模式"判定）。本档不限制 ai-video 数量，按内容需要标注即可。\n`
            : qualityMode === 'premium'
                ? `\n**质量档位=高质量**：按内容动态性自由选 "ai-video" / "ai-image"（见下方"画面生成模式"判定）。本档软上限 ${promptVideoQuotaText} ai-video（约总镜头数的 50%），超出会被自动降级为 ai-image。\n`
                : `\n**质量档位=均衡（推荐）**：按内容动态性自由选 "ai-video" / "ai-image"（见下方"画面生成模式"判定）。本档软上限 ${promptVideoQuotaText} ai-video（约总镜头数的 25%），超出会被自动降级为 ai-image。\n`;
    // 按语境给 LLM 的硬性指令
    const localeRule = effective === 'chinese'
        ? `\n**强制规则**：本文案属于${(0, locale_detect_1.describeLocale)(effective)}。
   - videoPromptCN 必须描写中国人物/场景（亚裔面孔、汉字招牌、中式建筑/服装/街景）
   - searchKeywords **每组必须至少包含一个** "chinese"/"asian"/"china" 的限定词
   - 例：\`"chinese street food", "asian night market", "chinese young woman office"\`\n`
        : effective === 'international'
            ? `\n**提示**：本文案属于${(0, locale_detect_1.describeLocale)(effective)}，按通用欧美/国际场景描述即可，searchKeywords 不需要加地域限定。\n`
            : '';
    const prompt = `你是资深短视频导演 + AI 视频生成提示词专家。下面给你一组已切分好的分镜（text 不要改），请为每个分镜补上视觉信息。

${topic ? `## 文案主题\n${topic}\n\n` : ''}${template ? `## 视频模板\n${exports.TEMPLATE_META[template].label} - ${exports.TEMPLATE_META[template].desc}\n\n` : ''}## 规则
${qualityRule}${localeRule}
## 画面生成模式（generationMode）—— 核心决策(按内容动态性选,不要按配额)

**判定标准 = "静态截图能不能表达"**:

- **"ai-video"**（AI 文生视频，¥0.5/次）—— 当分镜含**动态信号**,静态截图无法表达时:
  - **动作连续**: 跑/摔/打/快速切换 / "翻动"/"滑动"/"转动"/"敲击"
  - **状态变化**: 数据爆炸增长 / 扩散蔓延 / 扭曲变形 / 翻倍 / "从 X 到 Y"
  - **快速节奏**: "闪过""跳出""切换""掠过""涌现"
  - **过程性描述**: "下载完成""加载""排队""一步步"
  - 例:"数据从 4 到 200+ 蔓延"、"手指快速划手机切换 5 个画面"、"钞票塌成山"
- **"ai-image"**（AI 文生图，¥0.04/张）—— **默认主力**:静态画面/人物表情/构图/信息图/概念插图。
  - 例:"亚裔程序员盯电脑"、"信息图(数据墙)"、"概念隐喻图"
- **"library"**（Pexels 库搜）—— **仅兜底**:纯空镜/纯自然风光/几何抽象。**禁止**含人物的走 library。

**关键原则**: 内容自身需要"动起来"才用 ai-video。不需要动的(只是"一个人在那里")用 ai-image,**不要为了"好看"而强制 ai-video**(浪费钱也不一定贴合)。

═══════════════════════════════════════════════
## 📐 写画面 prompt 的 7 条铁律（必须遵守）
═══════════════════════════════════════════════

### 铁律 1 · 四段式公式
每个 prompt 必须包含：**镜头类型 + 主体（具体到年龄/族裔/衣着）+ 动作 + 环境**

⚠️ **严禁自己写"风格段"**！画面整体风格由系统按铁律 7 在 prompt 末尾**自动追加**。
你写了「XX风格」「XX摄影」「电影级」「4K」「浅景深」「艺术风」「海报感」「立体视觉」这类词，
会与系统追加的风格**直接打架**（比如系统追加了"赛博朋克"，你又写了"写实风格"，AI 就出乱图）。

❌ 差：「一个人在看手机」（信息密度太低）
❌ 差：「...暖色床头灯泛黄，电影级浅景深」（自己写了风格词，会和系统追加的风格冲突）
✅ 好：「第一视角特写镜头，一位年轻亚裔女性戴无线耳机，手握竖屏手机在昏暗卧室刷短视频，屏幕蓝光打在下巴」

### 铁律 2 · 主体绝不能模糊
人物必须有**年龄/族裔/衣着**三个维度。

❌ 差：「一位女性」「一个打工人」「外卖员」
✅ 好：「一位 25 岁左右亚裔女性，穿深色职业装」「一位戴黄色头盔、穿黄色外卖制服的年轻亚裔骑手」

### 铁律 3 · 抽象词必须具象化
原文出现"机会 / 压力 / 突破 / 平权"这类抽象词时，**不要直接写词**，用视觉隐喻替代。

| 抽象概念 | 视觉化 |
|---|---|
| 机会 | 一扇半开的大门透出金光 |
| 平权但结果不等 | 两个平衡的秤托盘 vs 一个倾斜的秤托盘 |
| 下限 vs 上限 | 底部整齐的地基 + 上方漂浮的灵感符号 |
| 从玩具到工具 | 左侧卡通玩具 + 右侧专业设备 |

### 铁律 4 · 数据/清单类镜头用信息图风格，不要硬画真人
原文出现具体数字、月份对比、百分比、清单时，用**信息可视化**，别强塞真人。

❌ 差（"11 月数据"）：「一位数据分析师在看电脑屏幕」 ← 和数据无关，观众看不到数字
✅ 好：「全屏数据可视化，5000 个竖屏短剧缩略图构成彩色网格，其中 4 个金色高亮，左上角醒目标注"2026.1 · 5000部中仅4部AI"，蓝紫色渐变背景」

### 铁律 5 · 名人/特定人物直接点名
原文出现马斯克、雷军、李子柒等名人 → 直接写名字，Kolors 能识别大部分中外名人。

✅ 好：「中近景，马斯克（中年白人男性，标志性黑色 T 恤）站在 SpaceX 发射台前惊讶摊手」

### 铁律 6 · 必须出现"剧情核心物件/动作"，禁止套模板
**原文里出现的关键物件/动作/数据/品牌名,prompt 里必须明确画出来**。绝不允许只写"亚裔人物 + 中式背景 + 某种光影 + 现代纪实风格"这种万能模板套用。

逐条对应原文关键词,把它"翻译成画面元素":
| 原文关键词 | 必须出现的画面元素 |
|---|---|
| "看短剧""刷视频" | 手机 + 屏幕里有短剧画面(豪门/婚纱/撕照片等) |
| "闪婚首富娇妻" | 婚纱女 + 外卖男 反差对比构图 |
| "数据 200+""增长 17 亿" | 必须画出**具体数字**或可视化曲线/饼图/柱图 |
| "Seedance 2.0""ChatGPT" | 软件界面截图感 / Logo 字样 |
| "工具决定下限" | 工具图标(齿轮/相机) + 上下分层结构 |
| "拍电影预告片" | 电影海报缩略图 / IMAX 字样光影 |
| "排队等渲染" | 进度条 / 时钟 / loading 动画 |

❌ 差(套模板,完全脱离剧情,且擅自写"风格"词):"亚裔青年特写,表情矛盾,背景模糊汉字招牌,霓虹光影,土味时尚风格"
✅ 好(贴合"看短剧上头",纯环境/动作,不写风格):"亚裔青年特写,盯着手机眼神迷离嘴角微扬,黑眼圈明显,手机屏幕模糊显示豪门撕照片画面,屏幕蓝光打在脸上,深夜路灯透过窗帘"

**反思机制**:写完 prompt 后自检——如果把 prompt 里的"原文关键物件/动作"删了,这个 prompt 还能套用到任何分镜上,说明你写得太空,**重写**。

### 铁律 7 · 【视觉风格指令】所有画面统一执行
${visualStyle.llmStyleRule}

═══════════════════════════════════════════════
## 🎭 识别每个分镜的"叙事角色"，选对应视觉策略
═══════════════════════════════════════════════

- **开场钩子**（第 1-3 段）→ 强共鸣场景 / 悬念构图 / 第一视角代入
- **论据/举例**（人物故事）→ 具体身份对比 / 强色彩对比
- **数据轰炸**（含数字/日期/百分比）→ 信息图 / 图表 / 数据墙可视化，**不画人**
- **名人引用**→ 直接画那个人 + 社交媒体界面
- **产品/工具展示**→ 现代 UI 界面 / 软件全屏截图感
- **论断/金句**（全片强点）→ 宏大构图 / 纵向上升构图 / 对比秤等视觉隐喻
- **过渡句**→ 简洁不抢戏
- **幽默结尾**→ 反差萌 / 卡通梗图风

**连续性**：前后提到同一角色（比如 "外卖小哥" 出现 3 次）→ 衣服/发型/面部特征必须一致。

═══════════════════════════════════════════════
## 每个分镜输出字段
═══════════════════════════════════════════════

1. **videoPromptCN**: 中文镜头描述，30-60 字，严格遵守四段式(镜头+主体+动作+环境)。**禁止自己写"XX风格""XX摄影""电影级""4K""浅景深"等风格词**——风格由系统统一追加。
   例：\`中景双人镜头，左侧穿黄色外卖制服和头盔的亚裔年轻骑手捧着保温箱，右侧一位身着金红刺绣中式婚纱的年轻女性惊讶对视，背景是豪华中式别墅大门和大红喜字，戏剧性反差构图\`

2. **aiImagePromptCN**: 静态图版本，侧重构图/光影/人物表情/细节，去掉明显动作。**同样禁止写风格词**。
   例：\`特写，一位 28 岁左右亚裔男性总裁，穿合体定制西装，站在落地窗前，冷峻侧脸，窗外上海陆家嘴夜景，侧光勾勒轮廓\`

3. **searchKeywords**: 3-5 个英文词组（仅 Pexels 后端用，前端不显示）。具象名词+场景，中国元素加 chinese/asian。

4. **emotion**: excited / serious / cheerful / dramatic / calm / humorous

5. **shotType**: close-up / medium / wide / pov / aerial

6. **generationMode**: 从 library / ai-image / ai-video 选

═══════════════════════════════════════════════
## 📝 完整示范（给你对标用）
═══════════════════════════════════════════════

原文分镜 1：\`这种剧情你们以前都刷到过吧？\`
输出：
\`\`\`json
{
  "videoPromptCN": "第一视角特写镜头，一只年轻亚洲人的手握竖屏手机，屏幕里快速闪过多个狗血短剧画面（豪门吻戏、撕照片、跪地哭），背景是昏暗卧室和凌乱床单，屏幕蓝光打在下巴",
  "aiImagePromptCN": "第一视角俯拍，一只年轻亚裔的手握竖屏手机，屏幕正在播放狗血短剧（豪门撕照片画面），手机蓝光打在手背和床单，昏暗卧室暖色床头灯背景",
  "searchKeywords": ["asian hand holding phone dark room", "watching drama phone night"],
  "emotion": "dramatic",
  "shotType": "pov",
  "generationMode": "ai-video"
}
\`\`\`

原文分镜 2：\`抖音前五千的短剧里，全AI生成的才四部；\`
输出：
\`\`\`json
{
  "videoPromptCN": "俯视数据墙构图，5000 个竖屏短剧缩略图构成密集彩色网格，其中仅有 4 个用金色荧光边框高亮突出，左上角醒目标注\\"2026.1 · 5000部中仅4部AI\\"，蓝紫色深空渐变背景",
  "aiImagePromptCN": "同上（信息图场景不需要单独图版）",
  "searchKeywords": ["infographic data wall", "chinese tiktok app interface", "neon grid visualization"],
  "emotion": "serious",
  "shotType": "wide",
  "generationMode": "ai-image"
}
\`\`\`

原文分镜 3：\`工具决定了下限，但你的创意和内容才决定上限。\`
输出：
\`\`\`json
{
  "videoPromptCN": "纵向上升概念构图，画面底部整齐排列的 AI 工具图标（像乐高砖块）构成厚实地基象征\\"下限\\"，中间腾空漂浮着各种闪光创意灵感符号（灯泡/画笔/故事板）向上冲向云端象征\\"上限\\"",
  "aiImagePromptCN": "纵向构图，底层密集 AI 工具图标地基，中层空旷过渡，顶层漂浮发光的创意符号（灯泡、画笔、故事板）冲向金色天空，三段式明暗对比",
  "searchKeywords": ["geometric foundation layers", "floating lightbulb icons sky", "conceptual art vertical"],
  "emotion": "serious",
  "shotType": "wide",
  "generationMode": "ai-image"
}
\`\`\`

**对着这三个示范写你的 prompt，不要偷懒用"一位女性在看手机"这种空话。**
${buildCharacterAnchor(directorResult)}
## 分镜

${scenes.map((s) => `${s.index}. ${s.text}`).join('\n')}

## 输出

**只输出 6 个字段**,按原分镜顺序:
[
  {
    "index": 1,
    "videoPromptCN": "...",
    "aiImagePromptCN": "...",
    "searchKeywords": ["...", "...", "..."],
    "emotion": "serious",
    "shotType": "medium",
    "generationMode": "ai-image"
  }
]

⚠️ **不要输出 EN 翻译字段、不要输出 searchKeywordsCN、不要输出 generationReason**。
字段精简 = 让你更专注写好 prompt 本身,避免 JSON 输出截断。`;
    try {
        // 走流式（单次 180s），因为一次拆 N 个分镜的 JSON 输出常 60-90s，
        // 非流式 60s 超时撑不过去。参见 base-client.ts timeout + deepseek-client.ts *3 逻辑。
        const raw = await llm_1.llm.completeJSONWithSceneStream('one_click_split', '短视频导演', prompt, onProgress
            ? (ck) => {
                if (!ck.isFinished && ck.content)
                    onProgress(ck.content);
            }
            : undefined);
        const arr = Array.isArray(raw) ? raw : [];
        // 按 index 索引
        const byIndex = new Map();
        for (const item of arr) {
            if (item?.index)
                byIndex.set(Number(item.index), item);
        }
        // ai-video 软上限(防失控刷账单)：按本批镜头数比例算（详见 calcVideoQuota）
        // 真正决定 ai-video 还是 ai-image 的是 LLM 按"内容动态性"判断,这里只是兜底
        // 注意：批处理时这里是 per-batch 上限；最终 global 上限在 splitAndEnrichScenes 末尾再夹一次
        const videoQuota = calcVideoQuota(scenes.length, qualityMode);
        let videoAssigned = 0;
        const result = scenes.map((s) => {
            const enriched = byIndex.get(s.index);
            let keywords = Array.isArray(enriched?.searchKeywords)
                ? enriched.searchKeywords
                    .map((k) => String(k).trim())
                    .filter(Boolean)
                    .slice(0, 5)
                : [];
            // LLM 不听话兜底：中国语境必须有 chinese/asian/china
            if (effective === 'chinese' && keywords.length > 0) {
                const hasLocale = keywords.some((k) => /\b(chinese|asian|china)\b/i.test(k));
                if (!hasLocale)
                    keywords = ['chinese ' + keywords[0], ...keywords.slice(1)];
            }
            // 中文关键词：给前端展示用
            let keywordsCN = Array.isArray(enriched?.searchKeywordsCN)
                ? enriched.searchKeywordsCN
                    .map((k) => String(k).trim())
                    .filter(Boolean)
                    .filter((k) => /[\u4e00-\u9fff]/.test(k)) // 必须含中文字符，过滤掉 LLM 漏返的英文
                    .slice(0, 3)
                : [];
            if (keywordsCN.length === 0) {
                // LLM 没给，从 text 里抽名词兜底
                keywordsCN = extractFallbackKeywordsCN(s.text);
            }
            // 画面生成模式：先取 LLM 的，再按配额/档位兜底
            let mode = ['library', 'ai-image', 'ai-video', 'data-viz'].includes(enriched?.generationMode)
                ? enriched.generationMode
                : inferModeFallback(s.text, effective, qualityMode);
            // ── 导演分析强制覆盖 ──
            // keyMoments: 强制 ai-video（跳过配额判断）
            if (directorResult?.keyMoments?.some((km) => km.sceneIndex === s.index)) {
                mode = 'ai-video';
            }
            // dataScenes: 强制 data-viz + 注入 dataVizConfig
            const directorDataScene = directorResult?.dataScenes?.find((ds) => ds.sceneIndex === s.index);
            if (directorDataScene) {
                mode = 'data-viz';
            }
            // 强制约束：budget 档位不允许 ai-video
            if (qualityMode === 'budget' && mode === 'ai-video')
                mode = 'ai-image';
            // ─── 时长硬规则（覆盖 LLM 判断）──────────────────────────────
            // AI 视频模型在不同时长上效果差异巨大，必须按真实时长选最合适的类型：
            //   <3s     → 强制图（视频前 1s 在建立场景，3s 内根本看不到精彩动作，硬上视频反而糟）
            //   3-12s   → 视频（模型训练目标区间，效果最好）
            //   >12s   → mixed（前 8s 视频 + 后 N s 图，Ken Burns 撑场，比纯图有动感、比视频拼接自然）
            const dur = s.estDuration;
            if (mode === 'ai-video' || mode === 'mixed-video-image') {
                if (dur < 3) {
                    mode = 'ai-image'; // 短分镜不浪费视频钱
                }
                else if (dur > 12) {
                    mode = 'mixed-video-image'; // 长分镜 = 视频+图组合
                }
                // 3-12s 保持 ai-video 不变
            }
            // ai-video 配额限制（导演标记的 keyMoments 不受配额限制）
            const isKeyMoment = directorResult?.keyMoments?.some((km) => km.sceneIndex === s.index);
            if (mode === 'ai-video' || mode === 'mixed-video-image') {
                if (!isKeyMoment && videoAssigned >= videoQuota) {
                    // 配额用完，降级：mixed → image（视频部分降级为整图），ai-video → image
                    mode = 'ai-image';
                }
                else {
                    videoAssigned++;
                }
            }
            // 【核心硬规则】library 模式但文本含"人物/动作/情绪"信号 → 强制升级 ai-image
            // 原因：Pexels 对中国人物/场景库存严重不足，硬搜只会拿到不相关素材。
            // 2026 策略：AI 优先，不再区分 budget，任何含人物/动作的分镜一律 ai-image。
            if (mode === 'library' && hasHumanSignals(s.text)) {
                mode = 'ai-image';
            }
            // 提取 LLM 返回的原始字段(后续用来判定字段完整性)
            const rawVideoCN = String(enriched?.videoPromptCN || enriched?.videoPrompt || '').trim();
            const rawImageCN = String(enriched?.aiImagePromptCN || '').trim();
            const rawEmotion = String(enriched?.emotion || '').trim();
            const rawShotType = String(enriched?.shotType || '').trim();
            // 字段完整性综合校验(LLM 可能只填了部分字段):
            // - 两个 prompt 都空 → 肯定 retry
            // - 搜索关键词空 → retry 补
            // - emotion / shotType 都没填(LLM 漏字段,不是真的选了默认值) → retry 补
            const promptEmpty = !rawVideoCN && !rawImageCN;
            const keywordsEmpty = keywords.length === 0;
            const metaEmpty = !rawEmotion && !rawShotType;
            const needsManualPrompt = promptEmpty || keywordsEmpty || metaEmpty;
            // 按分镜 emotion 选风格后缀（白名单兜底 calm），保持基础词一致只在色调/对比度/构图上变化
            // 后缀来自 visualStyle.emotionVariants（用户在前端选择的"画面风格预设"），
            // 不传 visualStyle 时退化为 DEFAULT_VISUAL_STYLE = 电影写实（与原 EMOTION_STYLE_SUFFIX 完全一致）
            const styleSuffix = (0, visual_styles_1.getEmotionSuffix)(visualStyle, rawEmotion);
            // fixedSuffix：每套风格自带的"招牌句"（如"，1:24微缩模型质感"、"，全息数据面板，8K超清"），
            // 拼在 emotionSuffix 之后，钉死整支视频的视觉调性，避免前后镜头风格漂移。
            // ⚠️ ai-image / ai-video 都必须追加：LLM 现在按"四段式（不写风格）"出 prompt，
            //    风格段统一由这里追加；如果 ai-video 不追加，AI 视频会拿到无风格指令，画面失控。
            const styleTail = styleSuffix + visualStyle.fixedSuffix;
            // CN prompt 互补兜底: videoPromptCN 空就用 aiImagePromptCN,反之亦然
            const videoPromptCN = (rawVideoCN || rawImageCN || s.text) + styleTail;
            const aiImagePromptCN = (rawImageCN || rawVideoCN || s.text) + styleTail;
            // EN 字段不再要求 LLM 填(Kolors/智谱都吃中文),静默回退为 CN
            // 保留字段是为了向后兼容 one-click.ts 里旧的消费逻辑
            const videoPromptEN = String(enriched?.videoPromptEN || '').trim() || videoPromptCN;
            const aiImagePromptEN = String(enriched?.aiImagePromptEN || '').trim() || aiImagePromptCN;
            // data-viz 模式 → 拆成正交标记:mode='ai-image' + isDataScene=true
            //
            // 原因(2026-05 重构):
            //   - 旧设计 data-viz 是独立 mode,前端 toggle 只看 ai-image/ai-video → data-viz 没切换器
            //   - 用户期望:数据图也能选"图/视频"(数据图视频 = 数字飞入/图表动画风格)
            //   - 新设计:isDataScene 独立标记,跟 image/video 选择正交
            //     image + isDataScene=true  → 信息图风格 AI 图(prompt 已写好数据可视化描述)
            //     video + isDataScene=true  → 信息图风格 AI 视频(同 prompt,出视频版)
            //     用户切 toggle 不动 isDataScene,数据图风格保留
            //
            // dataVizConfig 仍然保留(用户如果手动改回 mode='data-viz' 或 one-click.ts 老路径仍可用)
            const dataVizFlag = mode === 'data-viz';
            const finalMode = dataVizFlag ? 'ai-image' : mode;
            return {
                index: s.index,
                text: s.text,
                estDuration: s.estDuration,
                videoPromptCN,
                videoPromptEN,
                aiImagePromptCN,
                aiImagePromptEN,
                // 负向 prompt：跟随选定风格落到每个 scene 上，generateImage 直接消费
                negativePrompt: visualStyle.negativePrompt,
                searchKeywords: keywords,
                searchKeywordsCN: keywordsCN,
                emotion: (['excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous'].includes(rawEmotion)
                    ? rawEmotion
                    : 'calm'),
                shotType: ['close-up', 'medium', 'wide', 'pov', 'aerial'].includes(rawShotType)
                    ? rawShotType
                    : 'medium',
                generationMode: finalMode,
                generationReason: String(enriched?.generationReason || '').trim() || undefined,
                needsManualPrompt,
                ...(dataVizFlag ? {
                    isDataScene: true,
                    dataVizConfig: directorDataScene
                        ? { vizType: directorDataScene.vizType, numbers: directorDataScene.numbers, label: directorDataScene.label, subtitle: directorDataScene.subtitle, labels: directorDataScene.labels }
                        : parseDataVizConfig(s.text),
                } : {}),
            };
        });
        // 第二轮：对批量阶段没拿到 prompt 的分镜单独再问 LLM 一次（更聚焦、单条出 JSON）
        // 传入剩余 videoQuota,让 retry 也能重新评估 generationMode 并合理升级到 ai-video
        await retryEmptyPrompts(result, effective, qualityMode, videoQuota, videoAssigned, visualStyle);
        // 详细的 mode 分布 + 时长分布（便于观察 mixed 是否命中）
        {
            const modeDist = {};
            let dur12plus = 0;
            let dur3to12 = 0;
            let durLt3 = 0;
            for (const s of result) {
                const m = s.generationMode || 'library';
                modeDist[m] = (modeDist[m] || 0) + 1;
                if (s.estDuration > 12)
                    dur12plus++;
                else if (s.estDuration >= 3)
                    dur3to12++;
                else
                    durLt3++;
            }
            const distStr = Object.entries(modeDist)
                .map(([k, v]) => `${k}=${v}`)
                .join(' ');
            logger_1.logger.info(`[SceneEnrich] mode分布: ${distStr} | 时长分布: <3s=${durLt3} 3-12s=${dur3to12} >12s=${dur12plus}`);
        }
        return result;
    }
    catch (err) {
        logger_1.logger.warn('[SceneEnrich] LLM 失败，使用兜底: ' + String(err));
        // 兜底：用原 text 做 prompt，用 text 里的英文/数字做 keywords
        return scenes.map((s) => {
            const fallbackMode = inferModeFallback(s.text, effective, qualityMode);
            // 兜底也要拼上 fixedSuffix——LLM 全挂时至少图还能贴风格
            const fallbackImageCN = s.text + (0, visual_styles_1.getEmotionSuffix)(visualStyle, 'calm') + visualStyle.fixedSuffix;
            // data-viz → ai-image + isDataScene=true(跟主路径一致,见上面注释)
            const dataVizFlag = fallbackMode === 'data-viz';
            const finalMode = dataVizFlag ? 'ai-image' : fallbackMode;
            return {
                index: s.index,
                text: s.text,
                estDuration: s.estDuration,
                videoPromptCN: s.text,
                videoPromptEN: s.text,
                aiImagePromptCN: fallbackImageCN,
                aiImagePromptEN: fallbackImageCN,
                negativePrompt: visualStyle.negativePrompt,
                searchKeywords: extractFallbackKeywords(s.text),
                searchKeywordsCN: extractFallbackKeywordsCN(s.text),
                emotion: 'calm',
                shotType: 'medium',
                generationMode: finalMode,
                generationReason: '兜底判定',
                needsManualPrompt: true,
                ...(dataVizFlag ? {
                    isDataScene: true,
                    dataVizConfig: parseDataVizConfig(s.text),
                } : {}),
            };
        });
    }
}
/**
 * 第二轮兜底：批量拆分镜时如果某些场景的 prompt 没出来（LLM 偷懒/字段缺失），
 * 单独再调 LLM 一次给这条补上。单条 prompt 焦点窄、JSON 结构简单，成功率高很多。
 *
 * ⚠️ 这个 retry 同时也负责"内容驱动 generationMode 判定":Stage1 批量失败时给的
 * generationMode 是 LLM 摆烂默认值,通常都是 ai-image。retry 会重新评估这条分镜
 * 的动态性、按需升级到 ai-video(在剩余 quota 内)。这样第二批"内容驱动 ai-video"
 * 的策略在 Stage2 也能生效,不会被 Stage1 锁死。
 *
 * 失败时保持 needsManualPrompt=true，前端会显示警告提示用户手动编辑。
 *
 * 并发控制：最多 3 个同时跑，避免触发 LLM 限流。
 */
async function retryEmptyPrompts(result, effective, _qualityMode, videoQuota, alreadyAssignedInStage1, visualStyle = visual_styles_1.DEFAULT_VISUAL_STYLE) {
    const targets = result.filter((s) => s.needsManualPrompt);
    if (targets.length === 0)
        return;
    // 剩余 ai-video 配额(跨协程共享,每成功升级一个 ai-video 就扣 1)
    let videoRemaining = Math.max(0, videoQuota - alreadyAssignedInStage1);
    logger_1.logger.info(`[SceneEnrich] 第二轮重试 ${targets.length} 个空 prompt 分镜(ai-video quota 剩 ${videoRemaining}/${videoQuota})`);
    const localeRule = effective === 'chinese'
        ? '本文案是中国语境，画面里的人物必须是亚裔面孔，场景含中式元素（汉字招牌/中式建筑/中国街景等）。\n'
        : '';
    const CONCURRENCY = 3;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (scene) => {
            const allowVideo = videoRemaining > 0;
            const prompt = `你是短视频导演。下面是一条口播文本,给我生成它对应的**画面 prompt**(用于 AI 生图/生视频)。

${localeRule}**口播文本**：
${scene.text}

## 第一步:判定 generationMode (ai-image vs ai-video)

**ai-video**(¥0.5/次,贵) ←仅当**静态截图无法表达**才用。必须至少含下列一项:
- 动作连续: 跑/摔/打/笑→哭/快速切换/翻动/滑动
- 状态变化: 数据爆炸增长/扩散蔓延/扭曲变形/翻倍/"从 X 到 Y"
- 快速节奏: "闪过""跳出""切换""掠过""涌现"
- 过程性: "下载完成""加载""一步步"

**ai-image**(¥0.04/张,便宜) ←默认:静态画面、人物表情、构图、信息图、概念隐喻图。

${allowVideo
                ? `✅ 当前还有 ${videoRemaining} 个 ai-video 配额,如这条确实含动态信号就选 ai-video。`
                : `⚠️ ai-video 配额已用完,这条必须设为 ai-image,用构图/视觉隐喻表达即可。`}

## 第二步:写 prompt

**铁律**:
1. **不要 echo 原文**,把口播"翻译"成画面元素
2. **必须含原文核心物件/动作**,禁止套"亚裔+中式+某种光影"万能模板:
   - "看短剧""刷视频" → 画"手机 + 屏幕里短剧画面"
   - 具体数字(200+/17亿/Top 5000) → 必须画出那个数字(信息图/屏幕/图表)
   - 名人(马斯克/雷军) → 直接画那人 + 社交媒体界面
   - 抽象金句("工具决定下限") → 视觉隐喻(工具图标+分层结构)
3. **五段式**: 镜头类型 + 主体(年龄/族裔/衣着) + 动作 + 环境 + 风格
4. 中文 40-70 字,英文同义
5. 数据类分镜用**信息图**,不要硬画真人

## 输出(严格 JSON,不要任何解释)

\`\`\`json
{
  "generationMode": "${allowVideo ? 'ai-image | ai-video' : 'ai-image'}",
  "videoPromptCN": "...",
  "aiImagePromptCN": "...",
  "searchKeywords": ["3-5 个英文词组,中国元素加 chinese/asian", "..."],
  "emotion": "excited | serious | cheerful | dramatic | calm | humorous",
  "shotType": "close-up | medium | wide | pov | aerial"
}
\`\`\``;
            try {
                const fixed = await llm_1.llm.completeJSONWithScene('one_click_split', '短视频画面 prompt 工程师', prompt);
                // 互补取用(任一不空即可):两个 prompt 字段互相回退
                const rawVideoCN = String(fixed?.videoPromptCN || '').trim();
                const rawImageCN = String(fixed?.aiImagePromptCN || '').trim();
                const cn = rawImageCN || rawVideoCN;
                const vcn = rawVideoCN || rawImageCN;
                // generationMode 升级: LLM 在 retry 里可能把这条判为 ai-video
                // 仅当 (1) LLM 说 ai-video (2) 还有配额 两者都满足时才升级,否则保留原值
                let modeUpdated = '';
                const llmMode = String(fixed?.generationMode || '').trim();
                if (llmMode === 'ai-video' && allowVideo && videoRemaining > 0) {
                    scene.generationMode = 'ai-video';
                    videoRemaining--; // 消耗一个配额
                    modeUpdated = ' → ai-video';
                }
                else if (llmMode === 'ai-image' &&
                    scene.generationMode !== 'ai-image' &&
                    scene.generationMode !== 'ai-video' // 不要把已升级的 ai-video 降回去
                ) {
                    scene.generationMode = 'ai-image';
                    modeUpdated = ' → ai-image';
                }
                // 时长硬规则补丁（与 enrichScenes 一致）：
                //   <3s 强制图；>12s 视频升级为 mixed-video-image
                // retry 路径以前漏了这步，导致长分镜 ai-video 不会变 mixed
                if (scene.generationMode === 'ai-video' || scene.generationMode === 'mixed-video-image') {
                    if (scene.estDuration < 3) {
                        scene.generationMode = 'ai-image';
                        modeUpdated += ' (短分镜→图)';
                    }
                    else if (scene.estDuration > 12) {
                        if (scene.generationMode !== 'mixed-video-image') {
                            scene.generationMode = 'mixed-video-image';
                            modeUpdated += ' (>12s→mixed)';
                        }
                    }
                }
                if (cn) {
                    // retry 路径也要补 emotion 风格后缀（之前漏了，导致 retry 出来的图丢风格）
                    // 优先用本次 retry 返回的 emotion，没有就用 scene 已有的，再没有就 calm
                    const retryEmoRaw = String(fixed?.emotion || '').trim();
                    const retryEmoKey = VALID_EMOTIONS.includes(retryEmoRaw)
                        ? retryEmoRaw
                        : (scene.emotion || 'calm');
                    const retrySuffix = (0, visual_styles_1.getEmotionSuffix)(visualStyle, retryEmoKey);
                    // fixedSuffix：retry 路径也要拼上风格招牌句，跟主路径保持一致
                    const finalImageCN = cn + retrySuffix + visualStyle.fixedSuffix;
                    scene.videoPromptCN = vcn;
                    // EN 字段不再要求 LLM 填,回退为 CN
                    scene.videoPromptEN = vcn;
                    scene.aiImagePromptCN = finalImageCN;
                    scene.aiImagePromptEN = finalImageCN;
                    // 负向 prompt 跟随风格落到 scene
                    scene.negativePrompt = visualStyle.negativePrompt;
                    // 顺带回填 searchKeywords(LLM retry 时也会返回)
                    const kwRaw = Array.isArray(fixed?.searchKeywords)
                        ? fixed.searchKeywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 5)
                        : [];
                    if (kwRaw.length > 0) {
                        scene.searchKeywords = kwRaw;
                    }
                    else if (!scene.searchKeywords || scene.searchKeywords.length === 0) {
                        // 实在没有,用本地兜底
                        scene.searchKeywords = extractFallbackKeywords(scene.text);
                    }
                    // 回填 emotion / shotType(仅当 LLM 返回了有效值才覆盖)
                    const emo = String(fixed?.emotion || '').trim();
                    if (['excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous'].includes(emo)) {
                        scene.emotion = emo;
                    }
                    const st = String(fixed?.shotType || '').trim();
                    if (['close-up', 'medium', 'wide', 'pov', 'aerial'].includes(st)) {
                        scene.shotType = st;
                    }
                    scene.needsManualPrompt = false;
                    logger_1.logger.info(`[SceneEnrich] 重试成功 #${scene.index}${modeUpdated}: ${cn.slice(0, 40)}...`);
                }
                else {
                    logger_1.logger.warn(`[SceneEnrich] 重试 #${scene.index} LLM 返回结构仍异常，保留警告`);
                }
            }
            catch (err) {
                logger_1.logger.warn(`[SceneEnrich] 重试 #${scene.index} 失败: ${String(err).slice(0, 100)}`);
                // 保持 needsManualPrompt=true，让前端警告
            }
        }));
    }
}
/**
 * 构建角色锚点文本，嵌入 prompt 让 LLM 保持角色外貌一致性
 */
function buildCharacterAnchor(directorResult) {
    if (!directorResult?.characters?.length)
        return '\n';
    const lines = directorResult.characters.map((ch) => `- **${ch.role}**（${ch.id}）：${ch.visualDesc}（出现在分镜 ${ch.sceneIndices.join(', ')}）`);
    return `\n## 🎭 角色档案（同一角色必须外貌一致）\n${lines.join('\n')}\n\n**重要**：上述角色在不同分镜出现时，prompt 里的年龄/族裔/衣着/发型描述必须完全一致，直接复用上面的 visualDesc。\n`;
}
/**
 * LLM 不可用 / 不听话时的本地启发式：仅靠文案文本和语境猜 mode
 *
 * 2026 策略：AI 优先。默认 ai-image，只有"纯抽象/纯空镜"才 library。
 *   1. 含人物/动作/情绪 → ai-image
 *   2. 纯抽象观点词（"方法论 / 原理"）+ 无人物动作 → library
 *   3. 其他一律 ai-image
 */
function inferModeFallback(text, _locale, quality) {
    // 数据场景检测：只有同时满足"大数字（万/亿或>=100）"+ "明确的对比/增长语境"才算数据场景
    const BIG_NUM = /\d[\d,.]*\s*(万|亿)|[1-9]\d{2,}/;
    const COMPARE = /(→|➜|vs|降到|降为|增长|增加|翻了|倍|从.+到|仅|只有)/;
    if (BIG_NUM.test(text) && COMPARE.test(text))
        return 'data-viz';
    // 纯抽象/纯空镜词（偏向 library）
    const abstractWords = /(方法|原理|逻辑|本质|概念|理论|规律|策略|观点|定义|分析|城市夜景|天空|云朵|森林|海浪|雪花|落叶|几何|图形)/;
    const hasPerson = PERSON_WORDS.test(text);
    const hasAction = ACTION_WORDS.test(text) || EMOTION_WORDS.test(text);
    const isPureAbstract = abstractWords.test(text) && !hasPerson && !hasAction;
    // budget / balanced / premium 都遵循相同策略：AI 优先，只有"纯抽象且无人物动作"才 library
    if (isPureAbstract)
        return 'library';
    // 其他任何情况都走 AI 图（有人物/有动作/有情绪/有场景描述）
    // budget 档位也走 ai-image：¥0.04/张和库搜免费的差距可以接受，换来画面相关度巨大提升
    return quality === 'premium' ? 'ai-image' : 'ai-image';
}
/**
 * 从分镜文本中解析出数据可视化配置
 * 启发式匹配：
 *   含 "X 到/→ Y" → growth-bar
 *   含 "X vs Y" 或 "从 X 降到 Y" → cost-compare
 *   含 "X 中仅 Y" 或 "X 里有 Y" → grid-highlight
 *   单个大数字 → big-number
 */
function parseDataVizConfig(text) {
    // 提取所有数字（含单位）
    const numMatches = text.match(/(\d[\d,.]*\s*(万|亿|元|部|个|倍|%|块)?)/g) || [];
    const numbers = numMatches.map((m) => m.trim()).slice(0, 4);
    // 模式 1："X 中仅 Y" / "X 里只有 Y"
    if (/[\d,.]+\s*(部|个).*(仅|只有|只|才)\s*[\d,.]+/i.test(text)) {
        return { vizType: 'grid-highlight', numbers, label: text.slice(0, 30) };
    }
    // 模式 2：成本对比 "从 X 降到/变成 Y" / "X vs Y"
    if (/(降到|降为|变成|变为|vs)/i.test(text) && numbers.length >= 2) {
        return { vizType: 'cost-compare', numbers, label: text.slice(0, 30) };
    }
    // 模式 3：增长 "X 到/→ Y" / "从 X 到 Y"
    if (/(到|→|➜|增长|增加|翻了|涨到)/i.test(text) && numbers.length >= 2) {
        return { vizType: 'growth-bar', numbers, label: text.slice(0, 30) };
    }
    // 默认：大数字
    return { vizType: 'big-number', numbers: numbers.length > 0 ? numbers : ['0'], label: text.slice(0, 30) };
}
/** 从分镜文本抽取 2-3 个中文关键词（LLM 没返回中文关键词时兜底）*/
function extractFallbackKeywordsCN(text) {
    const out = [];
    // 常见具象词库：命中就放进来
    const CONCRETE_WORDS = [
        '咖啡', '咖啡馆', '茶馆', '办公室', '电脑', '手机', '地铁', '公交', '街道', '城市', '夜晚', '清晨',
        '家里', '厨房', '卧室', '客厅', '餐厅', '商场', '店铺', '校园', '教室', '图书馆', '医院',
        '公园', '湖边', '海边', '山里', '森林', '田野',
        '程序员', '外卖员', '打工人', '宝妈', '学生', '老师', '医生', '女孩', '男孩', '年轻女性',
        '年轻男性', '中年人', '老人',
        '汉服', '旗袍', '西装', '工装', '制服',
        '哭', '笑', '奔跑', '站立', '坐着', '躺着', '凝视',
    ];
    for (const w of CONCRETE_WORDS) {
        if (text.includes(w)) {
            out.push(w);
            if (out.length >= 3)
                break;
        }
    }
    if (out.length > 0)
        return out;
    // 还没命中 → 从文本里截前 2-3 个 2-4 字中文名词（粗糙分词）
    const chineseChunks = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    return chineseChunks.slice(0, 3);
}
/**
 * 把原文改写成"口语版"，让 TTS 朗读自然。
 *
 * 解决书面文本被 TTS 念出的尴尬：括号附注、缩写、日期数字格式、专业符号等。
 * 改写后总长度尽量保持 ±10%，避免影响后续分镜节奏估算。
 *
 * 失败时 fallback 到原文（不阻塞主流程）。
 */
async function convertToSpokenScript(originalText) {
    const cleaned = originalText.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 20)
        return cleaned; // 太短不值得调 LLM
    const prompt = `你是短视频口播文案校对编辑。给你一段原始文案，把它改写成"自然口语版"，让 TTS 朗读时听起来像真人说话。

## 改写规则

1. **保持意思和长度**：观点全部保留；总字数尽量接近原文（±10%）
2. **去附注/括号**：括号、引用、星号注释里的"补充说明"，要么自然融入正文，要么删掉
3. **数字英文易读化**：
   - "Q4" → "第四季度"；"H1" → "上半年"
   - 日期 "2025-12-31" → "二零二五年十二月三十一日"
   - "AI" "GPT" "API" 这类常见英文缩写保留（按字母念）
   - 数量 "17亿" "30%" 保留（TTS 会念对）
4. **断句节奏**：长句加逗号，让 TTS 有呼吸点
5. **不加套话**：除非原文有，否则不要加"大家好""咱们""各位朋友"
6. **不改情感语气**，只调表达形式
7. **保留原文标记**（数据、引用名词、人名、产品名）

## 输出

只输出改写后的纯文本。不要解释、不要 JSON、不要 markdown 代码块、不要前后缀。

## 原文

${cleaned}`;
    try {
        const start = Date.now();
        // 用 copy_adapt（text-fast 类别）—— 1000 字改写不需要长上下文/推理模型，
        // 之前用 one_click_split (text-long → deepseek-v4-pro) 跑 143s，体感很差
        const result = await llm_1.llm.completeWithScene('copy_adapt', '短视频口播文案编辑', prompt, 0.3);
        const spoken = String(result || '').trim()
            // 防止 LLM 加 markdown 包裹
            .replace(/^```[\w]*\s*\n?|\n?```$/g, '')
            .trim();
        if (!spoken || spoken.length < cleaned.length * 0.5 || spoken.length > cleaned.length * 1.5) {
            logger_1.logger.warn(`[OneClick] 口语化结果长度异常（原 ${cleaned.length} → 改 ${spoken.length}），回滚原文`);
            return cleaned;
        }
        logger_1.logger.info(`[OneClick] 口语化完成：原 ${cleaned.length} 字 → 改 ${spoken.length} 字，耗时 ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return spoken;
    }
    catch (err) {
        logger_1.logger.warn(`[OneClick] 口语化失败，使用原文：${String(err?.message || err).slice(0, 80)}`);
        return cleaned;
    }
}
/**
 * 把所有分镜文本拼成一段完整文案，让 LLM 把整段当成连贯口播改写，
 * 然后按 [[N]] 标记切回每个分镜。
 *
 * 这才是"整篇口语化"——LLM 拿到的是一段连贯的脚本（不是 19 个孤立句子），
 * 能调整段落衔接、避免相邻分镜重复用词、维持整体语气一致。
 *
 * 失败回退原数组。返回长度严格等于输入长度。
 */
async function colloquializeSceneTexts(texts) {
    if (!texts || !texts.length)
        return [];
    const total = texts.length;
    // 用 [[N]] 标记把所有分镜拼成一段连贯文案（N 从 1 开始，方便 LLM 理解）
    const marked = texts
        .map((t, i) => `[[${i + 1}]]${(t || '').trim()}`)
        .join('');
    const totalChars = marked.replace(/\[\[\d+\]\]/g, '').length;
    const prompt = `你是短视频口播文案校对编辑。下面是一整段视频脚本，被切成了 ${total} 个分镜，每个分镜前用 [[序号]] 标记。

请把整段文案当成一个连贯的口播脚本来改写，让 TTS 朗读时听起来像真人讲话。可以微调相邻分镜的衔接感、避免重复用词、统一语气。

## 🔴 边界标记规则（违反则视为失败）
- 输入有 [[1]] [[2]] ... [[${total}]] 共 ${total} 个标记
- 输出必须 **完整保留所有 ${total} 个标记**，序号、个数、顺序都不能变
- 标记的位置 = 该分镜口播的开头；标记后面的文字才是分镜内容
- 不要在标记内部加空格、换行、标点

## 改写规则
1. **保留意思**：每个分镜的观点和事实都要保留
2. **整体长度**：整段总字数尽量接近原文（±20%，原文约 ${totalChars} 字）
3. **去附注/括号**：圆括号、引用、星号注释要么自然融入，要么删掉
4. **数字英文易读化**：
   - "Q4" → "第四季度"；"H1" → "上半年"
   - 日期 "2025-12-31" → "二零二五年十二月三十一日"
   - "AI" "GPT" "API" 这类常见缩写按字母念，保留原样
   - "17亿" "30%" 保留（TTS 会念对）
5. **短句也调**：把书面词换成口语词（"哦"可换"呢"、"等等"可换"什么的"），但不要硬塞口头禅
6. **不加套话**：除非原文有，否则不要加"大家好""咱们""各位朋友"
7. **保留专有名词**：人名、产品名、专业术语原样保留
8. **不改情感语气**

## 输入（带 [[N]] 标记的整段文案）
${marked}

## 输出
只输出改写后的整段文案（必须包含全部 ${total} 个 [[N]] 标记）。不要 markdown 代码块、不要解释、不要其他前后缀。`;
    const start = Date.now();
    try {
        const result = await llm_1.llm.completeWithScene('copy_adapt', '短视频口播文案编辑', prompt, 0.3);
        let raw = String(result || '').trim()
            // 防 markdown 包裹
            .replace(/^```[\w]*\s*\n?|\n?```$/g, '')
            .trim();
        // 截到第一个 [[ 开始（防 LLM 在开头塞"以下是..."）
        const firstMark = raw.indexOf('[[');
        if (firstMark > 0)
            raw = raw.slice(firstMark);
        // 用 [[N]] 切回每段
        // 正则：[[number]] 后面的内容，直到下一个 [[ 或文末
        const re = /\[\[(\d+)\]\]([\s\S]*?)(?=\[\[\d+\]\]|$)/g;
        const got = new Map();
        let m;
        while ((m = re.exec(raw))) {
            const n = Number(m[1]);
            const content = (m[2] || '').trim();
            if (Number.isFinite(n) && n >= 1 && n <= total && content) {
                got.set(n, content);
            }
        }
        if (got.size === 0)
            throw new Error('LLM 输出里找不到 [[N]] 标记');
        // 按原索引映射回去：缺失或长度异常的回滚原文
        const out = texts.map((orig, idx) => {
            const origTrim = (orig || '').trim();
            const next = got.get(idx + 1) || '';
            if (!next)
                return orig;
            const origLen = origTrim.length || 1;
            // 单条长度变化超过 ±70% 视为离谱（整段改写时单句波动比逐条大，放宽一点）
            if (next.length < origLen * 0.4 || next.length > origLen * 1.8)
                return orig;
            return next;
        });
        const changed = out.filter((t, i) => t !== texts[i]).length;
        const matched = got.size;
        logger_1.logger.info(`[OneClick] 整段口语化：${total} 个分镜 → LLM 返回 ${matched} 个标记，最终改动 ${changed} 条，耗时 ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return out;
    }
    catch (err) {
        logger_1.logger.warn(`[OneClick] 整段口语化失败，回滚原数组：${String(err?.message || err).slice(0, 120)}`);
        return texts.map((t) => t);
    }
}
function extractFallbackKeywords(text) {
    // 提取英文词 + 数字 + 常见具象名词映射
    const out = new Set();
    const eng = text.match(/[A-Za-z][A-Za-z0-9]{2,}/g) || [];
    eng.forEach((e) => out.add(e));
    // 常见中文场景映射（兜底级别）
    const commonMap = {
        咖啡: 'coffee cafe',
        学习: 'student studying books',
        工作: 'office working computer',
        城市: 'urban city skyline',
        自然: 'nature landscape',
        家: 'home interior',
    };
    for (const [cn, en] of Object.entries(commonMap)) {
        if (text.includes(cn))
            out.add(en);
    }
    return Array.from(out).slice(0, 5);
}
// ═══════════════════════════════════════════════════════════════════════════
// 方案 C（v2）：两步 + 批处理 —— 专治长文 LLM 输出爆量超时
// ═══════════════════════════════════════════════════════════════════════════
//
// 为什么两步：
//   一步式"切+补"对长文必然超时——64 个分镜 × 每段 400 字 JSON = 25K 字输出，
//   DeepSeek 稳定输出上限 ~15K 字。
//
// 两步架构：
//   Stage 1: `splitScriptOnlyLLM` —— LLM 只切，返回 [{text}]。输出仅 ~1-2K 字，5 秒搞定。
//   Stage 2: `enrichScenes` 分批（每批 15 个）**并行**调用 LLM 补画面。
//            64 个分镜 → 5 批并行 × 每批 ~6K 字输出 → 总耗时 ≈ 单批时间 ≈ 40-60 秒。
//
// 核心约束（防止 LLM 胡编）：
//   1. Stage 1 每个分镜的 text 必须是原文连续子串
//   2. 拼接覆盖原文 >= 80%
//   3. 违反约束或任何失败 → 调用方降级到 splitByPunctuation + enrichScenes（分批）
/**
 * Stage 1：LLM 只切分镜，不补画面信息。输出量小，对长文稳定。
 */
async function splitScriptOnlyLLM(cleanText, targetSceneCount, estDurationSec, secPerScene = 4, onProgress, 
/** 可选：强制走指定 provider+model（用于"主模型超时降级 cheap 档"兜底） */
forceModel) {
    // 中文：1 字 ≈ 0.25 秒 → secPerScene=4 → 16字, secPerScene=5 → 20字, secPerScene=6 → 24字
    const idealChars = Math.round(secPerScene / 0.25);
    // 字数/时长上限：
    //   budget/balanced 用 1.5x（紧凑节奏，≤6-7s/段）
    //   premium 用 2.5x（≤15s/段，给 LLM 自由切出 12s+ 长分镜，让 mixed-video-image 自然命中）
    const upperMul = secPerScene >= 6 ? 2.5 : 1.5;
    const minChars = Math.max(8, Math.round(idealChars * 0.6));
    const maxChars = Math.round(idealChars * upperMul);
    const minSec = Math.max(2, Math.round(secPerScene * 0.6));
    const maxSec = Math.round(secPerScene * upperMul);
    const prompt = `你是资深短视频导演。给你一段中文文案，请按视觉节奏切成 **约 ${targetSceneCount} 个分镜**（允许 ±20%）。

## 文案预估
- 全长 ${cleanText.length} 字
- TTS 播放约 ${estDurationSec.toFixed(0)} 秒
- 按每镜 ${minSec}-${maxSec} 秒节奏需要 ~${targetSceneCount} 个分镜

## 切分原则
1. text 必须是原文**连续子串**（不改字、不增减）
2. 所有 text 按顺序拼接应完整覆盖原文
3. 主体变/场景变/情绪节拍变 → 切
4. 列举结构（"A、B、C"）每项一镜
5. 意识流/连续动作 → 不切，一个长镜头
6. 每段 ${minChars}-${maxChars} 字（${minSec}-${maxSec} 秒 TTS）；< 6 字合并相邻；> ${Math.round(maxChars * 1.4)} 字再切

## 输出

只输出 JSON 数组，每个元素只有 text 字段：
[
  {"text": "第一段原文子串"},
  {"text": "第二段原文子串"},
  ...
]

## 原文

${cleanText}`;
    const onChunk = onProgress
        ? (ck) => {
            if (!ck.isFinished && ck.content)
                onProgress(ck.content);
        }
        : undefined;
    // Stage1 切分镜：长文案 ≥3000 字时切 100+ 段，输出 JSON 接近 5000 tokens
    // 中文 token 比英文耗（~1.5x），4096 在边缘，提到 8192 留余量
    // 大输出：默认 180s 不够，提到 360s 避免 6 次重试全部超时
    const raw = forceModel
        ? await llm_1.llm.completeJSONWithSceneStreamForceModel(forceModel.provider, forceModel.model, '短视频导演', prompt, onChunk, 8192, 360_000)
        : await llm_1.llm.completeJSONWithSceneStream('one_click_split', '短视频导演', prompt, onChunk, 8192, 360_000);
    let arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0)
        throw new Error('Stage1 LLM 切分返回空数组');
    // 校验每个 text 都在原文中（模糊匹配:容许 V4-Pro 少量改字/加引号/断句微调）
    // 严格 includes 实战不可用 — V4-Pro 切分时常把中英文引号互换、破折号换省略号、
    // 补/删一个语气助词,语义不变但 includes 100% 失败。
    // 改成 85% 字符吻合即通过,真正"编造内容"的段落匹配率远低于 85%,仍挡得住。
    const norm = (s) => s.replace(/[\s\u3000，。！？、；：""''‘’"'《》〈〉【】（）()\[\]{}—\-…·～~]/g, '');
    const normCleanText = norm(cleanText);
    /** 在 haystack 中找到与 needle 最相似的子串,返回相似度 0-1 */
    function fuzzyMatch(needle, haystack) {
        if (!needle)
            return 0;
        if (haystack.includes(needle))
            return 1; // 完全匹配快速路径
        const len = needle.length;
        let bestRatio = 0;
        // 窗口大小在 needle 长度的 0.8~1.2 倍之间搜索
        for (let winSize = Math.floor(len * 0.8); winSize <= Math.ceil(len * 1.2); winSize++) {
            if (winSize > haystack.length)
                break;
            for (let i = 0; i <= haystack.length - winSize; i++) {
                const window = haystack.slice(i, i + winSize);
                let matches = 0;
                const shorter = Math.min(needle.length, window.length);
                for (let j = 0; j < shorter; j++) {
                    if (needle[j] === window[j])
                        matches++;
                }
                const ratio = matches / Math.max(needle.length, window.length);
                if (ratio > bestRatio)
                    bestRatio = ratio;
                if (bestRatio >= 0.95)
                    return bestRatio; // 提前退出
            }
        }
        return bestRatio;
    }
    const FIDELITY_THRESHOLD = 0.85; // 85% 字符吻合即通过
    const rejected = [];
    const passed = [];
    for (const item of arr) {
        const t = String(item?.text || '').trim();
        const nt = norm(t);
        if (!nt) {
            rejected.push(`"(空)"`);
            continue;
        }
        const sim = fuzzyMatch(nt, normCleanText);
        if (sim < FIDELITY_THRESHOLD) {
            rejected.push(`"${t.slice(0, 20)}..."(${(sim * 100).toFixed(0)}%)`);
        }
        else {
            passed.push(item);
        }
    }
    if (rejected.length > arr.length * 0.3) {
        // 超过 30% 段都对不上才降级标点切
        throw new Error(`Stage1 ${rejected.length}/${arr.length} 段不在原文：${rejected.slice(0, 3).join(', ')}`);
    }
    if (rejected.length > 0) {
        // 少量不匹配的段直接丢弃,下游用相邻段覆盖(TTS 音频连续)
        logger_1.logger.warn(`[SplitAndEnrich] Stage1 模糊校验: ${rejected.length}/${arr.length} 段相似度不足,已忽略`);
        arr = passed;
    }
    // 覆盖度校验（按去标点字符算，避免 LLM 砍标点导致的虚假覆盖率不足）
    const totalCoveredNorm = arr.reduce((acc, item) => acc + norm(String(item?.text || '').trim()).length, 0);
    const coverage = totalCoveredNorm / Math.max(1, normCleanText.length);
    if (coverage < 0.8) {
        throw new Error(`Stage1 覆盖率仅 ${(coverage * 100).toFixed(0)}%`);
    }
    // 估算时长
    return arr.map((item) => {
        const text = String(item.text).trim();
        const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const en = (text.replace(/[\u4e00-\u9fff]/g, '').match(/[A-Za-z0-9]+/g) || []).length;
        return { text, estDuration: Math.max(2, cn * 0.25 + en * 0.35) };
    });
}
/**
 * 合并过短分镜：将中文字数 < minChars 的段合并到后一段（最后一段则合并到前一段）
 */
function mergeShortScenes(scenes, minChars) {
    if (scenes.length <= 1)
        return scenes;
    const result = [];
    for (let i = 0; i < scenes.length; i++) {
        const cn = (scenes[i].text.match(/[\u4e00-\u9fff]/g) || []).length;
        if (cn < minChars && result.length > 0) {
            // 合并到前一段
            const prev = result[result.length - 1];
            prev.text = prev.text + scenes[i].text;
            prev.estDuration = prev.estDuration + scenes[i].estDuration;
        }
        else if (cn < minChars && i + 1 < scenes.length) {
            // 第一段就很短，合并到后一段
            scenes[i + 1] = {
                text: scenes[i].text + scenes[i + 1].text,
                estDuration: scenes[i].estDuration + scenes[i + 1].estDuration,
            };
        }
        else {
            result.push({ text: scenes[i].text, estDuration: scenes[i].estDuration });
        }
    }
    return result;
}
/**
 * Stage 2：把分好的分镜分批（每批 15 个）并行调 enrichScenes。
 * 批数多时 LLM 输出量可控，不超时。
 *
 * onProgress(可选):每批完成时发 __STAGE__|✏️ 补充画面描述 X/Y 批|pct,
 *   让 SSE 路由 sendProgress 出去,前端能看到 1/5 → 2/5 → ... → 5/5 推进。
 *   pct 区间约定 0.70 → 0.90(给"完成"事件留 5%)。
 */
async function enrichScenesBatched(scenes, topic, template, styleHint, qualityMode, batchSize = 8, directorResult, visualStyle = visual_styles_1.DEFAULT_VISUAL_STYLE, onProgress) {
    if (scenes.length <= batchSize) {
        // 单批走 enrichScenes,前端从 65%(Stage1 完成)直接跳到 95%(主流程完成事件)
        return enrichScenes(scenes, topic, template, styleHint, qualityMode, undefined, directorResult, visualStyle);
    }
    // 分批
    const batches = [];
    for (let i = 0; i < scenes.length; i += batchSize) {
        batches.push(scenes.slice(i, i + batchSize));
    }
    const totalBatches = batches.length;
    logger_1.logger.info(`[SplitAndEnrich] ${scenes.length} 个分镜分 ${totalBatches} 批并行补画面`);
    if (onProgress) {
        onProgress(`__STAGE__|✏️ 补充画面描述 0/${totalBatches} 批(并行启动)|0.70`);
    }
    // 并行补画面（每批独立调 LLM）— 每批完成时累加 counter,推 progress
    // 不把 onProgress 透传给 enrichScenes 内部:并行场景下多批 token chunks 会乱套,
    // 这里只在"批完成"这一粒度发,前端看到的是 1/5 → 2/5 这种推进
    let done = 0;
    const enrichedBatches = await Promise.all(batches.map(async (batch) => {
        const r = await enrichScenes(batch, topic, template, styleHint, qualityMode, undefined, directorResult, visualStyle);
        done++;
        if (onProgress) {
            // 70% → 90%(20% 区间均分给批次)
            const pct = 0.70 + 0.20 * (done / totalBatches);
            onProgress(`__STAGE__|✏️ 补充画面描述 ${done}/${totalBatches} 批|${pct.toFixed(2)}`);
        }
        return r;
    }));
    // 合并
    const merged = enrichedBatches.flat();
    // 重新分配 index（合并后是连续的 1..N）
    merged.forEach((s, i) => { s.index = i + 1; });
    // ai-video / mixed 全局配额（每批独立跑可能都分了几个，合并后要收敛到总配额内）
    // 按合并后的总分镜数比例算（详见 calcVideoQuota）
    // mixed 也算 video 配额（因为它含视频部分）
    const videoQuota = calcVideoQuota(merged.length, qualityMode);
    let videoSeen = 0;
    for (const s of merged) {
        if (s.generationMode === 'ai-video' || s.generationMode === 'mixed-video-image') {
            if (videoSeen >= videoQuota)
                s.generationMode = 'ai-image';
            else
                videoSeen++;
        }
    }
    // 详细的 mode 分布 + 时长统计（便于观察 mixed 是否命中）
    const modeDist = {};
    let dur12plus = 0;
    let dur3to12 = 0;
    let durLt3 = 0;
    for (const s of merged) {
        const m = s.generationMode || 'library';
        modeDist[m] = (modeDist[m] || 0) + 1;
        if (s.estDuration > 12)
            dur12plus++;
        else if (s.estDuration >= 3)
            dur3to12++;
        else
            durLt3++;
    }
    const distStr = Object.entries(modeDist)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
    logger_1.logger.info(`[SceneEnrich] 合并 ${merged.length} 分镜,ai-video/mixed 实际使用 ${videoSeen}/${videoQuota}`);
    logger_1.logger.info(`[SceneEnrich] mode分布: ${distStr} | 时长分布: <3s=${durLt3} 3-12s=${dur3to12} >12s=${dur12plus}`);
    return merged;
}
/**
 * 对外：一次性切分镜 + 生成画面元信息（两步实现）。
 * 失败抛错，调用方需要捕获并降级。
 */
async function splitAndEnrichScenes(scriptText, topic, template, styleHint = 'auto', qualityMode = 'balanced', onProgress, directorResult, 
/** 可选：强制 split 阶段走指定 provider+model（"主模型超时降级 cheap 档"兜底用） */
forceSplitModel, 
/** 可选：视觉风格配置（电影写实/赛博朋克/暗黑写实/微缩模型...）。
 *  不传 = 用 DEFAULT_VISUAL_STYLE 兼容老行为 */
visualStyle = visual_styles_1.DEFAULT_VISUAL_STYLE) {
    const cleanText = scriptText.trim().replace(/\s+/g, ' ');
    if (!cleanText)
        return [];
    // locale 外层检测一次：用完整文本检测，结果透传给每批 enrichScenes，避免分批后文本太短检测为 unknown
    if (styleHint === 'auto') {
        const detected = (0, locale_detect_1.detectLocale)(cleanText);
        if (detected !== 'unknown') {
            styleHint = detected === 'chinese' ? 'chinese' : 'western';
        }
        logger_1.logger.info(`[SplitAndEnrich] locale 检测结果=${detected}, styleHint 调整为 ${styleHint}`);
    }
    const cnCount = (cleanText.match(/[\u4e00-\u9fff]/g) || []).length;
    const enCount = (cleanText.replace(/[\u4e00-\u9fff]/g, '').match(/[A-Za-z0-9]+/g) || []).length;
    const estDurationSec = cnCount * 0.25 + enCount * 0.35;
    // 每镜目标时长由导演分析的 pacingStrategy 决定（qualityMode 只管 ai-video 配额，不管节奏）
    // 读不到导演结果（null/undefined/NaN/非法值）时由 computePacing 兜底 5s
    // 总数夹紧到 MAX_SCENES（=40），超出会反算 secPerScene，避免长文 + 快节奏切出 60+ 段
    const rawAvg = directorResult?.pacingStrategy?.suggestedAvgDuration;
    const { secPerScene, targetSceneCount } = computePacing(estDurationSec, rawAvg);
    logger_1.logger.info(`[SplitAndEnrich] styleHint=${styleHint}, qualityMode=${qualityMode}(${secPerScene.toFixed(1)}s/段), ` +
        `text=${cleanText.length}字, 估算${estDurationSec.toFixed(0)}s → 目标${targetSceneCount}个分镜（上限${exports.MAX_SCENES}）`);
    // Stage 1: LLM 只切分镜（小输出，稳定）
    const splitStart = Date.now();
    const splitScenes = await splitScriptOnlyLLM(cleanText, targetSceneCount, estDurationSec, secPerScene, onProgress, forceSplitModel);
    logger_1.logger.info(`[SplitAndEnrich] Stage1 完成：切出 ${splitScenes.length} 段，` +
        `耗时 ${((Date.now() - splitStart) / 1000).toFixed(1)}s`);
    // Stage 1 完成,发 progress 让前端从"切分镜中"切换到"已切出 N 段,准备补画面"
    // 这一步可见后,用户知道已经从最慢的 LLM 切分镜环节熬过来了,即将进入并行补画面
    if (onProgress) {
        onProgress(`__STAGE__|✂️ 已切出 ${splitScenes.length} 个分镜,准备补充画面|0.65`);
    }
    // 合并过短分镜（<6字）到相邻段，防止 LLM 切出"对吧？""你猜怎么着"等碎片
    const merged = mergeShortScenes(splitScenes, 6);
    if (merged.length < splitScenes.length) {
        logger_1.logger.info(`[SplitAndEnrich] 合并短分镜：${splitScenes.length} → ${merged.length}（合并了 ${splitScenes.length - merged.length} 个碎片）`);
    }
    const indexedScenes = merged.map((s, i) => ({
        index: i + 1,
        text: s.text,
        estDuration: s.estDuration,
    }));
    // Stage 2: 分批并行补画面（每批 15 个）
    const enrichStart = Date.now();
    // batch=8 比 batch=15 更稳:每批 JSON 输出量减半,DeepSeek 摆烂/截断概率大幅下降
    // 代价:4 批并行 → 7 批并行,多占一点 LLM 并发额度
    const enriched = await enrichScenesBatched(indexedScenes, topic, template, styleHint, qualityMode, 8, directorResult, visualStyle, onProgress);
    logger_1.logger.info(`[SplitAndEnrich] Stage2 完成：${enriched.length} 个分镜补画面，` +
        `耗时 ${((Date.now() - enrichStart) / 1000).toFixed(1)}s`);
    // 末尾再过一次"短分镜合并"兜底：
    //   Stage 1 之后已经合并过一次（minChars=6），但 Stage 2 enrichScenes 在分批补画面时
    //   偶发的 JSON 异常 / 重排 / 边界处理会让"上""哦""啊"这种孤字段重新冒出来。
    //   再合并一次，确保最终输出没有 < 4 字的碎片。
    //   minChars 取 4（比 Stage 1 的 6 宽松一点，避免合并掉合理短句"快走！"）
    const before = enriched.length;
    const finalScenes = mergeShortScenes(enriched.map((s) => ({ text: s.text, estDuration: s.estDuration })), 4);
    if (finalScenes.length < before) {
        // 合并发生了：需要把 finalScenes 的 text 反向更新回 enriched 的对应段
        //   按"逐段对照"方式：finalScenes[i].text 可能是 enriched[k..k+m].text 拼接，
        //   用 enriched 的 startsWith 配匹反查
        const fixedEnriched = [];
        let cursor = 0;
        for (const fs of finalScenes) {
            // 取 enriched 当前 cursor 段作为种子（保留它的画面字段），合并 text + estDuration
            const seed = enriched[cursor];
            let mergedText = seed.text;
            let mergedDur = seed.estDuration;
            cursor++;
            while (cursor < enriched.length && mergedText !== fs.text) {
                mergedText += enriched[cursor].text;
                mergedDur += enriched[cursor].estDuration;
                cursor++;
            }
            fixedEnriched.push({ ...seed, text: mergedText, estDuration: mergedDur });
        }
        logger_1.logger.info(`[SplitAndEnrich] Stage3 合并兜底：${before} → ${fixedEnriched.length}（清理 ${before - fixedEnriched.length} 个 < 4 字孤段）`);
        return fixedEnriched.map((s, i) => ({ ...s, index: i + 1 }));
    }
    return enriched;
}
/**
 * 根据模板 pacing 调整 duration
 * fast = 原 * 0.7, medium = 原 * 1.0, slow = 原 * 1.3
 */
function applyTemplatePacing(scenes, template) {
    if (!template)
        return scenes;
    const pacing = exports.TEMPLATE_META[template].pacing;
    return scenes.map((s, i) => {
        const p = pacing[i] || pacing[pacing.length - 1] || 'medium';
        const factor = p === 'fast' ? 0.8 : p === 'slow' ? 1.2 : 1.0; // 不压得那么狠
        // 下限保护：AI 视频最短 3 秒，TTS 念完至少需要实际的时间
        const minByText = Math.max(3, s.text.length * 0.22); // 每字最少 0.22s（比估算略紧）
        const adjusted = s.estDuration * factor;
        return { ...s, estDuration: Math.max(minByText, adjusted) };
    });
}
//# sourceMappingURL=scene-enrich.js.map