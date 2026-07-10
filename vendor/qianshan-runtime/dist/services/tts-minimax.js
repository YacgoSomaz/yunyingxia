"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeMiniMaxToMp3 = synthesizeMiniMaxToMp3;
/**
 * MiniMax TTS — 通过阿里云百炼接入 MiniMax/speech-2.8-hd 等模型
 *
 * 文档:https://help.aliyun.com/zh/model-studio/minimax-synchronous-speech-synthesis-api
 *
 * 关键点:
 *   - 走百炼平台,跟 cosyvoice 同一个 sk-xxx,不需要新申请 MiniMax 官方 key
 *   - Endpoint 跟 cosyvoice **完全不同**:
 *       cosyvoice → /api/v1/services/audio/tts/SpeechSynthesizer
 *       MiniMax  → /api/v1/services/aigc/multimodal-generation/generation
 *   - body 是 MiniMax 自有 schema(voice_setting / audio_setting 嵌套)
 *   - 响应可选 hex(默认)或 url 形式;我们用 url 节省内存
 *
 * 单价(同步合成):¥3.5/万字符(speech-2.8-hd / speech-02-hd)
 *
 * 支持的 model 字段值:
 *   - MiniMax/speech-2.8-hd       高清,主推
 *   - MiniMax/speech-2.8-turbo    快速版
 *   - MiniMax/speech-02-hd        高清 02
 *   - MiniMax/speech-02-turbo     快速 02
 *
 * 特色能力(speech-2.8 系列):
 *   - 22 个语气词:(laughs) (sighs) (coughs) (applause) 等
 *   - emotion: happy / sad / angry / surprised / fearful / ...
 *   - timbre_weights: 最多 4 音色混合
 *   - subtitle_enable: 字幕输出
 *   - language_boost: 小语种增强
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const logger_1 = require("../utils/logger");
// 端点完整 URL,跟 tts-dashscope.ts 一样写死,不读云端 baseUrl
//   - 用户云端 baseUrl 多种形态(带 /api/v1 或不带 / 末尾带 /),归一化容易出错
//   - 百炼这俩端点路径在阿里云改不了,完全固定
//   - 跟 CLAUDE.md "dashscope: URL 完全固定写死,不读云端 baseUrl" 约定一致
const TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
/** 用 Electron net.fetch 走 Chrome 网络栈(全局 fetch 已替换,这里保险标注) */
function netFetch(url, init) {
    return (electron_1.net?.fetch || fetch)(url, init);
}
// 模块级节流:百炼对 MiniMax 模型有 RPM 上限(标准账户实测 ~20 RPM)。
// 600ms 间隔 ≈ 100 RPM 仍然 429,实测拉到 3s ≈ 20 RPM 才能稳过窗口。
// 代价:30 段视频 TTS 多花 60-90s,但换来完全不降级 Edge → 音色一致 + drift ≈ 0
// 这只影响 MiniMax 调用,cosyvoice 不受影响。
const MIN_REQUEST_INTERVAL_MS = 3000;
let lastMiniMaxRequestTs = 0;
async function throttleMiniMax() {
    const now = Date.now();
    const elapsed = now - lastMiniMaxRequestTs;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
        await new Promise((r) => setTimeout(r, wait));
    }
    lastMiniMaxRequestTs = Date.now();
}
// 429 重试配置:百炼 429 一般几秒内恢复,指数 backoff 2s/4s/8s 总 14s 足够过窗口
const MAX_429_RETRIES = 3;
const BACKOFF_BASE_MS = 2000;
/**
 * 单次合成 → 写 mp3 → 返回 outPath。失败抛 Error 让 dispatchTTS 走降级。
 */
