"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAss = writeAss;
exports.writeKaraokeAss = writeKaraokeAss;
exports.guessHighlights = guessHighlights;
/**
 * ASS 字幕生成（Advanced SubStation Alpha）
 *
 * 比 SRT 强大的地方：
 *  - 每一段可以指定样式（字体/大小/颜色/描边/位置）
 *  - 支持内联特效：逐字卡拉 OK、关键词变色、淡入淡出
 *  - ffmpeg 的 subtitles 滤镜原生支持 .ass
 *
 * 颜色格式：&H+AABBGGRR（ASS 是 BGR 反序，且带 alpha）
 *   白色不透明: &H00FFFFFF
 *   黄色不透明: &H0000FFFF
 *   红色描边:   &H000000FF
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** ASS 样式预设（跟 SUBTITLE_STYLES 对齐）*/
const ASS_STYLES = {
    standard: {
        fontName: 'Microsoft YaHei',
        fontSize: 64, // 1920p 画布下的基准字号 — B5: writeAss 内部按 h/1920 比例缩放
        primaryColor: '&H00FFFFFF', // 白
        outlineColor: '&H00000000', // 黑
        backColor: '&H00000000',
        outline: 4,
        shadow: 0,
        marginV: 260,
        bold: 1,
        // 关键词高亮：用户要求不再做任何视觉差异（颜色/放大/加粗都不要）
        highlightColor: '&H00FFFFFF',
        highlightSizeRatio: 1.0,
    },
    science: {
        fontName: 'Microsoft YaHei',
        fontSize: 56,
        primaryColor: '&H00000000',
        outlineColor: '&H00FFFFFF',
        backColor: '&HC0FFFFFF', // 白底色块
        outline: 2,
        shadow: 0,
        marginV: 280,
        bold: 0,
        // 关键词高亮：保持与正文一致（无差异）
        highlightColor: '&H00000000',
        highlightSizeRatio: 1.0,
    },
    variety: {
        fontName: 'Microsoft YaHei',
        fontSize: 88,
        primaryColor: '&H00FFFFFF', // 白（原黄色已停用）
        outlineColor: '&H000000FF', // 红描边
        backColor: '&H00000000',
        outline: 6,
        shadow: 2,
        marginV: 320,
        bold: 1,
        // 关键词高亮：保持与正文一致（无差异）
        highlightColor: '&H00FFFFFF',
        highlightSizeRatio: 1.0,
    },
};
/** 按视频尺寸缩放 ASS 样式的像素值
 *
 * 字号/描边/阴影是"视觉尺寸"，按**短边**缩放（基准 1080）：
 *   - 竖屏 1080×1920 (短边=1080)  → k=1.0  → 64px
 *   - 横屏 1920×1080 (短边=1080)  → k=1.0  → 64px ✅ 横竖屏字号一致
 *   - 720p (短边=720)             → k=0.67 → 43px
 *
 * marginV 是"垂直距离"，按 **height** 缩放（基准 1920），保证字幕始终在画面相同高度比例：
 *   - 竖屏 h=1920 → marginV 260 (占高 13.5%)
 *   - 横屏 h=1080 → marginV 146 (占高 13.5%) ← 不跟字号缩放走，否则横屏字幕离底太远
 *
 * 老逻辑全用 h/1920：横屏 1080 高，字号被压成 0.56x = 36px，用户反馈"横屏字幕小"。
 */
