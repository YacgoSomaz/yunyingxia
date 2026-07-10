"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMiniMaxCloneVoice = createMiniMaxCloneVoice;
exports.deleteMiniMaxCloneVoice = deleteMiniMaxCloneVoice;
/**
 * MiniMax 声音复刻 — 通过阿里云百炼接入
 *
 * 文档:https://help.aliyun.com/zh/model-studio/mini-clone-api
 *
 * 关键点:
 *   - **跟 MiniMax 合成走同一个端点**:/api/v1/services/aigc/multimodal-generation/generation
 *     不是 cosyvoice 那条 /services/audio/tts/customization
 *   - 用同一把百炼 sk-xxx,不需要新申请 MiniMax 官方 key
 *   - input.action = 'voice_clone'
 *   - voice_id **由调用方生成并提交**(8-256 字符,首字母 [A-Za-z],只允许 [A-Za-z0-9_-],
 *     不能以 -/_ 结尾)。**API 不返回 voice_id**,调用方持久化自己提交的那个
 *   - 音频通过 audio_url 传(URL-based,不用 multipart 上传),mp3/m4a/wav,10s-5min,≤20MB
 *   - 跟 cosyvoice 一样,oss:// URL 配 X-DashScope-OssResourceResolve: enable header 可被百炼解析
 *   - 计费:¥9.9 一次性解锁/音色 + 后续合成按 ¥3.5/万字
 *
 * 流程:
 *   uploadFileToDashscope() → oss:// URL
 *   → createMiniMaxCloneVoice(ossUrl, prefix, refText) 拼调用方生成的 voice_id
 *   → 返回 voice_id 入库
 */
const logger_1 = require("../utils/logger");
const electron_1 = require("electron");
const crypto_1 = __importDefault(require("crypto"));
const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
/** 用 Electron net.fetch 走 Chrome 网络栈 */
function netFetch(url, init) {
    return (electron_1.net?.fetch || fetch)(url, init);
}
/**
 * 生成符合 MiniMax voice_id 规则的字符串:
 *   - 首字母:小写字母
 *   - 长度:8-256 字符
 *   - 只允许 [A-Za-z0-9_-]
 *   - 不能以 -/_ 结尾
 *
 * 我们用 `qs{prefix}{12位hex}` 模式 — qs 是 qianshan 缩写,prefix 是用户给的名字清洗后,
 * 12 位 hex 来自 crypto.randomBytes(6),保证全局唯一。
 */
function generateMiniMaxVoiceId(rawPrefix) {
    const safePrefix = (rawPrefix || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8) || 'voice';
    const random = crypto_1.default.randomBytes(6).toString('hex'); // 12 字符 hex
    // qs + safePrefix(≤8) + random(12) = 长度在 14-22 之间,远超 8 起,远低于 256
    // 首字母 q,符合"小写字母开头"
    return `qs${safePrefix}${random}`;
}
/**
 * 创建 MiniMax 克隆音色 → 返回 voice_id(我们自己生成提交的那个)
 *
 * 失败会抛 Error,调用方自己处理(不要吞,让 cloneCustomVoice 把错误回给前端)
 */
async function createMiniMaxCloneVoice(opts) {
    if (!opts.apiKey)
        throw new Error('MiniMax 克隆:apiKey 缺失(百炼 sk-xxx)');
    if (!opts.audioUrl)
        throw new Error('MiniMax 克隆:audioUrl 缺失');
    if (!opts.model)
        throw new Error('MiniMax 克隆:model 缺失(如 MiniMax/speech-2.8-hd)');
    if (!opts.refText || opts.refText.length < 5) {
        throw new Error('MiniMax 克隆:refText 至少 5 字');
    }
    if (opts.refText.length > 1000) {
        throw new Error(`MiniMax 克隆:refText ${opts.refText.length} 字超过 1000 字限制`);
    }
    const voiceId = generateMiniMaxVoiceId(opts.prefix);
    const body = {
        model: opts.model,
        input: {
            action: 'voice_clone',
            voice_id: voiceId,
            audio_url: opts.audioUrl,
            text: opts.refText,
            // 中文优先,英文音频请用户自己改或不传
            language_boost: 'Chinese',
            need_noise_reduction: false,
            need_volume_normalization: false,
        },
    };
    logger_1.logger.info(`[TTS][MiniMaxClone] POST voice_clone voice_id=${voiceId} prefix=${opts.prefix} url=${opts.audioUrl.slice(0, 60)}...`);
    let response;
    try {
        response = await netFetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${opts.apiKey}`,
                // 跟 cosyvoice 克隆一致:让百炼解析 oss:// 内部 URL
                'X-DashScope-OssResourceResolve': 'enable',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000),
        });
    }
    catch (err) {
        throw new Error(`MiniMax 克隆网络异常: ${String(err?.message || err)}`);
    }
    const respText = await response.text();
    if (!response.ok) {
        throw new Error(`MiniMax 克隆 HTTP ${response.status}: ${respText.slice(0, 400)}`);
    }
    let json;
    try {
        json = JSON.parse(respText);
    }
    catch {
        throw new Error(`MiniMax 克隆响应非 JSON: ${respText.slice(0, 300)}`);
    }
    // 错误检查:百炼标准结构 + MiniMax base_resp
    if (json?.code) {
        throw new Error(`MiniMax 克隆业务码异常 code=${json.code} msg=${json.message || ''}`);
    }
    const baseResp = json?.output?.base_resp;
    if (baseResp && Number(baseResp.status_code) !== 0) {
        throw new Error(`MiniMax 克隆失败 status_code=${baseResp.status_code} msg=${baseResp.status_msg || ''}`);
    }
    // demo_audio 是预览音频 URL,我们暂时不用(前端可以选听 voice 试听走 dispatchTTS)
    const demoAudio = json?.output?.demo_audio;
    logger_1.logger.info(`[TTS][MiniMaxClone] success voice_id=${voiceId} demo=${demoAudio ? 'yes' : 'no'}`);
    return voiceId;
}
/**
 * 删除 MiniMax 克隆音色
 *
 * 注:百炼 MiniMax 当前文档没明确给 delete_voice action(2026-05),
 * 这里采用 best-effort:尝试发 action='delete_voice',失败也不阻塞业务(本地 DB 删掉即可,
 * 远端音色顶多占用配额名,不影响合成)。
 */
async function deleteMiniMaxCloneVoice(opts) {
    if (!opts.apiKey || !opts.voiceId)
        return;
    const body = {
        model: opts.model,
        input: {
            action: 'delete_voice',
            voice_id: opts.voiceId,
        },
    };
    try {
        const response = await netFetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) {
            logger_1.logger.info(`[TTS][MiniMaxClone] deleted voice_id=${opts.voiceId}`);
        }
        else {
            const txt = await response.text().catch(() => '');
            logger_1.logger.warn(`[TTS][MiniMaxClone] delete_voice HTTP ${response.status}: ${txt.slice(0, 200)}`);
        }
    }
    catch (err) {
        logger_1.logger.warn(`[TTS][MiniMaxClone] delete_voice 异常(吞掉): ${String(err)}`);
    }
}
//# sourceMappingURL=tts-minimax-clone.js.map