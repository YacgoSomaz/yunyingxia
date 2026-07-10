"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickBgmByEmotion = pickBgmByEmotion;
const EMOTION_TO_MOOD = {
    excited: ['upbeat', 'inspiring'],
    cheerful: ['upbeat', 'humorous'],
    dramatic: ['dramatic', 'cinematic'],
    serious: ['cinematic', 'calm'],
    calm: ['calm'],
    humorous: ['humorous', 'upbeat'],
};
/**
 * 按场景整体情绪选 BGM
 *
 * @param sceneEmotions 所有分镜的 emotion 列表（会取众数）
 * @param videoDuration 视频总时长
 * @param bgmLib 可用的 BGM 库
 * @returns 最匹配的 BGM，没找到返 null
 */
function pickBgmByEmotion(sceneEmotions, videoDuration, bgmLib) {
    if (bgmLib.length === 0)
        return null;
    // 1. 众数情绪
    const emotionCount = new Map();
    for (const e of sceneEmotions)
        emotionCount.set(e, (emotionCount.get(e) || 0) + 1);
    let dominantEmotion = 'calm';
    let maxCount = 0;
    for (const [e, n] of emotionCount) {
        if (n > maxCount) {
            maxCount = n;
            dominantEmotion = e;
        }
    }
    const targetMoods = EMOTION_TO_MOOD[dominantEmotion] || ['calm'];
    // 2. 按 mood 过滤
    const matches = bgmLib.filter((b) => b.mood && targetMoods.includes(b.mood.toLowerCase()));
    const pool = matches.length > 0 ? matches : bgmLib;
    // 3. 打分：mood 匹配度 + duration 接近度（希望 BGM 长度 >= 视频时长）
    const scored = pool.map((b) => {
        let score = 0;
        if (b.mood && targetMoods.includes(b.mood.toLowerCase()))
            score += 50;
        if (b.mood && targetMoods[0] === b.mood.toLowerCase())
            score += 30; // 首选 mood
        const durDiff = Math.abs((b.duration || 60) - videoDuration);
        score -= Math.min(30, durDiff / 10); // 差 10 秒扣 1 分，最多扣 30
        if ((b.duration || 0) >= videoDuration)
            score += 10; // 够长不用 loop 加分
        return { bgm: b, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.bgm || null;
}
//# sourceMappingURL=bgm-matcher.js.map