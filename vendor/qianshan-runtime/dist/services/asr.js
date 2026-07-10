"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asr = exports.AsrService = void 0;
/**
 * 语音识别（ASR）抽象层
 *
 * 当前实现：SiliconFlow + FunAudioLLM/SenseVoiceSmall
 * 以后要换 Whisper / 阿里云 / 腾讯云 只改这一个文件
 *
 * 输入：视频文件路径
 * 输出：SRT 字幕（带时间戳） + 纯文本副本
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const binaries_1 = require("../utils/binaries");
const external_credentials_1 = require("./external-credentials");
const logger_1 = require("../utils/logger");
const SF_MODEL = 'FunAudioLLM/SenseVoiceSmall';
class AsrService {
    /** 从视频文件抽音频（16k mono wav，SenseVoice 推荐） */
    async extractAudio(videoPath, outDir) {
        if (!fs_1.default.existsSync(outDir))
            fs_1.default.mkdirSync(outDir, { recursive: true });
        const audioPath = path_1.default.join(outDir, 'audio.wav');
        (0, child_process_1.execFileSync)((0, binaries_1.getFfmpegPath)(), [
            '-y',
            '-i', videoPath,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-c:a', 'pcm_s16le',
            audioPath,
        ], { stdio: 'ignore' });
        if (!fs_1.default.existsSync(audioPath))
            throw new Error('ffmpeg 抽音频失败');
        return audioPath;
    }
    /** 调 SiliconFlow /v1/audio/transcriptions */
    async transcribeSiliconFlow(audioPath) {
        const cred = external_credentials_1.externalCreds.get('siliconflow');
        if (!cred?.apiKey) {
            throw new Error('请先在「设置 → 外部 API」配置 SiliconFlow API Key');
        }
        const base = cred.baseUrl || 'https://api.siliconflow.cn';
        const buf = fs_1.default.readFileSync(audioPath);
        const form = new FormData();
        form.append('file', new Blob([buf], { type: 'audio/wav' }), 'audio.wav');
        form.append('model', SF_MODEL);
        const res = await fetch(`${base}/v1/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cred.apiKey}` },
            body: form,
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            throw new Error(`SiliconFlow ASR ${res.status}: ${err.slice(0, 300)}`);
        }
        const j = (await res.json());
        // SenseVoiceSmall 返回 { text: "...", ... }。没有段级时间戳时按句号切。
        const fullText = String(j?.text || '').trim();
        if (!fullText)
            throw new Error('ASR 返回空文本');
        // 如果 API 返回了 segments，直接用；否则用句号 heuristic 切段
        let segments;
        if (Array.isArray(j.segments) && j.segments.length) {
            segments = j.segments.map((s) => ({
                start: Number(s.start) || 0,
                end: Number(s.end) || 0,
                text: String(s.text || '').trim(),
            }));
        }
        else {
            segments = this.splitByPunctuation(fullText);
        }
        return {
            segments,
            fullText,
            language: j?.language || 'zh',
        };
    }
    /** 无时间戳时的兜底切分：按中文句号/问号/感叹号+长度 */
    splitByPunctuation(text) {
        const parts = text
            .split(/(?<=[。！？?!.])\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length === 0)
            return [{ start: 0, end: 0, text }];
        // 估算每字 0.25s
        const segs = [];
        let cursor = 0;
        for (const p of parts) {
            const dur = Math.max(1.5, p.length * 0.25);
            segs.push({ start: cursor, end: cursor + dur, text: p });
            cursor += dur;
        }
        return segs;
    }
    /** 主入口：从视频生成字幕 */
    async transcribeVideo(videoPath, onProgress) {
        onProgress?.({ percent: 5, stage: '抽取音频' });
        const workDir = path_1.default.join(path_1.default.dirname(videoPath), 'asr');
        const audioPath = await this.extractAudio(videoPath, workDir);
        onProgress?.({ percent: 30, stage: '上传语音识别' });
        const result = await this.transcribeSiliconFlow(audioPath);
        onProgress?.({ percent: 95, stage: '生成字幕' });
        // 缓存纯文本
        fs_1.default.writeFileSync(path_1.default.join(workDir, 'transcript.txt'), result.fullText);
        fs_1.default.writeFileSync(path_1.default.join(workDir, 'transcript.json'), JSON.stringify(result, null, 2));
        onProgress?.({ percent: 100, stage: '完成' });
        logger_1.logger.info(`[ASR] 转写成功：${result.segments.length} 段，${result.fullText.length} 字`);
        return result;
    }
    /**
     * 只从音频（而非视频）转写，方便一键成片场景：TTS 合成的整段音频 → 分词时间戳
     *
     * @param audioPath TTS 合成的完整 mp3/m4a
     * @returns 带分段时间戳的转写结果
     */
    async transcribeAudio(audioPath) {
        // SenseVoice 要 wav 16k，mp3 要先转
        const needsConvert = /\.(mp3|m4a|aac|ogg|wav)$/i.test(audioPath);
        let wavPath = audioPath;
        if (!/\.wav$/i.test(audioPath)) {
            const workDir = path_1.default.dirname(audioPath);
            wavPath = path_1.default.join(workDir, `asr-${Date.now()}.wav`);
            (0, child_process_1.execFileSync)((0, binaries_1.getFfmpegPath)(), ['-y', '-i', audioPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath], { stdio: 'ignore' });
        }
        try {
            return await this.transcribeSiliconFlow(wavPath);
        }
        finally {
            // 清理临时 wav
            if (wavPath !== audioPath) {
                try {
                    fs_1.default.unlinkSync(wavPath);
                }
                catch { }
            }
        }
    }
    /**
     * 把 ASR segments 对齐到"已知文本切分"。
     *
     * 场景：我们已经用 splitByPunctuation 切好了 N 个分镜（带预估时长），
     * 现在想把 ASR 返回的真实时间戳映射回这 N 个分镜上。
     *
     * 策略：按字数比例分配时间戳（字少的段获得对应比例的音频时间）。
     * 如果 ASR 返回的 segments 和我们的分镜 1:1 匹配更好，但多数情况按比例就够了。
     *
     * @param targetScenes 我们想要的分镜列表（含 text 和预估时长）
     * @param asrResult ASR 返回的分段时间戳
     * @returns 每个 targetScene 对应的精确起止秒数
     */
    /**
     * 把每个 scene 的字幕时间轴对齐到 ASR 真实时间戳。
     *
     * ## 算法:字符级时间戳 + 滑动锚点文本对齐
     *
     * 旧版本只用了 ASR 的"总时长"按字数线性分摊,完全忽略了 ASR segments 内部的真实时间戳。
     * 结果:语速不均(感叹/停顿/重音)的地方字幕严重飘移,中后段越飘越多。
     *
     * 新版本:
     *   1. 把 ASR segments 展开成"字符级时间戳数组" — 每个字符插值出真实时间
     *   2. 对每个 scene,在 ASR 字符流里**搜索 scene 开头**的近似匹配位置(滑动锚点)
     *      - 容忍 ASR 错字:6 字探针匹配 ≥60% 即算锚定
     *      - 顺序约束:下一个 scene 不会回退到上一个之前
     *   3. scene 的开始时间 = 锚点字符的时间戳;结束时间 = 下一个锚点
     *
     * 这样字幕段边界就贴着 ASR 真实节奏走,文本仍然是原文(无 ASR 错字)。
     */
    alignScenesToAudio(targetScenes, asrResult) {
        if (!asrResult.segments.length || !targetScenes.length) {
            // 没 ASR 时用估算值兜底
            const out = [];
            let cursor = 0;
            for (const s of targetScenes) {
                out.push({ start: cursor, end: cursor + s.estDuration, duration: s.estDuration });
                cursor += s.estDuration;
            }
            return out;
        }
        const totalAudio = asrResult.segments[asrResult.segments.length - 1].end || 0;
        const totalChars = targetScenes.reduce((sum, s) => sum + s.text.length, 0);
        if (totalAudio === 0 || totalChars === 0) {
            return this.alignScenesToAudio(targetScenes, { segments: [], fullText: '' });
        }
        // ─── Step 1: 把 ASR segments 展开成"字符级时间戳"数组 ───
        // 每个字符的时间 = seg.start + seg.duration * (charIndexInSeg / segLen)
        const asrChars = [];
        for (const seg of asrResult.segments) {
            const text = String(seg.text || '');
            if (text.length === 0)
                continue;
            const segDur = Math.max(0.001, (seg.end || 0) - (seg.start || 0));
            for (let i = 0; i < text.length; i++) {
                const t = (seg.start || 0) + segDur * (i / text.length);
                asrChars.push({ char: text[i], time: t });
            }
        }
        // 末尾哨兵
        asrChars.push({ char: '', time: totalAudio });
        if (asrChars.length <= 1) {
            return this.alignScenesToAudio(targetScenes, { segments: [], fullText: '' });
        }
        // ─── Step 2: 滑动锚点 - 对每个 scene 在 ASR 字符流里找近似匹配位置 ───
        /**
         * 在 asrChars[startSearchAt..startSearchAt+200] 范围里找 sceneText 前 6 字的最佳匹配。
         * 容错:6 字至少匹配上 60% 即认为对齐成功。
         */
        const findAnchorPos = (sceneText, startSearchAt) => {
            if (!sceneText)
                return startSearchAt;
            // 取 scene 开头 6 个字符做探针(去掉标点更稳)
            const probe = sceneText.replace(/[，。！？、,.\!?\s]/g, '').slice(0, 6);
            if (probe.length === 0)
                return startSearchAt;
            const minMatch = Math.max(2, Math.ceil(probe.length * 0.6));
            // 限制扫描窗口,防止 N 个 scene × 全长 ASR 的 O(N*M) 爆炸
            const maxScanWindow = 300;
            const maxScanEnd = Math.min(asrChars.length - 1, startSearchAt + maxScanWindow);
            let bestPos = startSearchAt;
            let bestScore = -1;
            for (let asrPos = startSearchAt; asrPos < maxScanEnd; asrPos++) {
                let matches = 0;
                for (let k = 0; k < probe.length && asrPos + k < asrChars.length - 1; k++) {
                    if (probe[k] === asrChars[asrPos + k].char)
                        matches++;
                }
                if (matches >= minMatch && matches > bestScore) {
                    bestScore = matches;
                    bestPos = asrPos;
                    if (matches === probe.length)
                        break; // 完美匹配,不再找
                }
            }
            // 锚定失败(没找到 ≥60% 匹配的)→ 退到按字数线性估算这一个 scene 的位置
            if (bestScore < minMatch) {
                return startSearchAt;
            }
            return bestPos;
        };
        // ─── Step 3: 顺序锚定每个 scene 的起始字符位置 ───
        const sceneStartAsrPos = [];
        let searchFrom = 0;
        for (let i = 0; i < targetScenes.length; i++) {
            const pos = findAnchorPos(targetScenes[i].text, searchFrom);
            sceneStartAsrPos.push(pos);
            // 下一个 scene 至少从当前 scene 字数 50% 之后开始找(防止反复匹配同一段)
            const skip = Math.max(1, Math.floor(targetScenes[i].text.length * 0.5));
            searchFrom = Math.min(asrChars.length - 1, pos + skip);
        }
        // 末尾哨兵
        sceneStartAsrPos.push(asrChars.length - 1);
        // ─── Step 4: 输出每个 scene 的真实 [start, end] ───
        const out = [];
        for (let i = 0; i < targetScenes.length; i++) {
            const start = asrChars[sceneStartAsrPos[i]].time;
            let end = asrChars[sceneStartAsrPos[i + 1]].time;
            // 防止 end <= start(对齐失败时兜底给 0.3s 最小时长)
            if (end <= start)
                end = start + 0.3;
            out.push({ start, end, duration: end - start });
        }
        return out;
    }
    /** 把识别结果生成 SRT 字符串 */
    toSrt(result) {
        const toTime = (sec) => {
            const ms = Math.max(0, Math.floor(sec * 1000));
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            const mi = ms % 1000;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mi).padStart(3, '0')}`;
        };
        return result.segments
            .map((seg, i) => `${i + 1}\n${toTime(seg.start)} --> ${toTime(seg.end)}\n${seg.text}\n`)
            .join('\n');
    }
}
exports.AsrService = AsrService;
exports.asr = new AsrService();
//# sourceMappingURL=asr.js.map