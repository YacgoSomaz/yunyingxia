"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeDashScopeToMp3 = synthesizeDashScopeToMp3;
exports.probeDashScope = probeDashScope;
/**
 * 阿里云百炼 CosyVoice HTTP REST TTS 封装 — 完全云端化版本
 *
 * 设计：
 *  - 走 HTTP REST 同步合成(端点
 *    https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer)
 *  - 比 WebSocket 简单得多:POST → 拿 audio.url → GET 下载 → 写盘
 *  - 鉴权:Authorization: Bearer <api-key>,**必须**由调用方传入
 *      (从 cloud-llm-config 的 voice 类配置 decrypt 得到;不再读本地 externalCreds)
 *  - 模型:cosyvoice-v3-flash(含 longanyang/longanhuan 等"龙系列"音色)
 *  - 超时:合成 60s,下载 30s(用 AbortController)
 *  - 错误透传:HTTP error / 业务 code 直接进 Error.message
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const logger_1 = require("../utils/logger");
const TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer';
/** 带超时的 fetch */
async function fetchWithTimeout(url, init, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * 单次合成 → 写 mp3。
 * 成功返回 outPath；失败抛 Error（让 dispatchTTS 走降级）。
 */
async function synthesizeDashScopeToMp3(opts) {
    // Key 必须由调用方传入(云端 user_llm_config voice 类型 decrypt)
    if (!opts.apiKey) {
        throw new Error('百炼 TTS:apiKey 缺失，请到「设置 → AI 模型/算力」填写口播/声音克隆百炼 Key');
    }
    const apiKey = opts.apiKey;
    const text = (opts.text || '').trim();
    if (!text)
        throw new Error('TTS 文案为空');
    const model = opts.model || 'cosyvoice-v3-flash';
    const voice = opts.voice;
    const format = opts.format || 'mp3';
    const sampleRate = opts.sampleRate || 22050;
    const speed = clamp(opts.speed ?? 1.0, 0.5, 2.0);
    const pitch = clamp(opts.pitch ?? 1.0, 0.5, 2.0);
    // 1) POST 请求合成
    let postRes;
    try {
        postRes = await fetchWithTimeout(TTS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: {
                    text,
                    voice,
                    format,
                    sample_rate: sampleRate,
                    volume: 50,
                    rate: speed,
                    pitch,
                    // instruction 仅在传了的时候才放入 body，避免给不支持该字段的 model 带噪音
                    ...(opts.instruction ? { instruction: opts.instruction } : {}),
                },
            }),
        }, 60_000);
    }
    catch (err) {
        throw new Error(`百炼 TTS POST 网络失败: ${String(err?.message || err)} (voice=${voice})`);
    }
    // 解析响应
    let postJson;
    try {
        postJson = await postRes.json();
    }
    catch {
        throw new Error(`百炼 TTS 响应解析失败 status=${postRes.status} (voice=${voice})`);
    }
    if (!postRes.ok) {
        const code = postJson?.code || postJson?.error?.code || postRes.status;
        const msg = postJson?.message || postJson?.error?.message || 'unknown';
        throw new Error(`百炼 TTS POST 失败 [${code}]: ${msg} (voice=${voice})`);
    }
    const audioUrl = postJson?.output?.audio?.url;
    if (!audioUrl) {
        const dump = JSON.stringify(postJson || {}).slice(0, 300);
        throw new Error(`百炼 TTS 响应无 audio.url，body=${dump}`);
    }
    logger_1.logger.info(`[TTS][DashScope] POST ok model=${model} voice=${voice} chars=${text.length}${opts.instruction ? ' [instruct=' + opts.instruction.slice(0, 40) + '...]' : ''} → fetch audio`);
    // 2) GET 音频文件（24h 有效期，立刻下完不会过期）
    let audioRes;
    try {
        audioRes = await fetchWithTimeout(audioUrl, { method: 'GET' }, 30_000);
    }
    catch (err) {
        throw new Error(`百炼 TTS 下载音频网络失败: ${String(err?.message || err)}`);
    }
    if (!audioRes.ok) {
        throw new Error(`百炼 TTS 下载音频 HTTP ${audioRes.status}`);
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    if (buf.length < 100) {
        throw new Error(`百炼 TTS 返回音频过短（${buf.length} 字节），voice=${voice}`);
    }
    // 3) 写盘
    fs_1.default.mkdirSync(path_1.default.dirname(opts.outPath), { recursive: true });
    fs_1.default.writeFileSync(opts.outPath, buf);
    logger_1.logger.info(`[TTS][DashScope] synthesize ok voice=${voice} bytes=${buf.length} chars=${text.length}`);
    return opts.outPath;
}
function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}
/**
 * 探活:合成最短文本检查百炼 Key 是否能用。
 * 完全云端化后必须由调用方传 apiKey(从 cloud-llm-config 拿)。
 */
async function probeDashScope(apiKey) {
    const tmpDir = path_1.default.join(os_1.default.tmpdir(), 'qianshan-dashscope-probe');
    fs_1.default.mkdirSync(tmpDir, { recursive: true });
    const out = path_1.default.join(tmpDir, `probe-${Date.now()}.mp3`);
    try {
        await synthesizeDashScopeToMp3({
            voice: 'longanhuan',
            text: '你好',
            outPath: out,
            apiKey,
        });
        try {
            fs_1.default.unlinkSync(out);
        }
        catch { /* swallow */ }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err?.message || err) };
    }
}
//# sourceMappingURL=tts-dashscope.js.map
