"use strict";
/**
 * 确定性分镜切分器 —— 零 LLM 调用
 *
 * 核心思路：
 *   - 中文文案天然有标点（句号/问号/感叹号必切，逗号/分号按字数决定）
 *   - 每段 8-30 字，对应 3-12 秒 TTS 时长
 *   - 过短的段（< 6 字）合并到邻段
 *   - 过长的段（> 40 字）按逗号再切
 *
 * 对比 LLM 拆分的优势：
 *   - 快（几乎 0ms）
 *   - 零成本
 *   - 确定性（同文案永远切一样）
 *   - 不会漏字、不会改写
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitByPunctuation = splitByPunctuation;
// 时长估算：唯一真理来源在 @qianshan/shared/duration.ts
// scene-splitter 和 one-click compose 都从那里 import,避免估算公式不一致导致音画累积漂移
const shared_1 = require("@qianshan/shared");
function splitByPunctuation(raw, opts = {}) {
    const minChars = opts.minChars ?? 8;
    const maxChars = opts.maxChars ?? 30;
    const targetSec = opts.targetSeconds ?? 8;
    const minScenes = opts.minScenes ?? 3;
    const maxScenes = opts.maxScenes ?? 12;
    // 1. 清理空白 + 统一标点
    let text = raw.trim().replace(/\s+/g, '');
    if (!text)
        return [];
    // 2. 第一轮：按"强标点"（句号/问号/感叹号/换行）切
    const strongSplit = splitByStrongPunct(text);
    // 3. 第二轮：把过长的段再按"弱标点"（逗号/分号/冒号/顿号）切
    let segments = [];
    for (const seg of strongSplit) {
        if (seg.text.length <= maxChars) {
            segments.push(seg);
        }
        else {
            segments.push(...splitByWeakPunct(seg.text, maxChars));
        }
    }
    // 4. 第三轮：过短的段合并到下一段
    segments = mergeShortSegments(segments, minChars);
    // 5. 数量控制
    if (segments.length > maxScenes) {
        segments = mergeToFit(segments, maxScenes);
    }
    else if (segments.length < minScenes && segments.length > 0) {
        // 不足 minScenes 时把长段再切细
        segments = splitLongestSegments(segments, minScenes, minChars);
    }
    // 6. 组装
    return segments.map((s, i) => ({
        index: i + 1,
        text: s.text,
        estDuration: (0, shared_1.estimateDuration)(s.text),
        endPunct: s.endPunct,
    }));
}
/** 按强标点切（保留标点本身）*/
function splitByStrongPunct(text) {
    const out = [];
    let buf = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        buf += ch;
        if (/[。！？\.\!\?\n]/.test(ch)) {
            out.push({ text: buf, endPunct: ch });
            buf = '';
        }
    }
    if (buf.trim())
        out.push({ text: buf, endPunct: '' });
    return out;
}
/** 按弱标点切 —— 只有长于 maxChars 才切 */
function splitByWeakPunct(text, maxChars) {
    const out = [];
    let buf = '';
    const endPunct = text.match(/[。！？\.\!\?]$/)?.[0] || '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        buf += ch;
        // 找逗号切点：只在 buf 累积到合适长度时切
        if (/[，,；;：:、]/.test(ch) && buf.length >= maxChars * 0.5) {
            out.push({ text: buf, endPunct: ch });
            buf = '';
        }
    }
    if (buf.trim()) {
        // 最后一段继承原句的结尾标点
        if (out.length > 0 && endPunct && !buf.endsWith(endPunct)) {
            out.push({ text: buf, endPunct });
        }
        else {
            out.push({ text: buf, endPunct: buf.slice(-1) });
        }
    }
    // 如果弱标点还不够，且还超长，按字数硬切
    const final = [];
    for (const s of out) {
        if (s.text.length > maxChars * 1.5) {
            final.push(...hardSplit(s.text, maxChars));
        }
        else {
            final.push(s);
        }
    }
    return final;
}
/** 硬切：按字数强制切（兜底）*/
function hardSplit(text, maxChars) {
    const out = [];
    for (let i = 0; i < text.length; i += maxChars) {
        const chunk = text.slice(i, i + maxChars);
        out.push({ text: chunk, endPunct: chunk.slice(-1) });
    }
    return out;
}
/** 合并过短的段（< minChars）到下一段 */
function mergeShortSegments(segments, minChars) {
    if (segments.length === 0)
        return segments;
    const out = [];
    let pending = '';
    for (let i = 0; i < segments.length; i++) {
        const cur = segments[i];
        const combined = pending + cur.text;
        if (combined.length < minChars && i < segments.length - 1) {
            // 太短继续累积
            pending = combined;
        }
        else {
            out.push({ text: combined, endPunct: cur.endPunct });
            pending = '';
        }
    }
    if (pending) {
        // 剩下的并到最后一段
        if (out.length > 0) {
            out[out.length - 1].text = out[out.length - 1].text + pending;
        }
        else {
            out.push({ text: pending, endPunct: pending.slice(-1) });
        }
    }
    return out;
}
/** 分镜数超标时合并（从最短的连续两段开始）*/
function mergeToFit(segments, maxScenes) {
    const arr = [...segments];
    while (arr.length > maxScenes) {
        // 找最短的连续两段合并
        let minCombined = Infinity;
        let mergeAt = 0;
        for (let i = 0; i < arr.length - 1; i++) {
            const combined = arr[i].text.length + arr[i + 1].text.length;
            if (combined < minCombined) {
                minCombined = combined;
                mergeAt = i;
            }
        }
        arr[mergeAt] = {
            text: arr[mergeAt].text + arr[mergeAt + 1].text,
            endPunct: arr[mergeAt + 1].endPunct,
        };
        arr.splice(mergeAt + 1, 1);
    }
    return arr;
}
/** 分镜数不足时把最长的再切细 */
function splitLongestSegments(segments, minScenes, minChars) {
    const arr = [...segments];
    while (arr.length < minScenes) {
        // 找最长的切一刀
        let longestI = 0;
        let longestLen = 0;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].text.length > longestLen) {
                longestLen = arr[i].text.length;
                longestI = i;
            }
        }
        if (longestLen < minChars * 2)
            break; // 所有段都够短就停
        const seg = arr[longestI];
        const mid = Math.floor(seg.text.length / 2);
        // 在 mid 附近找个弱标点
        let cutAt = mid;
        for (let k = 0; k < 5; k++) {
            for (const d of [k, -k]) {
                const idx = mid + d;
                if (idx > 0 && idx < seg.text.length && /[，,；;：:、]/.test(seg.text[idx])) {
                    cutAt = idx + 1;
                    break;
                }
            }
        }
        const left = seg.text.slice(0, cutAt);
        const right = seg.text.slice(cutAt);
        arr.splice(longestI, 1, { text: left, endPunct: left.slice(-1) }, { text: right, endPunct: seg.endPunct });
    }
    return arr;
}
//# sourceMappingURL=scene-splitter.js.map