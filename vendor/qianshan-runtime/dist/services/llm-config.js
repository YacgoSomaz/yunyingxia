"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmConfig = exports.LLMConfigService = exports.SCENE_LABELS = void 0;
// ══════════════════════════════════════════════════════════════════════
//  LLM Config 服务 — 云端 + 万山本地配置版本
//
//  做的事:
//   ① 维护 llm_routing 表(scene → providerCode + modelName),给档位/UI 用
//   ② 启动 / 登录后:从云端 user_llm_config (type=llm) 拉所有条目,
//      按 providerCode 注册到 runtime llm service 的 credentials Map
//   ③ 不再读本地 llm_keys 表,不再做 cloud→local provider 翻译,
//      下游用的 provider 字段 = 云端 user_llm_config.providerCode 字面量
//      (lingya / aliyun_dashscope / deepseek / wuyinkeji / cool / bltcy / geek)
// ══════════════════════════════════════════════════════════════════════
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
const cloud_llm_config_1 = require("./cloud-llm-config");
const local_llm_config_1 = require("./local-llm-config");
/** 启动时默认路由 —— 全部走"lingya"(云端 user_llm_config.providerCode);
 *  用户登录后会被档位系统按真实云端配置重写;若用户云端没 lingya 配置而是其它 provider,
 *  llmTierConfig.syncRoutingTable() 会按当前档位写回真实 providerCode。
 */