async function synthesizeMiniMaxToMp3(opts) {
    if (!opts.apiKey)
        throw new Error('MiniMax TTS:apiKey 缺失(百炼 sk-xxx)');
    if (!opts.model)
        throw new Error('MiniMax TTS:model 缺失(如 MiniMax/speech-2.8-hd)');
    const text = (opts.text || '').trim();
    if (!text)
        throw new Error('MiniMax TTS:文案为空');
    if (text.length > 10000) {
        throw new Error(`MiniMax TTS:文案 ${text.length} 字超过 10000 字限制`);
    }
    const endpoint = TTS_URL;
    const speed = clamp(opts.speed ?? 1.0, 0.5, 2.0);
    const volume = clamp(opts.volume ?? 1.0, 0.5, 2.0);
    const pitch = Math.round(clamp(opts.pitch ?? 0, -12, 12));
    const format = opts.format || 'mp3';
    const sampleRate = opts.sampleRate || 32000;
    const bitrate = opts.bitrate || 128000;
    const voiceSetting = {
        voice_id: opts.voice,
        speed,
        vol: volume,
        pitch,
    };
    if (opts.emotion)
        voiceSetting.emotion = opts.emotion;
    const body = {
        model: opts.model,
        input: {
            text,
            voice_setting: voiceSetting,
            audio_setting: {
                sample_rate: sampleRate,
                bitrate,
                format,
                channel: 1,
            },
            // url 模式:返回临时 URL,避免大段 hex 占内存
            output_format: 'url',
        },
    };
    logger_1.logger.info(`[TTS][MiniMax] POST ${endpoint} model=${opts.model} voice=${opts.voice} chars=${text.length}`);
    // 节流 + 429 自动重试。429 一般几秒内恢复,sleep 后重试避免直接降级 Edge(导致音色突变)
    let response;
    let respText = '';
    for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
        await throttleMiniMax();
        try {
            response = await netFetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${opts.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(60000),
            });
        }
        catch (err) {
            throw new Error(`MiniMax TTS 网络异常: ${String(err?.message || err)}`);
        }
        respText = await response.text();
        if (response.status !== 429 || attempt === MAX_429_RETRIES)
            break;
        // 优先用 Retry-After header,没有就指数 backoff 2s/4s/8s
        const retryAfterHdr = response.headers.get('Retry-After');
        let waitMs;
        if (retryAfterHdr) {
            const n = parseInt(retryAfterHdr, 10);
            waitMs = Number.isFinite(n) && n > 0 ? n * 1000 : BACKOFF_BASE_MS << attempt;
        }
        else {
            waitMs = BACKOFF_BASE_MS << attempt;
        }
        logger_1.logger.warn(`[TTS][MiniMax] 429 RateQuota, sleep ${waitMs}ms 后重试 (${attempt + 1}/${MAX_429_RETRIES})`);
        await new Promise((r) => setTimeout(r, waitMs));
    }
    if (!response.ok) {
        throw new Error(`MiniMax TTS HTTP ${response.status}: ${respText.slice(0, 300)}`);
    }
    let json;
    try {
        json = JSON.parse(respText);
    }
    catch {
        throw new Error(`MiniMax TTS 响应非 JSON: ${respText.slice(0, 300)}`);
    }
    // 错误检查:百炼标准错误结构(顶层 code/message)或 MiniMax 自有结构(output.base_resp)
    if (json?.code) {
        throw new Error(`MiniMax TTS 业务码异常 code=${json.code} msg=${json.message || ''}`);
    }
    const baseResp = json?.output?.base_resp;
    if (baseResp && Number(baseResp.status_code) !== 0) {
        throw new Error(`MiniMax TTS 失败 status_code=${baseResp.status_code} msg=${baseResp.status_msg || ''}`);
    }
    // 拿音频:url 优先(我们设了 output_format=url),hex 兜底
    const audioField = json?.output?.data?.audio;
    if (!audioField || typeof audioField !== 'string') {
        throw new Error(`MiniMax TTS 响应无音频数据: ${respText.slice(0, 300)}`);
    }
    let audioBuf;
    if (/^https?:\/\//i.test(audioField)) {
        // URL 模式:下载临时音频 URL
        logger_1.logger.info(`[TTS][MiniMax] downloading ${audioField.slice(0, 80)}...`);
        let dl;
        try {
            dl = await netFetch(audioField, { signal: AbortSignal.timeout(30000) });
        }
        catch (err) {
            throw new Error(`MiniMax TTS 下载音频网络异常: ${String(err?.message || err)}`);
        }
        if (!dl.ok)
            throw new Error(`MiniMax TTS 下载音频失败 HTTP ${dl.status}`);
        audioBuf = Buffer.from(await dl.arrayBuffer());
    }
    else {
        // hex 模式:直接 decode
        audioBuf = Buffer.from(audioField, 'hex');
    }
    if (audioBuf.length < 100) {
        throw new Error(`MiniMax TTS 音频过短(${audioBuf.length} 字节)`);
    }
    fs_1.default.mkdirSync(path_1.default.dirname(opts.outPath), { recursive: true });
    fs_1.default.writeFileSync(opts.outPath, audioBuf);
    logger_1.logger.info(`[TTS][MiniMax] synthesize ok voice=${opts.voice} bytes=${audioBuf.length} chars=${text.length}`);
    return opts.outPath;
}
function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}
//# sourceMappingURL=tts-minimax.js.map