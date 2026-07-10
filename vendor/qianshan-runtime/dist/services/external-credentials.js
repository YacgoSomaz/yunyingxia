"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.externalCreds = exports.EXTERNAL_PROVIDER_META = void 0;
/**
 * 外部 API 凭据管理（Pixabay / Pexels 等）
 *
 * 设计决策：
 * - 加密存储（跟 LLM key 一样走 cryptoStorage）
 * - 启动时把所有已配置 key 挂到一个 runtime cache，运行时 O(1) 读
 * - 设计上跟 image-search.ts 解耦：service 暴露 getCredential(provider)，
 *   image-search 不直接读 DB
 */
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const crypto_storage_1 = require("../utils/crypto-storage");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
const SUPPORTED_PROVIDERS = [
    'pexels',
    'unsplash',
    'siliconflow',
    // 阿里云百炼 —— TTS（CosyVoice2）+ HappyHorse 视频共用同一 dashscope key
    'happyhorse',
];
exports.EXTERNAL_PROVIDER_META = {
    pexels: {
        label: 'Pexels（图片素材）',
        signupUrl: 'https://www.pexels.com/join/',
        docUrl: 'https://www.pexels.com/api/',
    },
    unsplash: {
        label: 'Unsplash（图片素材 · 推荐）',
        signupUrl: 'https://unsplash.com/developers',
        docUrl: 'https://unsplash.com/documentation',
    },
    siliconflow: {
        label: 'SiliconFlow（视频洗稿 · 语音识别）',
        signupUrl: 'https://cloud.siliconflow.cn/',
        docUrl: 'https://docs.siliconflow.cn/',
    },
    happyhorse: {
        label: '阿里云百炼（视频 + 配音）',
        signupUrl: 'https://bailian.console.aliyun.com/',
        docUrl: 'https://help.aliyun.com/zh/model-studio/',
    },
};
/**
 * 内置免费图库 key（千山自掏腰包提供，用户零配置开箱即用）。
 *
 * Pexels / Unsplash 都允许这种共享方式，每分钟限流而已不禁止。
 * 用户量大了如果撞到限流，会自然降级（搜不到图就走 AI 图）。
 *
 * 部署时通过环境变量注入：
 *   - 开发：在 packages/main/.env 文件填 PEXELS_API_KEY / UNSPLASH_API_KEY
 *   - 生产：打包时把环境变量编进二进制（Electron Forge 配置 env）
 *
 * 用户在 UI 自己配的 key 优先于内置 key（user override > built-in）。
 */