const DEFAULT_ROUTING = [
    { scene: 'topic_analyze', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'copy_outline', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'copy_expand', provider: 'lingya', model: 'qwen-turbo' },
    { scene: 'copy_polish', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'copy_subtitle', provider: 'lingya', model: 'qwen-turbo' },
    { scene: 'copy_title', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'copy_adapt', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'copy_rewrite', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'video_expand_prompt', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'video_translate_en', provider: 'lingya', model: 'qwen-turbo' },
    { scene: 'one_click_split', provider: 'lingya', model: 'qwen-plus' },
    { scene: 'distribute_suggest_time', provider: 'lingya', model: 'qwen-turbo' },
    { scene: 'distribute_insight', provider: 'lingya', model: 'qwen-plus' },
];
/** 场景 → 人类可读标签(前端展示用) */
exports.SCENE_LABELS = {
    topic_analyze: '选题深度分析',
    copy_outline: '文案 · 大纲',
    copy_expand: '文案 · 场景扩写',
    copy_polish: '文案 · 整体润色',
    copy_subtitle: '文案 · 字幕切分',
    copy_title: '文案 · 标题候选',
    copy_adapt: '文案 · 多平台适配',
    copy_rewrite: '文案 · 视频洗稿',
    video_expand_prompt: '视频 · 创意扩写',
    video_translate_en: '视频 · 中译英',
    one_click_split: '视频 · 一键成片分镜',
    distribute_suggest_time: '分发 · 发布时段建议',
    distribute_insight: '分发 · 数据洞察',
};
class LLMConfigService {
    /** 启动时调一次:若表为空则种默认,然后灌进 llm service */
    async init() {
        const existing = await db_1.db.select().from(schema_1.llmRouting).limit(1);
        if (existing.length === 0) {
            for (const r of DEFAULT_ROUTING) {
                try {
                    await db_1.db.insert(schema_1.llmRouting).values(r);
                }
                catch (err) {
                    logger_1.logger.warn(`[LLMConfig] seed routing ${r.scene} failed: ${err}`);
                }
            }
        }
        await this.reloadIntoRuntime();
    }
    /** 从云端 + DB routing 推到 runtime llm service。
     *  万山商业版优先使用本地模型配置;未配置本地 key 时再兼容千山云端配置;
     *  两者都没有时允许从环境变量注入 OpenAI 兼容 LLM key。真实模式缺 key
     *  会直接报错,不再静默 mock。
     */
    async reloadIntoRuntime() {
        const routing = await db_1.db.select().from(schema_1.llmRouting);
        // baseUrl 归一化:用户云端可能配裸根域名(如 https://api.wuyinkeji.com),
        // OpenAI-compat 协议要求 /v1 路径,这里统一在末尾补 /v1
        const normalizeBaseUrl = (b) => {
            if (!b)
                return undefined;
            const trimmed = b.replace(/\/+$/, '');
            if (/\/v\d+$/.test(trimmed))
                return trimmed;
            return `${trimmed}/v1`;
        };
        const envCredential = () => {
            const pairs = [
                {
                    key: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
                    baseUrl: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                    model: process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
                },
                {
                    key: process.env.DASHSCOPE_API_KEY,
                    baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
                },
                {
                    key: process.env.DEEPSEEK_API_KEY,
                    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
                    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                },
                {
                    key: process.env.SILICONFLOW_API_KEY,
                    baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
                    model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
                },
                {
                    key: process.env.ARK_API_KEY,
                    baseUrl: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
                    model: process.env.ARK_MODEL || process.env.VOLCENGINE_ARK_MODEL || '',
                },
            ];
            const hit = pairs.find((p) => typeof p.key === 'string' && p.key.trim());
            if (!hit)
                return null;
            const provider = (process.env.LLM_PROVIDER || process.env.OPENAI_PROVIDER || 'local_env').replace(/[^a-zA-Z0-9_.-]/g, '') || 'local_env';
            return {
                provider,
                apiKey: hit.key.trim(),
                baseUrl: normalizeBaseUrl(hit.baseUrl),
                model: hit.model || undefined,
            };
        };
        // 同 providerCode 多条:isDefault=1 优先,否则后写入的覆盖
        const merged = new Map();
        let cloudCount = 0;
        try {
            const cloudList = await (0, cloud_llm_config_1.getAllCloudConfigsWithKeys)('llm');
            for (const c of cloudList) {
                if (!c.providerCode || !c.apiKey)
                    continue;
                const existing = merged.get(c.providerCode);
                if (existing && c.isDefault !== 1)
                    continue;
                merged.set(c.providerCode, {
                    provider: c.providerCode,
                    apiKey: c.apiKey,
                    baseUrl: normalizeBaseUrl(c.baseUrl),
                });
                cloudCount++;
            }
        }
        catch (err) {
            logger_1.logger.warn(`[LLMConfig] 云端 LLM 配置拉取失败: ${String(err)}`);
        }
        let runtimeRouting = routing.map((r) => ({ scene: r.scene, provider: r.provider, model: r.model }));
        const decryptedKeys = Array.from(merged.values());
        const local = await local_llm_config_1.localLlmConfig.getCredential();
        if (local) {
            const provider = local.provider;
            decryptedKeys.length = 0;
            decryptedKeys.push({ provider, apiKey: local.apiKey, baseUrl: local.baseUrl, model: local.model });
            runtimeRouting = runtimeRouting.map((r) => ({ ...r, provider, model: local.model || r.model }));
            logger_1.logger.info(`[LLMConfig] using local saved LLM provider=${provider} model=${local.model || 'routing-default'}`);
        }
        if (decryptedKeys.length === 0) {
            const env = envCredential();
            if (env) {
                const provider = env.provider || 'local_env';
                const model = env.model;
                decryptedKeys.push({ provider, apiKey: env.apiKey, baseUrl: env.baseUrl, model });
                runtimeRouting = runtimeRouting.map((r) => ({ ...r, provider, model: model || r.model }));
                logger_1.logger.info(`[LLMConfig] using local env LLM provider=${provider} model=${model || 'routing-default'}`);
            }
        }
        llm_1.llm.setRouting(runtimeRouting);
        llm_1.llm.setCredentials(decryptedKeys);
        logger_1.logger.info(`[LLMConfig] loaded ${routing.length} routing, ${decryptedKeys.length} credentials (cloud=${cloudCount})`);
    }
    // ═══════════════ 场景路由 ═══════════════
    async listRouting() {
        const rows = await db_1.db.select().from(schema_1.llmRouting);
        const order = DEFAULT_ROUTING.map((r) => r.scene);
        return rows
            .slice()
            .sort((a, b) => order.indexOf(a.scene) - order.indexOf(b.scene))
            .map((r) => ({ ...r, label: exports.SCENE_LABELS[r.scene] || r.scene }));
    }
    async setRouting(entries) {
        for (const e of entries) {
            const [existing] = await db_1.db.select().from(schema_1.llmRouting).where((0, drizzle_orm_1.eq)(schema_1.llmRouting.scene, e.scene));
            if (existing) {
                await db_1.db
                    .update(schema_1.llmRouting)
                    .set({ provider: e.provider, model: e.model, updatedAt: new Date().toISOString() })
                    .where((0, drizzle_orm_1.eq)(schema_1.llmRouting.scene, e.scene));
            }
            else {
                await db_1.db.insert(schema_1.llmRouting).values({ scene: e.scene, provider: e.provider, model: e.model });
            }
        }
        await this.reloadIntoRuntime();
    }
    async resetRoutingToDefaults() {
        await db_1.db.delete(schema_1.llmRouting);
        for (const r of DEFAULT_ROUTING) {
            await db_1.db.insert(schema_1.llmRouting).values(r);
        }
        await this.reloadIntoRuntime();
    }
}
exports.LLMConfigService = LLMConfigService;
exports.llmConfig = new LLMConfigService();
//# sourceMappingURL=llm-config.js.map
