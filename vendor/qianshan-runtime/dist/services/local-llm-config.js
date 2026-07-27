"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localLlmConfig = exports.LocalLLMConfigService = void 0;
const fs_1 = require("fs");
const paths_1 = require("../utils/paths");
const crypto_storage_1 = require("../utils/crypto-storage");
const logger_1 = require("../utils/logger");
const llm_1 = require("./llm");
const STORE_FILE = 'local-llm-config.json';
const DEFAULT_PROVIDER = 'custom_openai';
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_AI_SOURCE = 'custom';
const DEFAULT_VIDEO_PROVIDER = 'custom_openai';
const DEFAULT_VIDEO_BASE_URL = '';
const DEFAULT_VIDEO_MODEL = 'wan2.7-t2v';
const DEFAULT_IMAGE_SOURCE = 'custom';
const DEFAULT_IMAGE_PROVIDER = 'custom_openai';
const DEFAULT_IMAGE_BASE_URL = '';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';
const DEFAULT_VOICE_PROVIDER = 'aliyun_dashscope';
const DEFAULT_VOICE_BASE_URL = 'https://dashscope.aliyuncs.com';
const DEFAULT_VOICE_MODEL = 'cosyvoice-v3.5-plus';
const DEFAULT_VOICE_WORKSPACE_ID = '';
const LLM_PROVIDER_PRESETS = {
    local_deepseek: {
        label: 'DeepSeek 官方',
        baseUrl: DEFAULT_BASE_URL,
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        customBaseUrl: false,
    },
    custom_openai: {
        label: '自定义 OpenAI 兼容中转站',
        baseUrl: '',
        models: [],
        customBaseUrl: true,
    },
};
const VIDEO_PROVIDER_PRESETS = {
    custom_openai: {
        label: '自定义 OpenAI 兼容视频中转站',
        baseUrl: DEFAULT_VIDEO_BASE_URL,
        models: ['wan2.7-t2v', 'wan2.2-t2v-plus', 'sora-2', 'seedance-1-0-pro'],
        customBaseUrl: true,
    },
    aliyun_dashscope: {
        label: '阿里百炼 / 通义万相视频',
        baseUrl: 'https://dashscope.aliyuncs.com',
        models: ['wan2.7-t2v', 'wan2.2-t2v-plus', 'wan2.2-t2v-flash', 'wan2.1-t2v-turbo'],
        customBaseUrl: false,
    },
    volcengine_ark: {
        label: '火山方舟 Seedance',
        baseUrl: 'https://ark.cn-beijing.volces.com',
        models: ['doubao-seedance-1-0-pro-250528', 'doubao-seedance-1-0-lite-t2v-250428'],
        customBaseUrl: false,
    },
    cool: {
        label: 'Cool / mjapi 视频中转',
        baseUrl: '',
        models: ['veo3', 'wan2.2-t2v-plus', 'seedance-1-0-pro'],
        customBaseUrl: true,
    },
    wuyinkeji: {
        label: '速创 Grok Imagine',
        baseUrl: '',
        models: ['grok_imagine'],
        customBaseUrl: true,
    },
};
const IMAGE_PROVIDER_PRESETS = {
    custom_openai: {
        label: '自定义 OpenAI 兼容图片中转站',
        baseUrl: DEFAULT_IMAGE_BASE_URL,
        models: ['gpt-image-1', 'gpt-image-2', 'seedream-5-0', 'z-image-turbo'],
        customBaseUrl: true,
    },
    aliyun_dashscope: {
        label: '阿里百炼 / 通义万相图片',
        baseUrl: 'https://dashscope.aliyuncs.com',
        models: ['wan2.2-t2i-flash', 'wanx2.1-t2i-turbo'],
        customBaseUrl: false,
    },
    volcengine: {
        label: '火山方舟 Seedream',
        baseUrl: 'https://ark.cn-beijing.volces.com',
        models: ['seedream-5-0', 'doubao-seedream-3-0-t2i-250415'],
        customBaseUrl: false,
    },
    cool: {
        label: 'Cool / mjapi 图片中转',
        baseUrl: '',
        models: ['gpt-image-1', 'seedream-5-0'],
        customBaseUrl: true,
    },
    wuyinkeji: {
        label: '速创图片中转',
        baseUrl: '',
        models: ['image_gpt'],
        customBaseUrl: true,
    },
};
const VOICE_PROVIDER_PRESETS = {
    aliyun_dashscope: {
        label: '阿里百炼 CosyVoice 声音克隆',
        baseUrl: DEFAULT_VOICE_BASE_URL,
        models: ['cosyvoice-v3.5-plus', 'cosyvoice-v3-flash'],
        customBaseUrl: false,
    },
    aliyun_minimax: {
        label: '阿里百炼 MiniMax 声音克隆',
        baseUrl: DEFAULT_VOICE_BASE_URL,
        models: ['MiniMax/speech-2.8-hd', 'MiniMax/speech-2.8-turbo', 'MiniMax/speech-02-hd', 'MiniMax/speech-02-turbo'],
        customBaseUrl: false,
    },
};
function normalizeProvider(provider) {
    const cleaned = String(provider || DEFAULT_PROVIDER).trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    return cleaned || DEFAULT_PROVIDER;
}
function normalizeBaseUrl(baseUrl, provider = DEFAULT_PROVIDER) {
    const providerCode = normalizeProvider(provider);
    const preset = LLM_PROVIDER_PRESETS[providerCode] || LLM_PROVIDER_PRESETS.custom_openai;
    const raw = String(baseUrl || preset.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    if (!raw) {
        throw new Error('请填写 API 地址');
    }
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        throw new Error('Base URL 格式不正确');
    }
    const normalized = parsed.toString().replace(/\/+$/, '');
    if (/\/v\d+$/.test(normalized))
        return normalized;
    return `${normalized}/v1`;
}
function normalizeModel(model, provider = DEFAULT_PROVIDER) {
    const value = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    return value;
}
function normalizeVideoProvider(provider) {
    const cleaned = String(provider || DEFAULT_VIDEO_PROVIDER).trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    return VIDEO_PROVIDER_PRESETS[cleaned] ? cleaned : DEFAULT_VIDEO_PROVIDER;
}
function normalizeVideoBaseUrl(baseUrl, provider = DEFAULT_VIDEO_PROVIDER) {
    const providerCode = normalizeVideoProvider(provider);
    const preset = VIDEO_PROVIDER_PRESETS[providerCode] || VIDEO_PROVIDER_PRESETS.custom_openai;
    const raw = String(baseUrl || preset.baseUrl || '').trim().replace(/\/+$/, '');
    if (!raw && providerCode !== 'aliyun_dashscope' && providerCode !== 'volcengine_ark') {
        throw new Error('请填写视频 API 地址');
    }
    const fallback = providerCode === 'aliyun_dashscope'
        ? 'https://dashscope.aliyuncs.com'
        : providerCode === 'volcengine_ark'
            ? 'https://ark.cn-beijing.volces.com'
            : raw;
    let parsed;
    try {
        parsed = new URL(fallback);
    }
    catch {
        throw new Error('视频 Base URL 格式不正确');
    }
    const normalized = parsed.toString().replace(/\/+$/, '');
    if (providerCode === 'aliyun_dashscope' || providerCode === 'volcengine_ark' || providerCode === 'cool' || providerCode === 'wuyinkeji') {
        return normalized.replace(/\/v\d+$/i, '');
    }
    if (/\/v\d+$/.test(normalized))
        return normalized;
    return `${normalized}/v1`;
}
function normalizeVideoModel(model, provider = DEFAULT_VIDEO_PROVIDER) {
    const providerCode = normalizeVideoProvider(provider);
    const preset = VIDEO_PROVIDER_PRESETS[providerCode] || VIDEO_PROVIDER_PRESETS.custom_openai;
    const firstPresetModel = Array.isArray(preset.models) && preset.models.length ? preset.models[0] : DEFAULT_VIDEO_MODEL;
    return String(model || firstPresetModel || DEFAULT_VIDEO_MODEL).trim() || DEFAULT_VIDEO_MODEL;
}
function normalizeImageSource(source) {
    return source === 'official' ? 'official' : DEFAULT_IMAGE_SOURCE;
}
function normalizeImageProvider(provider) {
    const cleaned = String(provider || DEFAULT_IMAGE_PROVIDER).trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    return IMAGE_PROVIDER_PRESETS[cleaned] ? cleaned : DEFAULT_IMAGE_PROVIDER;
}
function normalizeImageBaseUrl(baseUrl, provider = DEFAULT_IMAGE_PROVIDER) {
    const providerCode = normalizeImageProvider(provider);
    const preset = IMAGE_PROVIDER_PRESETS[providerCode] || IMAGE_PROVIDER_PRESETS.custom_openai;
    const raw = String(baseUrl || preset.baseUrl || '').trim().replace(/\/+$/, '');
    if (!raw && providerCode !== 'aliyun_dashscope' && providerCode !== 'volcengine') {
        throw new Error('请填写图片 API 地址');
    }
    const fallback = providerCode === 'aliyun_dashscope'
        ? 'https://dashscope.aliyuncs.com'
        : providerCode === 'volcengine'
            ? 'https://ark.cn-beijing.volces.com'
            : raw;
    let parsed;
    try {
        parsed = new URL(fallback);
    }
    catch {
        throw new Error('图片 Base URL 格式不正确');
    }
    const normalized = parsed.toString().replace(/\/+$/, '');
    if (providerCode === 'aliyun_dashscope' || providerCode === 'volcengine' || providerCode === 'cool' || providerCode === 'wuyinkeji') {
        return normalized.replace(/\/v\d+$/i, '');
    }
    if (/\/v\d+$/.test(normalized))
        return normalized;
    return `${normalized}/v1`;
}
function normalizeImageModel(model, provider = DEFAULT_IMAGE_PROVIDER) {
    const providerCode = normalizeImageProvider(provider);
    const preset = IMAGE_PROVIDER_PRESETS[providerCode] || IMAGE_PROVIDER_PRESETS.custom_openai;
    const firstPresetModel = Array.isArray(preset.models) && preset.models.length ? preset.models[0] : DEFAULT_IMAGE_MODEL;
    return String(model || firstPresetModel || DEFAULT_IMAGE_MODEL).trim() || DEFAULT_IMAGE_MODEL;
}
function normalizeVoiceProvider(provider) {
    const cleaned = String(provider || DEFAULT_VOICE_PROVIDER).trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    return VOICE_PROVIDER_PRESETS[cleaned] ? cleaned : DEFAULT_VOICE_PROVIDER;
}
function normalizeVoiceBaseUrl(baseUrl, provider = DEFAULT_VOICE_PROVIDER) {
    const providerCode = normalizeVoiceProvider(provider);
    const preset = VOICE_PROVIDER_PRESETS[providerCode] || VOICE_PROVIDER_PRESETS.aliyun_dashscope;
    const raw = String(baseUrl || preset.baseUrl || DEFAULT_VOICE_BASE_URL).trim().replace(/\/+$/, '');
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        throw new Error('口播 Base URL 格式不正确');
    }
    return parsed.toString().replace(/\/+$/, '').replace(/\/v\d+$/i, '');
}
function normalizeVoiceModel(model, provider = DEFAULT_VOICE_PROVIDER) {
    const providerCode = normalizeVoiceProvider(provider);
    const preset = VOICE_PROVIDER_PRESETS[providerCode] || VOICE_PROVIDER_PRESETS.aliyun_dashscope;
    const firstPresetModel = Array.isArray(preset.models) && preset.models.length ? preset.models[0] : DEFAULT_VOICE_MODEL;
    return String(model || firstPresetModel || DEFAULT_VOICE_MODEL).trim() || DEFAULT_VOICE_MODEL;
}
function normalizeVoiceWorkspaceId(workspaceId) {
    return String(workspaceId || DEFAULT_VOICE_WORKSPACE_ID).trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
}
function maskKey(key) {
    if (!key)
        return '';
    if (key.length <= 10)
        return `${key.slice(0, 3)}***`;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
function normalizeAiSource(source) {
    return source === 'official' ? 'official' : DEFAULT_AI_SOURCE;
}
class LocalLLMConfigService {
    filePath() {
        return (0, paths_1.dataDir)(STORE_FILE);
    }
    readRaw() {
        const file = this.filePath();
        if (!(0, fs_1.existsSync)(file))
            return null;
        try {
            return JSON.parse((0, fs_1.readFileSync)(file, 'utf8'));
        }
        catch (err) {
            logger_1.logger.warn(`[LocalLLMConfig] read failed: ${String(err)}`);
            return null;
        }
    }
    resolveSecret(raw) {
        const stored = raw?.encryptedApiKey || raw?.apiKey || '';
        return crypto_storage_1.cryptoStorage.decrypt(stored);
    }
    getDefaults() {
        return {
            aiSource: DEFAULT_AI_SOURCE,
            provider: DEFAULT_PROVIDER,
            baseUrl: DEFAULT_BASE_URL,
            model: DEFAULT_MODEL,
            providerPresets: LLM_PROVIDER_PRESETS,
        };
    }
    async getAiSource() {
        const raw = this.readRaw();
        return normalizeAiSource(raw?.aiSource);
    }
    async getCredential() {
        const raw = this.readRaw();
        if (!raw?.enabled)
            return null;
        const apiKey = this.resolveSecret(raw);
        if (!apiKey)
            return null;
        try {
            return {
                provider: normalizeProvider(raw.provider),
                apiKey,
                baseUrl: normalizeBaseUrl(raw.baseUrl, raw.provider),
                model: normalizeModel(raw.model, raw.provider),
            };
        }
        catch (err) {
            logger_1.logger.warn(`[LocalLLMConfig] saved config rejected: ${String(err?.message || err)}`);
            return null;
        }
    }
    resolveVideoRaw(raw) {
        return raw?.video || null;
    }
    resolveVideoSecret(raw) {
        const video = this.resolveVideoRaw(raw);
        const stored = video?.encryptedApiKey || video?.apiKey || '';
        return crypto_storage_1.cryptoStorage.decrypt(stored);
    }
    async getVideoCredential() {
        const raw = this.readRaw();
        const video = this.resolveVideoRaw(raw);
        if (!video?.enabled)
            return null;
        const apiKey = this.resolveVideoSecret(raw);
        if (!apiKey)
            return null;
        try {
            const providerCode = normalizeVideoProvider(video.provider);
            return {
                providerCode,
                provider: providerCode,
                apiKey,
                baseUrl: normalizeVideoBaseUrl(video.baseUrl, providerCode),
                model: normalizeVideoModel(video.model, providerCode),
                source: 'local-video',
            };
        }
        catch (err) {
            logger_1.logger.warn(`[LocalLLMConfig] saved video config rejected: ${String(err?.message || err)}`);
            return null;
        }
    }
    resolveImageRaw(raw) {
        return raw?.image || null;
    }
    resolveImageSecret(raw) {
        const image = this.resolveImageRaw(raw);
        const stored = image?.encryptedApiKey || image?.apiKey || '';
        return crypto_storage_1.cryptoStorage.decrypt(stored);
    }
    resolveVoiceRaw(raw) {
        return raw?.voice || null;
    }
    resolveVoiceSecret(raw) {
        const voice = this.resolveVoiceRaw(raw);
        const stored = voice?.encryptedApiKey || voice?.apiKey || '';
        return crypto_storage_1.cryptoStorage.decrypt(stored);
    }
    async getImageSource() {
        const raw = this.readRaw();
        return normalizeImageSource(raw?.imageSource);
    }
    async getImageCredential() {
        const raw = this.readRaw();
        const image = this.resolveImageRaw(raw);
        if (!image?.enabled)
            return null;
        const apiKey = this.resolveImageSecret(raw);
        if (!apiKey)
            return null;
        try {
            const providerCode = normalizeImageProvider(image.provider);
            return {
                providerCode,
                provider: providerCode,
                apiKey,
                baseUrl: normalizeImageBaseUrl(image.baseUrl, providerCode),
                model: normalizeImageModel(image.model, providerCode),
                source: 'local-image',
            };
        }
        catch (err) {
            logger_1.logger.warn(`[LocalLLMConfig] saved image config rejected: ${String(err?.message || err)}`);
            return null;
        }
    }
    async getVoiceCredential() {
        const raw = this.readRaw();
        const voice = this.resolveVoiceRaw(raw);
        if (!voice?.enabled)
            return null;
        const apiKey = this.resolveVoiceSecret(raw);
        if (!apiKey)
            return null;
        try {
            const providerCode = normalizeVoiceProvider(voice.provider);
            return {
                providerCode,
                provider: providerCode,
                apiKey,
                baseUrl: normalizeVoiceBaseUrl(voice.baseUrl, providerCode),
                model: normalizeVoiceModel(voice.model, providerCode),
                workspaceId: normalizeVoiceWorkspaceId(voice.workspaceId),
                source: 'local-voice',
            };
        }
        catch (err) {
            logger_1.logger.warn(`[LocalLLMConfig] saved voice config rejected: ${String(err?.message || err)}`);
            return null;
        }
    }
    async getPublicConfig() {
        const raw = this.readRaw();
        const apiKey = raw ? this.resolveSecret(raw) : '';
        return {
            aiSource: normalizeAiSource(raw?.aiSource),
            configured: !!(raw?.enabled && apiKey),
            provider: normalizeProvider(raw?.provider),
            baseUrl: raw?.baseUrl || DEFAULT_BASE_URL,
            model: raw?.model || DEFAULT_MODEL,
            maskedKey: maskKey(apiKey),
            source: raw?.enabled && apiKey ? 'local' : 'none',
            providerPresets: LLM_PROVIDER_PRESETS,
        };
    }
    async saveAiSource(input) {
        const existing = this.readRaw() || {};
        const record = {
            ...existing,
            aiSource: normalizeAiSource(input?.aiSource),
            sourceUpdatedAt: new Date().toISOString(),
        };
        (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(record, null, 2), 'utf8');
        return this.getPublicConfig();
    }
    async getVideoPublicConfig() {
        const raw = this.readRaw();
        const video = this.resolveVideoRaw(raw);
        const apiKey = raw ? this.resolveVideoSecret(raw) : '';
        const provider = normalizeVideoProvider(video?.provider);
        return {
            configured: !!(video?.enabled && apiKey),
            provider,
            baseUrl: video?.baseUrl || VIDEO_PROVIDER_PRESETS[provider]?.baseUrl || DEFAULT_VIDEO_BASE_URL,
            model: video?.model || normalizeVideoModel('', provider),
            maskedKey: maskKey(apiKey),
            source: video?.enabled && apiKey ? 'local-video' : 'none',
            providerPresets: VIDEO_PROVIDER_PRESETS,
        };
    }
    async getImagePublicConfig() {
        const raw = this.readRaw();
        const image = this.resolveImageRaw(raw);
        const apiKey = raw ? this.resolveImageSecret(raw) : '';
        const provider = normalizeImageProvider(image?.provider);
        return {
            imageSource: normalizeImageSource(raw?.imageSource),
            configured: !!(image?.enabled && apiKey),
            provider,
            baseUrl: image?.baseUrl || IMAGE_PROVIDER_PRESETS[provider]?.baseUrl || DEFAULT_IMAGE_BASE_URL,
            model: image?.model || normalizeImageModel('', provider),
            maskedKey: maskKey(apiKey),
            source: image?.enabled && apiKey ? 'local-image' : 'none',
            providerPresets: IMAGE_PROVIDER_PRESETS,
        };
    }
    async getVoicePublicConfig() {
        const raw = this.readRaw();
        const voice = this.resolveVoiceRaw(raw);
        const apiKey = raw ? this.resolveVoiceSecret(raw) : '';
        const provider = normalizeVoiceProvider(voice?.provider);
        return {
            configured: !!(voice?.enabled && apiKey),
            provider,
            baseUrl: voice?.baseUrl || VOICE_PROVIDER_PRESETS[provider]?.baseUrl || DEFAULT_VOICE_BASE_URL,
            model: voice?.model || normalizeVoiceModel('', provider),
            workspaceId: normalizeVoiceWorkspaceId(voice?.workspaceId),
            maskedKey: maskKey(apiKey),
            source: voice?.enabled && apiKey ? 'local-voice' : 'none',
            providerPresets: VOICE_PROVIDER_PRESETS,
        };
    }
    async save(input) {
        const existing = this.readRaw();
        const previousKey = existing ? this.resolveSecret(existing) : '';
        const apiKey = String(input?.apiKey || '').trim() || previousKey;
        if (!apiKey) {
            throw new Error('请填写 API Key');
        }
        const provider = normalizeProvider(input?.provider);
        const record = {
            enabled: true,
            provider,
            baseUrl: normalizeBaseUrl(input?.baseUrl, provider),
            model: normalizeModel(input?.model, provider),
            encryptedApiKey: crypto_storage_1.cryptoStorage.encrypt(apiKey),
            updatedAt: new Date().toISOString(),
        };
        (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(record, null, 2), 'utf8');
        return this.getPublicConfig();
    }
    async saveVideo(input) {
        const existing = this.readRaw() || {};
        const previousKey = existing ? this.resolveVideoSecret(existing) : '';
        const apiKey = String(input?.apiKey || '').trim() || previousKey;
        if (!apiKey) {
            throw new Error('请填写视频 API Key');
        }
        const provider = normalizeVideoProvider(input?.provider);
        const record = {
            ...existing,
            video: {
                enabled: true,
                provider,
                baseUrl: normalizeVideoBaseUrl(input?.baseUrl, provider),
                model: normalizeVideoModel(input?.model, provider),
                encryptedApiKey: crypto_storage_1.cryptoStorage.encrypt(apiKey),
                updatedAt: new Date().toISOString(),
            },
        };
        (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(record, null, 2), 'utf8');
        return this.getVideoPublicConfig();
    }
    async saveImageSource(input) {
        const existing = this.readRaw() || {};
        const record = {
            ...existing,
            imageSource: normalizeImageSource(input?.imageSource),
            imageSourceUpdatedAt: new Date().toISOString(),
        };
        (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(record, null, 2), 'utf8');
        return this.getImagePublicConfig();
    }
    async saveImage(input) {
        const existing = this.readRaw() || {};
        const previousKey = existing ? this.resolveImageSecret(existing) : '';
        const apiKey = String(input?.apiKey || '').trim() || previousKey;
        if (!apiKey) {
            throw new Error('请填写图片 API Key');
        }
        const provider = normalizeImageProvider(input?.provider);
        const record = {
            ...existing,
            image: {
                enabled: true,
                provider,
                baseUrl: normalizeImageBaseUrl(input?.baseUrl, provider),
                model: normalizeImageModel(input?.model, provider),
                encryptedApiKey: crypto_storage_1.cryptoStorage.encrypt(apiKey),
                updatedAt: new Date().toISOString(),
            },
        };
        (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(record, null, 2), 'utf8');
        return this.getImagePublicConfig();
    }
    async saveVoice(input) {
        const existing = this.readRaw() || {};
        const previousKey = existing ? this.resolveVoiceSecret(existing) : '';
        const apiKey = String(input?.apiKey || '').trim() || previousKey;
        if (!apiKey) {
            throw new Error('请填写口播/声音克隆 API Key');
        }
        const provider = normalizeVoiceProvider(input?.provider);
        const record = {
            ...existing,
            voice: {
                enabled: true,
                provider,
                baseUrl: normalizeVoiceBaseUrl(input?.baseUrl, provider),
                model: normalizeVoiceModel(input?.model, provider),
                workspaceId: normalizeVoiceWorkspaceId(input?.workspaceId),
                encryptedApiKey: crypto_storage_1.cryptoStorage.encrypt(apiKey),
                updatedAt: new Date().toISOString(),
            },
        };
        (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(record, null, 2), 'utf8');
        return this.getVoicePublicConfig();
    }
    async remove() {
        const existing = this.readRaw();
        const file = this.filePath();
        if (existing) {
            delete existing.enabled;
            delete existing.provider;
            delete existing.baseUrl;
            delete existing.model;
            delete existing.encryptedApiKey;
            delete existing.apiKey;
            delete existing.updatedAt;
            (0, fs_1.writeFileSync)(file, JSON.stringify(existing, null, 2), 'utf8');
        }
        else if ((0, fs_1.existsSync)(file)) {
            (0, fs_1.unlinkSync)(file);
        }
        return this.getPublicConfig();
    }
    async removeVideo() {
        const existing = this.readRaw();
        if (existing?.video) {
            delete existing.video;
            (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(existing, null, 2), 'utf8');
        }
        return this.getVideoPublicConfig();
    }
    async removeImage() {
        const existing = this.readRaw();
        if (existing?.image) {
            delete existing.image;
            (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(existing, null, 2), 'utf8');
        }
        return this.getImagePublicConfig();
    }
    async removeVoice() {
        const existing = this.readRaw();
        if (existing?.voice) {
            delete existing.voice;
            (0, fs_1.writeFileSync)(this.filePath(), JSON.stringify(existing, null, 2), 'utf8');
        }
        return this.getVoicePublicConfig();
    }
    async test(input) {
        const saved = await this.getCredential();
        const provider = normalizeProvider(input?.provider || saved?.provider);
        const baseUrl = normalizeBaseUrl(input?.baseUrl || saved?.baseUrl, provider);
        const model = normalizeModel(input?.model || saved?.model || DEFAULT_MODEL, provider);
        const apiKey = String(input?.apiKey || saved?.apiKey || '').trim();
        if (!apiKey) {
            throw new Error('请填写 API Key 或先保存本地模型配置');
        }
        const startedAt = Date.now();
        const text = await llm_1.llm.testProvider(provider, model, apiKey, baseUrl);
        return {
            ok: true,
            provider,
            baseUrl,
            model,
            elapsedMs: Date.now() - startedAt,
            reply: String(text || '').slice(0, 80),
        };
    }
    async testVideo(input) {
        const saved = await this.getVideoCredential();
        const provider = normalizeVideoProvider(input?.provider || saved?.providerCode);
        const baseUrl = normalizeVideoBaseUrl(input?.baseUrl || saved?.baseUrl, provider);
        const model = normalizeVideoModel(input?.model || saved?.model || DEFAULT_VIDEO_MODEL, provider);
        const apiKey = String(input?.apiKey || saved?.apiKey || '').trim();
        if (!apiKey) {
            throw new Error('请填写视频 API Key 或先保存本地视频模型配置');
        }
        return {
            ok: true,
            provider,
            baseUrl,
            model,
            message: '视频模型配置格式有效，生成视频时将使用这组本地配置',
        };
    }
    async testImage(input) {
        const saved = await this.getImageCredential();
        const provider = normalizeImageProvider(input?.provider || saved?.providerCode);
        const baseUrl = normalizeImageBaseUrl(input?.baseUrl || saved?.baseUrl, provider);
        const model = normalizeImageModel(input?.model || saved?.model || DEFAULT_IMAGE_MODEL, provider);
        const apiKey = String(input?.apiKey || saved?.apiKey || '').trim();
        if (!apiKey) {
            throw new Error('请填写图片 API Key 或先保存本地图片模型配置');
        }
        return {
            ok: true,
            provider,
            baseUrl,
            model,
            message: '图片模型配置格式有效，生成图片时将使用这组本地配置',
        };
    }
    async testVoice(input) {
        const saved = await this.getVoiceCredential();
        const provider = normalizeVoiceProvider(input?.provider || saved?.providerCode);
        const baseUrl = normalizeVoiceBaseUrl(input?.baseUrl || saved?.baseUrl, provider);
        const model = normalizeVoiceModel(input?.model || saved?.model || DEFAULT_VOICE_MODEL, provider);
        const apiKey = String(input?.apiKey || saved?.apiKey || '').trim();
        if (!apiKey) {
            throw new Error('请填写口播 API Key 或先保存本地口播/声音克隆配置');
        }
        return {
            ok: true,
            provider,
            baseUrl,
            model,
            workspaceId: normalizeVoiceWorkspaceId(input?.workspaceId || saved?.workspaceId),
            message: '口播/声音克隆配置格式有效，克隆音色和视频配音会使用这组本地配置',
        };
    }
}
exports.LocalLLMConfigService = LocalLLMConfigService;
exports.localLlmConfig = new LocalLLMConfigService();
//# sourceMappingURL=local-llm-config.js.map
