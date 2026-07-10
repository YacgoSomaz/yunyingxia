"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.directorAnalyze = directorAnalyze;
/**
 * 导演分析（Director Analysis）—— Stage 1 全局视角
 *
 * 在 enrichScenes 之前做一次全局 LLM 分析，输出：
 *   - narrativeArc:   叙事弧线（hook/setup/evidence/insight/cta 各自的分镜范围）
 *   - emotionCurve:   情绪曲线（各阶段 emotion + intensity）
 *   - characters:     角色档案（id/role/visualDesc）
 *   - keyMoments:     关键镜头（哪些 scene index 必须 ai-video）
 *   - dataScenes:     数据场景（哪些 scene 应 data-viz，及 vizType/numbers）
 *   - pacingStrategy: 节奏策略（给后续分镜参考）
 *
 * 让后续 enrichScenes 有全局视角，避免"每个分镜各自为战"。
 */
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
const llm_tiers_1 = require("./llm-tiers");
/** 判断错误是否为超时（AbortSignal.timeout 触发的 AbortError） */
function isTimeoutError(err) {
    const msg = String(err?.message || err || '');
    return /aborted|timeout|timed out/i.test(msg);
}
// ── 主函数 ────────────────────────────────────────────────────────────────────
/**
 * 对全文做一次导演级 LLM 分析
 * @param fullText      完整文案
 * @param sceneTexts    已切好的分镜文本（1-based index）
 * @param onProgress    可选的流式进度回调
 * @returns DirectorResult，如果 LLM 调用失败则返回 null（不阻断主流程）
 */
