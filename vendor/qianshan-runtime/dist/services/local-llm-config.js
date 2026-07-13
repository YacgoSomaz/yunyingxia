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
function maskKey(key) {
    if (!key)
        return '';
    if (key.length <= 10)
        return `${key.slice(0, 3)}***`;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
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
            provider: DEFAULT_PROVIDER,
            baseUrl: DEFAULT_BASE_URL,
            model: DEFAULT_MODEL,
            providerPresets: LLM_PROVIDER_PRESETS,
        };
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
    async getPublicConfig() {
        const raw = this.readRaw();
        const apiKey = raw ? this.resolveSecret(raw) : '';
        return {
            configured: !!(raw?.enabled && apiKey),
            provider: normalizeProvider(raw?.provider),
            baseUrl: raw?.baseUrl || DEFAULT_BASE_URL,
            model: raw?.model || DEFAULT_MODEL,
            maskedKey: maskKey(apiKey),
            source: raw?.enabled && apiKey ? 'local' : 'none',
            providerPresets: LLM_PROVIDER_PRESETS,
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
    async remove() {
        const file = this.filePath();
        if ((0, fs_1.existsSync)(file)) {
            (0, fs_1.unlinkSync)(file);
        }
        return this.getPublicConfig();
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
}
exports.LocalLLMConfigService = LocalLLMConfigService;
exports.localLlmConfig = new LocalLLMConfigService();
//# sourceMappingURL=local-llm-config.js.map
