"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLONE_TARGET_MODEL = void 0;
exports.createCloneVoice = createCloneVoice;
exports.listCloneVoices = listCloneVoices;
exports.deleteCloneVoice = deleteCloneVoice;
/**
 * 阿里云百炼 - CosyVoice 声音复刻 API 封装
 *
 * 三个端点都走同一个 URL，靠 input.action 区分：
 *   - create_voice: 上传音频 → 生成 voice_id
 *   - list_voice  : 列出已有 voices
 *   - delete_voice: 按 voice_id 删除
 *
 * 调用方传 oss:// URL（来自 dashscope-file-upload）时必须带 X-DashScope-OssResourceResolve header。
 *
 * 文档：https://help.aliyun.com/zh/model-studio/developer-reference/cosyvoice-clone-api
 */
const logger_1 = require("../utils/logger");
const cloud_llm_config_1 = require("./cloud-llm-config");
/** 取百炼 apiKey:云端 voice + aliyun_dashscope。完全云端化,不再读本地 happyhorse */
async function getDashscopeKey() {
    const cloud = await (0, cloud_llm_config_1.getCloudDefault)('voice', 'aliyun_dashscope');
    if (!cloud?.apiKey) {
        throw new Error('未配置百炼 voice key,请到 qianshanai.cn/user/llm-configs 添加');
    }
    return cloud.apiKey;
}
const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization';
/** 复刻目标模型。v3.5-plus 是当前主推版（北京区） */
exports.CLONE_TARGET_MODEL = 'cosyvoice-v3.5-plus';
function authHeaders(apiKey) {
    return {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // 关键：让百炼识别 oss:// 内部 URL
        'X-DashScope-OssResourceResolve': 'enable',
    };
}
/**
 * 用音频 URL（公网 https 或百炼内部 oss://）创建一个克隆音色。
 *
 * @param audioUrl 音频 URL（推荐用 uploadFileToDashscope 返回的 oss:// URL）
 * @param prefix   仅允许小写字母+数字，<10 字符，会拼到 voice_id 里方便识别
 * @returns voice_id，形如 cosyvoice-v3.5-plus-{prefix}-xxxxxxxx
 */
async function createCloneVoice(audioUrl, prefix) {
    const apiKey = await getDashscopeKey();
    // prefix 校验:百炼要求 <=10 字符且只能小写字母+数字
    const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'voice';
    const body = {
        model: 'voice-enrollment',
        input: {
            action: 'create_voice',
            target_model: exports.CLONE_TARGET_MODEL,
            prefix: safePrefix,
            url: audioUrl,
        },
    };
    logger_1.logger.info(`[TTS][Clone] create_voice prefix=${safePrefix} url=${audioUrl.slice(0, 60)}...`);
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null));
    if (!res.ok || !json?.output?.voice_id) {
        const reason = json?.message || (await safeText(res));
        throw new Error(`百炼 create_voice 失败 HTTP ${res.status}: ${String(reason).slice(0, 200)}`);
    }
    logger_1.logger.info(`[TTS][Clone] created voice_id=${json.output.voice_id}`);
    return json.output.voice_id;
}
/** 列出当前账号下所有克隆音色（按 prefix 过滤） */
async function listCloneVoices(prefix) {
    const apiKey = await getDashscopeKey();
    const body = {
        model: 'voice-enrollment',
        input: {
            action: 'list_voice',
            ...(prefix ? { prefix } : {}),
            page_size: 100,
            page_index: 0,
        },
    };
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`百炼 list_voice 失败 HTTP ${res.status}: ${(await safeText(res)).slice(0, 200)}`);
    }
    const json = (await res.json());
    return json.output?.voice_list || [];
}
/** 按 voice_id 删除 */
async function deleteCloneVoice(voiceId) {
    const apiKey = await getDashscopeKey();
    const body = {
        model: 'voice-enrollment',
        input: { action: 'delete_voice', voice_id: voiceId },
    };
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        // 已经删过会返 4xx，吞掉但日志记下
        const txt = await safeText(res);
        logger_1.logger.warn(`[TTS][Clone] delete_voice ${voiceId} HTTP ${res.status}: ${txt.slice(0, 120)}`);
    }
    else {
        logger_1.logger.info(`[TTS][Clone] deleted voice_id=${voiceId}`);
    }
}
async function safeText(res) {
    try {
        return await res.text();
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=tts-clone.js.map