async function directorAnalyze(fullText, sceneTexts, onProgress) {
    const sceneList = sceneTexts
        .map((s) => `  ${s.index}. ${s.text}`)
        .join('\n');
    const prompt = `你是资深短视频导演。下面是一篇完整文案和已切好的分镜列表。
请做一次**全局分析**，输出 JSON（严格按 schema，不要多余文字）。

## 完整文案
${fullText}

## 分镜列表
${sceneList}

## 输出 JSON Schema

\`\`\`json
{
  "narrativeArc": [
    {
      "role": "hook | setup | evidence | insight | cta",
      "fromScene": 1,
      "toScene": 3,
      "purpose": "一句话描述该段叙事目标"
    }
  ],
  "emotionCurve": [
    {
      "sceneIndex": 1,
      "emotion": "excited | serious | cheerful | dramatic | calm | humorous",
      "intensity": 7
    }
  ],
  "characters": [
    {
      "id": "char_xxx",
      "role": "外卖小哥",
      "visualDesc": "25岁左右亚裔男性，穿黄色外卖制服和头盔，肤色偏黑，短发",
      "sceneIndices": [2, 5, 8]
    }
  ],
  "keyMoments": [
    {
      "sceneIndex": 1,
      "reason": "开场钩子需要强代入感，必须用视频"
    }
  ],
  "dataScenes": [
    {
      "sceneIndex": 3,
      "vizType": "growth-bar | cost-compare | grid-highlight | big-number",
      "numbers": ["4", "200"],
      "label": "AI短剧数量增长",
      "subtitle": "",
      "labels": ["2025年初", "2026年初"]
    }
  ],
  "pacingStrategy": {
    "overallPace": "fast | medium | slow",
    "climaxScenes": [5, 12],
    "suggestedAvgDuration": 4
  }
}
\`\`\`

## 规则

1. **narrativeArc**：把所有分镜划分到 hook/setup/evidence/insight/cta 五段叙事弧线中。每段用 fromScene/toScene 标注范围，不遗漏任何分镜。
2. **emotionCurve**：为每个分镜标注 emotion + intensity(0-10)。情绪要有**起伏**，不要全标同一个。
3. **characters**：提取文案中反复出现的**具体人物**（非泛指）。visualDesc 必须包含年龄/族裔/衣着三维度，后续会直接嵌入 AI 图片 prompt，保证同一角色外貌一致。如果文案没有具体角色，characters 可以为空数组。
4. **keyMoments**：标出**必须用 ai-video** 的关键分镜（开场钩子、高潮转折、强动态场景），通常 3-5 个即可，不要标太多。
5. **dataScenes**：标出含明确数字对比/增长/大数据的分镜，给出 vizType 和提取的数字。只标真正的数据场景，不要把"3个朋友"这种日常数字标进来。
6. **pacingStrategy**：根据文案整体风格判断节奏。

⚠️ 只输出 JSON，不要任何解释文字。`;
    const startTime = Date.now();
    logger_1.logger.info('[DirectorAnalysis] 开始全局导演分析...');
    // 流式回调:
    //   ① 透传 LLM token chunk 给前端 SSE(原行为)
    //   ② 第一个 chunk 到达时发 __STAGE__,告诉用户"AI 已经开始响应了"
    //      —— 跟外层 15% "导演分析开始" 区分开,避免 15-40s 黑屏让人以为卡死
    let firstChunkSeen = false;
    const onChunk = onProgress
        ? (ck) => {
            if (!ck.isFinished && ck.content) {
                if (!firstChunkSeen) {
                    firstChunkSeen = true;
                    onProgress(`__STAGE__|🎯 全局导演分析中(AI 思考中...)|0.25`);
                }
                onProgress(ck.content);
            }
        }
        : undefined;
    try {
        const raw = await llm_1.llm.completeJSONWithSceneStream('one_click_split', '资深短视频导演（全局分析）', prompt, onChunk, 
        // Director 输出量大：5 段弧线 + 角色 + 关键镜头 + 数据场景，每个有详细字段
        // 4096 tokens 在长文案场景容易触底，提到 8192 给余量
        8192, 
        // 大输出 + 长 prompt：默认 180s 不够，提到 360s 避免 6 次重试全部因超时被掐
        360_000);
        const result = parseDirectorResult(raw, sceneTexts.length);
        logger_1.logger.info(`[DirectorAnalysis] 完成：${result.narrativeArc.length} 段弧线, ` +
            `${result.characters.length} 个角色, ${result.keyMoments.length} 个关键镜头, ` +
            `${result.dataScenes.length} 个数据场景, ` +
            `耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        return result;
    }
    catch (err) {
        // 超时降级：用同 provider 的 text-long cheap 档（如灵芽 → deepseek-v4-flash）兜底重试一次
        if (isTimeoutError(err)) {
            const route = llm_1.llm.getRoutingForScene('one_click_split');
            if (route) {
                const category = llm_tiers_1.SCENE_TO_CATEGORY['one_click_split'];
                const cheap = (0, llm_tiers_1.resolveTier)(route.provider, category, 'cheap');
                if (cheap && cheap.model !== route.model) {
                    logger_1.logger.warn(`[DirectorAnalysis] 主模型 ${route.model} 超时，降级 cheap 档 ${cheap.model} 重试一次...`);
                    if (onProgress) {
                        // 告诉用户主模型超时,自动切快速版重试,避免"15% 卡 60s 不动"的疑惑
                        onProgress(`__STAGE__|⚡ 主模型超时,切快速版重试|0.18`);
                    }
                    // 重置首 chunk 标记,让 cheap 档重试时也能发"AI 思考中"信号
                    firstChunkSeen = false;
                    try {
                        const raw = await llm_1.llm.completeJSONWithSceneStreamForceModel(route.provider, cheap.model, '资深短视频导演（全局分析）', prompt, onChunk, 8192, 360_000);
                        const result = parseDirectorResult(raw, sceneTexts.length);
                        logger_1.logger.info(`[DirectorAnalysis] cheap 档兜底成功：${result.narrativeArc.length} 段弧线, ` +
                            `${result.characters.length} 个角色, 耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
                        return result;
                    }
                    catch (retryErr) {
                        logger_1.logger.warn(`[DirectorAnalysis] cheap 档也失败，跳过导演分析: ${String(retryErr?.message || retryErr).slice(0, 120)}`);
                        return null;
                    }
                }
            }
        }
        logger_1.logger.warn(`[DirectorAnalysis] LLM 分析失败，跳过导演分析（不影响主流程）: ${String(err?.message || err).slice(0, 120)}`);
        return null;
    }
}
// ── 解析 + 校验 ──────────────────────────────────────────────────────────────
const VALID_EMOTIONS = ['excited', 'serious', 'cheerful', 'dramatic', 'calm', 'humorous'];
const VALID_VIZ_TYPES = ['grid-highlight', 'growth-bar', 'cost-compare', 'big-number'];
const VALID_ARC_ROLES = ['hook', 'setup', 'evidence', 'insight', 'cta'];
const VALID_PACES = ['fast', 'medium', 'slow'];
/**
 * 安全解析 LLM 返回的导演分析，对每个字段做校验和兜底
 */