function scaleStyle(st, width, height, fontSizeOverride, marginVOverride) {
    const shortSide = Math.min(width, height);
    const kVisual = Math.max(0.4, shortSide / 1080);
    const kVertical = Math.max(0.4, height / 1920);
    // override 数值是用户在 1080p 基准上选的(预览也按 1080p 算),按视频实际尺寸再缩放一次
    // 跟非 override 路径一致,确保不同分辨率视频字幕在视觉上占比一致
    const baseFontSize = typeof fontSizeOverride === 'number' && fontSizeOverride > 0
        ? fontSizeOverride
        : st.fontSize;
    const baseMarginV = typeof marginVOverride === 'number' && marginVOverride >= 0
        ? marginVOverride
        : st.marginV;
    return {
        ...st,
        fontSize: Math.round(baseFontSize * kVisual),
        outline: Math.max(1, Math.round(st.outline * kVisual)),
        shadow: Math.round(st.shadow * kVisual),
        marginV: Math.round(baseMarginV * kVertical),
    };
}
/** 秒 → ASS 时间 H:MM:SS.CC（注意是 centisecond）*/
function toAssTime(sec) {
    const total = Math.max(0, sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    const cs = Math.floor((total - Math.floor(total)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
/**
 * 字幕分行：优先按标点（一句话一行），避免把句子从中间硬砍
 *
 * 策略：
 *   1. 短段（≤ maxPerLine）→ 直接一行，不切（我们新架构的分镜已经是 12-20 字）
 *   2. 长段 → 按中文标点（，。！？；：、）切，累加到行长 <= maxPerLine
 *   3. 单个标点段还超长 → 硬切（兜底，正常不会命中）
 *
 * 效果：
 *   "爱上离异带娃做保洁的我，各种土味桥段" → ["爱上离异带娃做保洁的我", "各种土味桥段"]
 *   不再出现 "上离异带娃做保洁的我，啊反正各" 这种横跨标点的怪行。
 */
function splitCaption(text, maxPerLine = 18) {
    // 清洗：去空白 + 去不可见控制字符（BOM、ZWSP、Line Sep 等，
    // 这些字符在字幕字体里经常渲染成 □ tofu，是 "都刷□到过吧" 这种怪字的元凶）
    const cleaned = text
        .replace(/\s+/g, '')
        // 各种零宽/不可见字符：U+200B-200D（零宽空格/非连字/连字），U+2028-2029（行/段分隔符），
        // U+FEFF（BOM），U+00AD（软连字符），U+034F（组合字），U+180E（蒙古元音分隔），U+061C（阿拉伯文字幕标记）
        .replace(/[\u200B-\u200F\u2028\u2029\uFEFF\u00AD\u034F\u180E\u061C]/g, '')
        // 其他控制字符（ASCII 0-31 除了 \n\r\t）
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .trim();
    if (!cleaned)
        return [];
    // 短段直接返回（大多数分镜会命中这里）
    if (cleaned.length <= maxPerLine)
        return [cleaned];
    // 按标点切分（保留标点在段尾）
    const PUNCT = /[，。！？；：、,\.\!\?;:]/;
    const chunks = [];
    let buf = '';
    for (let i = 0; i < cleaned.length; i++) {
        buf += cleaned[i];
        if (PUNCT.test(cleaned[i])) {
            chunks.push(buf);
            buf = '';
        }
    }
    if (buf)
        chunks.push(buf);
    // 累加小段到行：累计不超过 maxPerLine 就合在一起
    const lines = [];
    let line = '';
    for (const chunk of chunks) {
        if (line.length + chunk.length <= maxPerLine) {
            line += chunk;
        }
        else {
            if (line)
                lines.push(line);
            // 单个 chunk 还超长（极端情况）→ 硬切
            // 按"先算需要几行 → 均分"的方式切，避免末尾出现孤字
            //   16 字 → numLines=ceil(16/15)=2 → perLine=ceil(16/2)=8 → 切成 8+8
            //   35 字 → numLines=3 → perLine=12 → 12+12+11，三行都接近平衡
            // ★ 改进：硬切位置在 perLine ±2 范围找"软分隔符"（——、·、、）后面切，
            //   避免把"其实""我们""如果"等常见双字词从中间切开。
            //   例："告诉你个小秘密——其实可以免费坐回去！" 19字
            //     旧：perLine=10 → "告诉你个小秘密——其" + "实可以免费坐回去！"（"其实"被劈）
            //     新：找到 perLine-1=9 处 "—" 是软分隔符 → "告诉你个小秘密——" + "其实可以免费坐回去！"
            if (chunk.length > maxPerLine) {
                const numLines = Math.ceil(chunk.length / maxPerLine);
                const perLine = Math.ceil(chunk.length / numLines);
                const SOFT_BREAK = /[—–·、－]/; // 破折号 / 中点 / 顿号 等次级分隔符
                // 在指定 chunk 内找一个比 idealCut 更"自然"的切分点：[ideal-2, ideal+2]
                const findNaturalCut = (text, idealCut) => {
                    // 检查顺序：理想位置 → -1 → +1 → -2 → +2（优先靠近 ideal）
                    const offsets = [0, -1, 1, -2, 2];
                    for (const off of offsets) {
                        const cut = idealCut + off;
                        // 切点必须在 (0, text.length)，且 text[cut-1] 是软分隔符
                        if (cut > 1 && cut < text.length && SOFT_BREAK.test(text[cut - 1])) {
                            return cut;
                        }
                    }
                    return idealCut;
                };
                let pos = 0;
                let remainingLines = numLines;
                while (pos < chunk.length) {
                    const remaining = chunk.length - pos;
                    const isLast = remainingLines <= 1;
                    if (isLast) {
                        // 最后一段：剩下的全给 line（让外层 push）
                        line = chunk.slice(pos);
                        break;
                    }
                    // 这一段切多长？理想 = perLine，但找一下软分隔符
                    const idealCut = pos + perLine;
                    const actualCut = findNaturalCut(chunk, idealCut);
                    lines.push(chunk.slice(pos, actualCut));
                    pos = actualCut;
                    remainingLines--;
                }
            }
            else {
                line = chunk;
            }
        }
    }
    if (line)
        lines.push(line);
    // 去掉每行首尾悬挂的标点（字幕里行首句末有标点看起来廉价）
    return lines
        .map((l) => l.replace(/^[，。！？；：、,\.\!\?;:]+|[，。！？；：、,\.\!\?;:]+$/g, '').trim())
        .filter(Boolean);
}
/**
 * 关键词高亮（已停用）：用户明确要求不要颜色/放大/加粗任何差异化效果。
 * 保留函数签名只为向后兼容调用点；行为退化为纯转义返回。
 */
function applyHighlights(line, _highlights, _baseFontSize, _highlightColor, _sizeRatio) {
    return escapeAss(line);
}
/** ASS 里需要转义的字符 */
function escapeAss(s) {
    return s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}
/**
 * 写一个 ASS 字幕文件。
 *
 * @param destPath 输出 .ass 路径
 * @param width 视频宽（PlayResX）
 * @param height 视频高（PlayResY）
 * @param styleId 样式预设 id
 * @param segments 每个分段：{ duration, text, highlights? }
 */
function writeAss(destPath, width, height, styleId, segments, opts = {}) {
    const st = scaleStyle(ASS_STYLES[styleId] || ASS_STYLES.standard, width, height, opts.fontSizeOverride, opts.marginVOverride);
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${st.fontName},${st.fontSize},${st.primaryColor},&H000000FF,${st.outlineColor},${st.backColor},${st.bold},0,0,0,100,100,0,0,1,${st.outline},${st.shadow},2,40,40,${st.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    const events = [];
    let cursor = 0;
    for (const seg of segments) {
        const lines = splitCaption(seg.text, 15);
        // ⚠️ 按字数加权分配时长，不是均分（避免长/短行字幕滞留/抢先）
        const lineWeights = lines.map((l) => Math.max(1, l.length));
        const totalWeight = lineWeights.reduce((s, w) => s + w, 0);
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const lineDur = (lineWeights[li] / totalWeight) * seg.duration;
            const start = toAssTime(cursor);
            const end = toAssTime(cursor + lineDur);
            // 不对带高亮的那部分做 \k（因为混合 override tag 会出问题），只做简单高亮版
            const body = applyHighlights(line, seg.highlights, st.fontSize, st.highlightColor, st.highlightSizeRatio);
            // 淡入 0.1s，让字幕不那么硬切
            events.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,{\\fad(100,0)}${body}`);
            cursor += lineDur;
        }
    }
    const content = header + events.join('\n') + '\n';
    fs_1.default.mkdirSync(path_1.default.dirname(destPath), { recursive: true });
    fs_1.default.writeFileSync(destPath, content, 'utf8');
}
/**
 * 写一个"卡拉 OK 风格"的 ASS 字幕文件。
 *
 * 特点：
 *   - 接受 ASR 的精确段级时间戳（每段 start/end）
 *   - 每段字幕带 {\fad(100,100)} 淡入淡出
 *   - 整段在屏幕上滑入（{\move} 从下到正常位置）
 *   - 关键词高亮变色变大
 *
 * @param destPath .ass 输出路径
 * @param width 视频宽
 * @param height 视频高
 * @param styleId 样式预设
 * @param segments ASR 返回的精确时间段 [{ start, end, text }]
 * @param highlightsMap 可选：每段对应的关键词数组（index → keywords）
 */
function writeKaraokeAss(destPath, width, height, styleId, segments, opts = {}) {
    const st = scaleStyle(ASS_STYLES[styleId] || ASS_STYLES.standard, width, height, opts.fontSizeOverride, opts.marginVOverride);
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${st.fontName},${st.fontSize},${st.primaryColor},&H000000FF,${st.outlineColor},${st.backColor},${st.bold},0,0,0,100,100,0,0,1,${st.outline},${st.shadow},2,40,40,${st.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
    const events = [];
    for (const seg of segments) {
        if (!seg.text.trim())
            continue;
        const lines = splitCaption(seg.text, 15);
        const totalDur = Math.max(0.5, seg.end - seg.start);
        // ⚠️ 关键：按"字数加权"分配时长，不是均分
        // 旧逻辑 perLine = totalDur / N 会让长行（15字）和短行（5字）显示等长，
        // 导致字幕跟人声严重不同步——长行字幕提前消失，短行字幕滞留。
        // 中文 1 字 ≈ 0.25s，英文 1 词 ≈ 0.35s，按 char 数粗估即可。
        const lineWeights = lines.map((l) => Math.max(1, l.length));
        const totalWeight = lineWeights.reduce((s, w) => s + w, 0);
        let cursor = seg.start;
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const lineDur = (lineWeights[li] / totalWeight) * totalDur;
            const start = cursor;
            const end = cursor + lineDur;
            cursor = end;
            // 正常浮现 + 淡入（50ms fade in / 50ms fade out）
            const body = applyHighlights(line, seg.highlights, st.fontSize, st.highlightColor, st.highlightSizeRatio);
            events.push(`Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,{\\fad(80,80)}${body}`);
        }
    }
    const content = header + events.join('\n') + '\n';
    require('fs').mkdirSync(require('path').dirname(destPath), { recursive: true });
    require('fs').writeFileSync(destPath, content, 'utf8');
}
/** 简单启发式抽关键词：数字、英文术语、3-8 字的名词 */
function guessHighlights(text, allKeywords) {
    const out = new Set();
    // 1. 传入的关键词里挑"在 text 中出现"的（中文/英文都行）
    if (allKeywords) {
        for (const k of allKeywords) {
            if (k && text.includes(k))
                out.add(k);
        }
    }
    // 2. 数字 + 量词：如 "3 分钟"、"5 步"、"90%"
    const nums = text.match(/\d+(?:\.\d+)?(?:%|分|步|岁|元|万|年|月|天|秒|度|斤|克|米|小时)?/g) || [];
    nums.forEach((n) => out.add(n));
    // 3. 全英文单词（常见技术术语）
    const eng = text.match(/[A-Za-z][A-Za-z0-9]{2,}/g) || [];
    eng.forEach((e) => out.add(e));
    return Array.from(out).slice(0, 6);
}
//# sourceMappingURL=ass-subtitle.js.map