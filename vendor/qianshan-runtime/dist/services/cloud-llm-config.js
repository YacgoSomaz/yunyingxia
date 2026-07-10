"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCloudConfigs = getCloudConfigs;
exports.getDecryptedKey = getDecryptedKey;
exports.getCloudDefault = getCloudDefault;
exports.getCloudConfigById = getCloudConfigById;
exports.getAllCloudConfigsWithKeys = getAllCloudConfigsWithKeys;
exports.syncFromLocal = syncFromLocal;
exports.clearCloudCache = clearCloudCache;
/**
 * 千山 AI 平台云端 LLM 配置桥接
 *
 * 用户在 https://qianshanai.cn/user/llm-configs 配置好的 LLM/图像/视频/语音 key,
 * 这里负责"按需"拉到 weMediaAi 用,实现"一处配置全端用"。
 *
 * 设计:
 *   - 鉴权 token 从 license.cachedMemberData 拿(verify 响应自带,5 min 心跳自动刷新)
 *   - 30s 缓存 for-client 列表,减少请求
 *   - 明文 key **不缓存**(每次按需 decrypt,key 不留盘)
 *   - 失败 / 没 token / 没配置 → 返 null,让业务层走"本地 fallback"
 *
 * 文档:
 *   docs/media-tool-llm-sync.md (qianshanai 仓库)
 */
const logger_1 = require("../utils/logger");
const license_1 = require("./license");
const CLOUD_BASE = 'https://api.qianshanai.cn/api';
const LIST_CACHE_TTL_MS = 30_000;
const listCache = new Map();
function getAccessToken() {
    const m = (0, license_1.getMemberInfo)();
    const tok = m?.accessToken;
    return typeof tok === 'string' && tok.length > 0 ? tok : null;
}
/**
 * 拉云端配置列表(只元数据,不带明文 key)。
 * 30s 缓存,reduceQPS。type 没传则不传给后端,会拉全部启用项。
 */