function parseDirectorResult(raw, totalScenes) {
    // narrativeArc
    const narrativeArc = [];
    if (Array.isArray(raw?.narrativeArc)) {
        for (const seg of raw.narrativeArc) {
            if (VALID_ARC_ROLES.includes(seg?.role) &&
                typeof seg?.fromScene === 'number' &&
                typeof seg?.toScene === 'number' &&
                seg.fromScene >= 1 &&
                seg.toScene <= totalScenes) {
                narrativeArc.push({
                    role: seg.role,
                    fromScene: seg.fromScene,
                    toScene: seg.toScene,
                    purpose: String(seg.purpose || '').slice(0, 200),
                });
            }
        }
    }
    // emotionCurve
    const emotionCurve = [];
    if (Array.isArray(raw?.emotionCurve)) {
        for (const pt of raw.emotionCurve) {
            if (typeof pt?.sceneIndex === 'number' &&
                pt.sceneIndex >= 1 &&
                pt.sceneIndex <= totalScenes &&
                VALID_EMOTIONS.includes(pt?.emotion)) {
                emotionCurve.push({
                    sceneIndex: pt.sceneIndex,
                    emotion: pt.emotion,
                    intensity: Math.max(0, Math.min(10, Number(pt.intensity) || 5)),
                });
            }
        }
    }
    // characters
    const characters = [];
    if (Array.isArray(raw?.characters)) {
        for (const ch of raw.characters) {
            if (ch?.id && ch?.visualDesc) {
                characters.push({
                    id: String(ch.id).slice(0, 50),
                    role: String(ch.role || '').slice(0, 50),
                    visualDesc: String(ch.visualDesc).slice(0, 300),
                    sceneIndices: Array.isArray(ch.sceneIndices)
                        ? ch.sceneIndices.filter((i) => typeof i === 'number' && i >= 1 && i <= totalScenes)
                        : [],
                });
            }
        }
    }
    // keyMoments
    const keyMoments = [];
    if (Array.isArray(raw?.keyMoments)) {
        for (const km of raw.keyMoments) {
            if (typeof km?.sceneIndex === 'number' && km.sceneIndex >= 1 && km.sceneIndex <= totalScenes) {
                keyMoments.push({
                    sceneIndex: km.sceneIndex,
                    reason: String(km.reason || '').slice(0, 200),
                });
            }
        }
    }
    // dataScenes
    const dataScenes = [];
    if (Array.isArray(raw?.dataScenes)) {
        for (const ds of raw.dataScenes) {
            if (typeof ds?.sceneIndex === 'number' &&
                ds.sceneIndex >= 1 &&
                ds.sceneIndex <= totalScenes &&
                VALID_VIZ_TYPES.includes(ds?.vizType) &&
                Array.isArray(ds?.numbers)) {
                dataScenes.push({
                    sceneIndex: ds.sceneIndex,
                    vizType: ds.vizType,
                    numbers: ds.numbers.map((n) => String(n)),
                    label: ds.label ? String(ds.label).slice(0, 100) : undefined,
                    subtitle: ds.subtitle ? String(ds.subtitle).slice(0, 100) : undefined,
                    labels: Array.isArray(ds.labels)
                        ? ds.labels.map((l) => String(l)).slice(0, 4)
                        : undefined,
                });
            }
        }
    }
    // pacingStrategy
    const rawPacing = raw?.pacingStrategy;
    const pacingStrategy = {
        overallPace: VALID_PACES.includes(rawPacing?.overallPace) ? rawPacing.overallPace : 'medium',
        climaxScenes: Array.isArray(rawPacing?.climaxScenes)
            ? rawPacing.climaxScenes.filter((i) => typeof i === 'number' && i >= 1 && i <= totalScenes)
            : [],
        suggestedAvgDuration: typeof rawPacing?.suggestedAvgDuration === 'number'
            ? Math.max(2, Math.min(10, rawPacing.suggestedAvgDuration))
            : 4,
    };
    return { narrativeArc, emotionCurve, characters, keyMoments, dataScenes, pacingStrategy };
}
//# sourceMappingURL=director-analysis.js.map