const BUILTIN_KEYS = {
    pexels: process.env.PEXELS_API_KEY,
    unsplash: process.env.UNSPLASH_API_KEY,
};
class ExternalCredentialsService {
    cache = new Map();
    async init() {
        await this.reload();
    }
    /** 从 DB 刷新到内存 */
    async reload() {
        const rows = await db_1.db.select().from(schema_1.externalCredentials);
        this.cache.clear();
        for (const r of rows) {
            try {
                this.cache.set(r.provider, {
                    apiKey: crypto_storage_1.cryptoStorage.decrypt(r.apiKey),
                    baseUrl: r.baseUrl || undefined,
                });
            }
            catch (err) {
                logger_1.logger.warn(`[ExternalCreds] decrypt ${r.provider} failed: ${err}`);
            }
        }
        logger_1.logger.info(`[ExternalCreds] loaded ${this.cache.size} credentials`);
    }
    /**
     * 运行时读取 —— 给 image-search / 其他服务用。
     * 优先级：用户在 UI 配的 key > 千山内置（env）兜底 key。
     * 这样高级用户能用自己的 key（避免和别人共享配额），
     * 普通用户零配置直接用内置。
     */
    get(provider) {
        const userCred = this.cache.get(provider);
        if (userCred)
            return userCred;
        const builtin = BUILTIN_KEYS[provider];
        if (builtin)
            return { apiKey: builtin };
        return null;
    }
    /** 检查是否走内置兜底（用户没配自己的 key） */
    isUsingBuiltin(provider) {
        return !this.cache.has(provider) && !!BUILTIN_KEYS[provider];
    }
    /** 仅返回状态（不回显明文 key），给 Settings 页面列表用 */
    async listStatus() {
        const rows = await db_1.db.select().from(schema_1.externalCredentials);
        return SUPPORTED_PROVIDERS.map((p) => {
            const row = rows.find((r) => r.provider === p);
            const plain = row ? this.safeDecrypt(row.apiKey) : '';
            return {
                provider: p,
                label: exports.EXTERNAL_PROVIDER_META[p].label,
                signupUrl: exports.EXTERNAL_PROVIDER_META[p].signupUrl,
                docUrl: exports.EXTERNAL_PROVIDER_META[p].docUrl,
                configured: !!row,
                maskedKey: plain ? this.maskKey(plain) : null,
                baseUrl: row?.baseUrl || null,
            };
        });
    }
    async save(provider, apiKey, baseUrl) {
        if (!SUPPORTED_PROVIDERS.includes(provider)) {
            throw new Error(`不支持的 provider: ${provider}`);
        }
        const encrypted = crypto_storage_1.cryptoStorage.encrypt(apiKey);
        const [existing] = await db_1.db
            .select()
            .from(schema_1.externalCredentials)
            .where((0, drizzle_orm_1.eq)(schema_1.externalCredentials.provider, provider));
        if (existing) {
            await db_1.db
                .update(schema_1.externalCredentials)
                .set({ apiKey: encrypted, baseUrl: baseUrl || null, updatedAt: new Date().toISOString() })
                .where((0, drizzle_orm_1.eq)(schema_1.externalCredentials.provider, provider));
        }
        else {
            await db_1.db
                .insert(schema_1.externalCredentials)
                .values({ provider, apiKey: encrypted, baseUrl: baseUrl || null });
        }
        await this.reload();
        return { ok: true };
    }
    async remove(provider) {
        await db_1.db.delete(schema_1.externalCredentials).where((0, drizzle_orm_1.eq)(schema_1.externalCredentials.provider, provider));
        await this.reload();
        return { ok: true };
    }
    /** 轻量探活：有 key 就试调一次最小查询 */
    async test(provider) {
        const cred = this.get(provider);
        if (!cred?.apiKey)
            return { ok: false, error: '未配置 API Key' };
        try {
            if (provider === 'pexels') {
                const res = await fetch(`https://api.pexels.com/v1/search?query=test&per_page=3`, {
                    headers: { Authorization: cred.apiKey },
                });
                if (!res.ok)
                    return { ok: false, error: `HTTP ${res.status}` };
                const j = (await res.json());
                return { ok: Array.isArray(j.photos) };
            }
            if (provider === 'unsplash') {
                const res = await fetch(`https://api.unsplash.com/search/photos?query=test&per_page=3`, {
                    headers: { Authorization: `Client-ID ${cred.apiKey}` },
                });
                if (!res.ok)
                    return { ok: false, error: `HTTP ${res.status}` };
                const j = (await res.json());
                return { ok: Array.isArray(j.results) };
            }
            if (provider === 'siliconflow') {
                // 探活：拉模型列表
                const base = cred.baseUrl || 'https://api.siliconflow.cn';
                const res = await fetch(`${base}/v1/models`, {
                    headers: { Authorization: `Bearer ${cred.apiKey}` },
                });
                if (!res.ok)
                    return { ok: false, error: `HTTP ${res.status}` };
                const j = (await res.json());
                return { ok: Array.isArray(j?.data) || Array.isArray(j) };
            }
            // 阿里云百炼（TTS）—— 走 WebSocket 实合成，没有 REST 模型列表接口
            if (provider === 'happyhorse') {
                if (!/^[\x20-\x7E]+$/.test(cred.apiKey)) {
                    return { ok: false, error: 'API Key 格式错误：含非 ASCII 字符' };
                }
                if (cred.apiKey.length < 10) {
                    return { ok: false, error: 'API Key 太短，疑似无效' };
                }
                try {
                    // 完全云端化后,本地 happyhorse cred 已废弃;probeDashScope 现在要 apiKey
                    // 这里直接用本地存的那条 cred(若有) 探一下,失败就报错
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { probeDashScope } = require('./tts-dashscope');
                    return await probeDashScope(cred.apiKey);
                }
                catch (err) {
                    return { ok: false, error: String(err?.message || err) };
                }
            }
            return { ok: false, error: '未知 provider' };
        }
        catch (err) {
            return { ok: false, error: String(err?.message || err) };
        }
    }
    maskKey(k) {
        if (!k)
            return '';
        if (k.length <= 8)
            return '*'.repeat(k.length);
        return k.slice(0, 4) + '****' + k.slice(-4);
    }
    safeDecrypt(encrypted) {
        try {
            return crypto_storage_1.cryptoStorage.decrypt(encrypted);
        }
        catch {
            return '';
        }
    }
}
exports.externalCreds = new ExternalCredentialsService();
//# sourceMappingURL=external-credentials.js.map