async function getCloudConfigs(type, opts = {}) {
    const cached = listCache.get(type);
    if (!opts.force && cached && Date.now() - cached.ts < LIST_CACHE_TTL_MS) {
        return { configs: cached.configs, defaultId: cached.defaultId };
    }
    const token = getAccessToken();
    if (!token) {
        logger_1.logger.info(`[CloudLLM] 无 accessToken,跳过云端拉取(type=${type})`);
        return null;
    }
    try {
        const r = await fetch(`${CLOUD_BASE}/user/llm-configs/for-client?type=${encodeURIComponent(type)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
            logger_1.logger.warn(`[CloudLLM] for-client HTTP ${r.status} (type=${type})`);
            if (r.status === 401)
                listCache.delete(type); // token 失效,清缓存等下次心跳
            return null;
        }
        const json = (await r.json());
        if (json.code !== 200 || !json.data) {
            logger_1.logger.warn(`[CloudLLM] for-client 业务码异常 code=${json.code} msg=${json.message}`);
            return null;
        }
        const items = (json.data.items || [])
            .filter((it) => it.enabled === 1)
            .map((it) => ({
            id: it.id,
            configType: it.configType,
            providerCode: it.providerCode,
            name: it.name,
            baseUrl: it.baseUrl,
            modelName: it.modelName,
            extraParams: it.extraParams,
            isDefault: it.isDefault,
            enabled: it.enabled,
            // apiKey 不在这里填,需要时调 getDecryptedKey
        }));
        const entry = {
            ts: Date.now(),
            configs: items,
            defaultId: json.data.defaultId ?? null,
        };
        listCache.set(type, entry);
        logger_1.logger.info(`[CloudLLM] for-client ok type=${type} count=${items.length} defaultId=${json.data.defaultId}`);
        return { configs: items, defaultId: entry.defaultId };
    }
    catch (err) {
        logger_1.logger.warn(`[CloudLLM] for-client 网络异常: ${String(err?.message || err)}`);
        return null;
    }
}
/**
 * 按 id 拉单条配置的明文 API Key。
 *
 * 缓存策略(2026-05-07 调整):
 *   - **进程内存缓存** 5 分钟,key 不写盘 / 不打日志,进程重启即丢
 *   - 单条 image / video 生成本来就要 30s-3min,网络抖动一次就降级到素材库太脆弱
 *   - 同一 cloudId 5 分钟内 hit 缓存,扛 qianshanai.cn 临时不可达
 *   - 用户在网页改了 key → cache 过期前桌面端用旧 key,延迟 5 分钟可接受
 */
const KEY_CACHE_TTL_MS = 5 * 60 * 1000;
const decryptedKeyCache = new Map();
async function getDecryptedKey(id) {
    // 命中缓存
    const cached = decryptedKeyCache.get(id);
    if (cached && Date.now() - cached.ts < KEY_CACHE_TTL_MS) {
        return cached.apiKey;
    }
    const token = getAccessToken();
    if (!token)
        return null;
    try {
        const r = await fetch(`${CLOUD_BASE}/user/llm-configs/${id}/decrypt-key`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) {
            logger_1.logger.warn(`[CloudLLM] decrypt-key HTTP ${r.status} id=${id}`);
            // 网络/服务异常但缓存里还有 key → 兜底用旧 key,延后失败
            if (cached)
                return cached.apiKey;
            return null;
        }
        const json = (await r.json());
        if (json.code !== 200 || !json.data?.apiKey) {
            logger_1.logger.warn(`[CloudLLM] decrypt-key 业务码异常 code=${json.code}`);
            if (cached)
                return cached.apiKey;
            return null;
        }
        decryptedKeyCache.set(id, { ts: Date.now(), apiKey: json.data.apiKey });
        return json.data.apiKey;
    }
    catch (err) {
        logger_1.logger.warn(`[CloudLLM] decrypt-key 网络异常: ${String(err?.message || err)}`);
        // 同样兜底:网络挂但缓存里有 → 用旧的,业务能继续跑
        if (cached)
            return cached.apiKey;
        return null;
    }
}
/**
 * 取该 type 下"用户当前默认"配置 + 明文 key,合并成 CloudConfig 一并返回。
 * 大多数业务调用方只关心"给我一个能用的 LLM/TTS Key",用这条最省心。
 *
 * 解析顺序:
 *   1. defaultId 指定的那条
 *   2. 没默认就用列表第一条(按 isDefault DESC 排序)
 *   3. 都没有 → null
 *
 * @param type 'llm' / 'image' / 'video' / 'voice'
 * @param providerHint 可选,优先选指定 provider_code 的配置(如 'aliyun_dashscope')
 *                    匹配不到时仍会回退到 default
 */
async function getCloudDefault(type, providerHint) {
    const list = await getCloudConfigs(type);
    if (!list || list.configs.length === 0)
        return null;
    let chosen;
    if (providerHint) {
        chosen = list.configs.find((c) => c.providerCode === providerHint && (c.isDefault === 1 || true));
        // providerHint 命中时优先取该 provider 下的默认或第一条
        if (chosen) {
            const def = list.configs.find((c) => c.providerCode === providerHint && c.isDefault === 1);
            if (def)
                chosen = def;
        }
    }
    if (!chosen && list.defaultId) {
        chosen = list.configs.find((c) => c.id === list.defaultId);
    }
    if (!chosen)
        chosen = list.configs[0];
    const apiKey = await getDecryptedKey(chosen.id);
    if (!apiKey) {
        logger_1.logger.warn(`[CloudLLM] getCloudDefault 拿不到明文 key id=${chosen.id} type=${type}`);
        return null;
    }
    return { ...chosen, apiKey };
}
/**
 * 按 cloud config id 查一条云端配置(不带 apiKey,只要元数据)。
 * 档位 resolveScene 用这个把 'cloud:{id}' 映射成具体的 (provider, model, baseUrl)。
 *
 * 实现:扫所有 type 缓存 + 兜底再扫一遍 — 因为调用方不一定知道 type。
 */
async function getCloudConfigById(id) {
    // 先扫所有缓存
    for (const entry of listCache.values()) {
        const hit = entry.configs.find((c) => c.id === id);
        if (hit)
            return hit;
    }
    // 兜底:把 4 个 type 的列表都拉一遍(各自 30s 缓存,实际很少触发)
    for (const t of ['llm', 'image', 'video', 'voice']) {
        const list = await getCloudConfigs(t);
        const hit = list?.configs.find((c) => c.id === id);
        if (hit)
            return hit;
    }
    return null;
}
/**
 * 拉取该 type 下"全部启用项",每条都已 decrypt 出明文 key。
 * 成本:1 次 list + N 次 decrypt 调用,适合启动时一次性灌进 LLM runtime。
 *
 * 失败任何一条 decrypt 时跳过那条但保留其他成功的。
 */
async function getAllCloudConfigsWithKeys(type) {
    const list = await getCloudConfigs(type);
    if (!list || list.configs.length === 0)
        return [];
    const results = [];
    for (const cfg of list.configs) {
        const apiKey = await getDecryptedKey(cfg.id);
        if (apiKey)
            results.push({ ...cfg, apiKey });
    }
    return results;
}
/**
 * 把本地凭证(external_credentials / llm_keys)一次性推到云端。
 * 通常在用户首次登录后调一次,做完就别再调(避免覆盖云端用户改过的)。
 */
async function syncFromLocal(items) {
    const token = getAccessToken();
    if (!token)
        return { ok: false, error: '未登录' };
    if (items.length === 0)
        return { ok: true, created: 0, updated: 0, skipped: 0 };
    try {
        const r = await fetch(`${CLOUD_BASE}/user/llm-configs/sync-from-client`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ toolCode: 'video', items }),
        });
        const json = (await r.json());
        if (!r.ok || json.code !== 200) {
            return { ok: false, error: json.message || `HTTP ${r.status}` };
        }
        // 同步完清缓存,让下次 getCloudConfigs 拉到最新
        listCache.clear();
        logger_1.logger.info(`[CloudLLM] sync-from-client ok created=${json.data?.created} updated=${json.data?.updated} skipped=${json.data?.skipped}`);
        return {
            ok: true,
            created: json.data?.created,
            updated: json.data?.updated,
            skipped: json.data?.skipped,
        };
    }
    catch (err) {
        logger_1.logger.warn(`[CloudLLM] sync-from-client 网络异常: ${String(err?.message || err)}`);
        return { ok: false, error: String(err?.message || err) };
    }
}
/** 用户登出 / 切账号时调,清掉所有 type 的缓存 */
function clearCloudCache() {
    listCache.clear();
    logger_1.logger.info('[CloudLLM] 缓存已清');
}
//# sourceMappingURL=cloud-llm-config.js.map