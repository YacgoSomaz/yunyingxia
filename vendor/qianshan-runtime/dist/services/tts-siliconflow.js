"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SF_PRESET_VOICES = void 0;
exports.synthesizeSFToMp3 = synthesizeSFToMp3;
exports.cloneVoice = cloneVoice;
/**
 * @deprecated 已停用 —— TTS 全量切到阿里云百炼 CosyVoice2（tts-dashscope.ts）。
 *             保留此文件仅作历史代码参考；如需重启 SF 通道，重新在 one-click.ts 中
 *             import 即可（注意 voice ID 命名空间已从 sf-* 切换到 dashscope-*）。
 *
 * 硅基流动 TTS 封装（CosyVoice2-0.5B）
 *
 * 覆盖两个能力：
 *   1. 合成：POST /v1/audio/speech，用预设音色 或 用户克隆的 voice URI
 *   2. 克隆：POST /v1/uploads/audio/voice，上传参考音频 + 文本 → 返回 voice URI
 *
 * 价格（CosyVoice2）：¥105/百万字节 UTF-8 ≈ 中文 1 万字 ¥0.3
 * 延迟：~150ms（国内服务器，快）
 *
 * 复用 SiliconFlow 凭据（同一个 key 同时用于 Kolors 图片 + TTS）
 */
const external_credentials_1 = require("./external-credentials");
const logger_1 = require("../utils/logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
/**
 * 合成文本到 mp3
 */
async function synthesizeSFToMp3(opts) {
    const cred = external_credentials_1.externalCreds.get('siliconflow');
    if (!cred?.apiKey) {
        throw new Error('SiliconFlow 未配置 API Key。设置 → 外部 API → SiliconFlow');
    }
    const base = cred.baseUrl || 'https://api.siliconflow.cn';
    const model = opts.model || DEFAULT_MODEL;
    fs_1.default.mkdirSync(path_1.default.dirname(opts.outPath), { recursive: true });
    const body = {
        model,
        input: opts.text,
        voice: opts.voice,
        response_format: 'mp3',
        speed: opts.speed ?? 1.0,
        gain: opts.gain ?? 0.0,
        sample_rate: 44100,
    };
    logger_1.logger.info(`[TTS][SF] synthesize voice=${opts.voice} len=${opts.text.length}`);
    const res = await fetch(`${base}/v1/audio/speech`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cred.apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
            const j = await res.json();
            errMsg = j?.error?.message || j?.message || errMsg;
        }
        catch {
            /* ignore */
        }
        throw new Error(`SiliconFlow TTS 失败：${errMsg}`);
    }
    // 直接把 mp3 字节流写到文件
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length < 100) {
        throw new Error(`SiliconFlow TTS 返回空音频（size=${buf.length}）`);
    }
    fs_1.default.writeFileSync(opts.outPath, buf);
    return opts.outPath;
}
/**
 * 克隆声音：上传参考音频 + 文本，返回 voice URI
 *
 * @param audioPath 本地参考音频文件路径（mp3/wav，建议 10-30 秒）
 * @param refText 该音频对应的文字内容（必须和音频内容匹配）
 * @param customName 自定义名字（字母数字下划线，不能有空格）
 * @param model 模型，默认 CosyVoice2
 * @returns voice URI，形如 "speech:my-name:xxx:yyy"，用于后续合成
 */
async function cloneVoice(audioPath, refText, customName, model = DEFAULT_MODEL) {
    const cred = external_credentials_1.externalCreds.get('siliconflow');
    if (!cred?.apiKey) {
        throw new Error('SiliconFlow 未配置 API Key');
    }
    if (!fs_1.default.existsSync(audioPath))
        throw new Error(`参考音频不存在：${audioPath}`);
    const ext = path_1.default.extname(audioPath).toLowerCase().replace('.', '') || 'mp3';
    const mime = ext === 'wav' ? 'audio/wav' :
        ext === 'm4a' ? 'audio/mp4' :
            ext === 'ogg' ? 'audio/ogg' :
                'audio/mpeg';
    const audioBuf = fs_1.default.readFileSync(audioPath);
    const base64 = audioBuf.toString('base64');
    const audioDataUri = `data:${mime};base64,${base64}`;
    // customName 规则：字母数字和下划线，不超过 32 字
    const safeName = customName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32) || 'my_voice';
    const base = cred.baseUrl || 'https://api.siliconflow.cn';
    logger_1.logger.info(`[TTS][SF] cloneVoice name=${safeName} audioBytes=${audioBuf.length}`);
    const res = await fetch(`${base}/v1/uploads/audio/voice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cred.apiKey}`,
        },
        body: JSON.stringify({
            model,
            customName: safeName,
            audio: audioDataUri,
            text: refText,
        }),
    });
    const json = (await res.json());
    if (!res.ok) {
        const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
        throw new Error(`克隆声音失败：${msg}`);
    }
    const uri = json?.uri || json?.data?.uri;
    if (!uri)
        throw new Error(`克隆成功但响应里没有 uri：${JSON.stringify(json).slice(0, 300)}`);
    logger_1.logger.info(`[TTS][SF] cloned uri=${uri.slice(0, 50)}...`);
    return { uri, customName: safeName };
}
/**
 * 硅基流动预设音色（CosyVoice2-0.5B 自带 8 个）
 */
exports.SF_PRESET_VOICES = [
    { id: 'sf-alex', voice: `${DEFAULT_MODEL}:alex`, label: 'Alex · 男·稳重中性', gender: 'male' },
    { id: 'sf-benjamin', voice: `${DEFAULT_MODEL}:benjamin`, label: 'Benjamin · 男·温柔深沉', gender: 'male' },
    { id: 'sf-charles', voice: `${DEFAULT_MODEL}:charles`, label: 'Charles · 男·成熟播音', gender: 'male' },
    { id: 'sf-david', voice: `${DEFAULT_MODEL}:david`, label: 'David · 男·年轻活力', gender: 'male' },
    { id: 'sf-anna', voice: `${DEFAULT_MODEL}:anna`, label: 'Anna · 女·清新温柔', gender: 'female' },
    { id: 'sf-bella', voice: `${DEFAULT_MODEL}:bella`, label: 'Bella · 女·甜美亲切', gender: 'female' },
    { id: 'sf-claire', voice: `${DEFAULT_MODEL}:claire`, label: 'Claire · 女·专业主播', gender: 'female' },
    { id: 'sf-diana', voice: `${DEFAULT_MODEL}:diana`, label: 'Diana · 女·成熟知性', gender: 'female' },
];
//# sourceMappingURL=tts-siliconflow.js.map