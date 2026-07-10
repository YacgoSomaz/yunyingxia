"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmTierConfig = exports.LLMTierConfigService = void 0;
// ══════════════════════════════════════════════════════════════════════
//  档位(Tier)配置服务 — 完全云端化版本
//
//  完全云端化后,"档位"概念退化成"用户云端 user_llm_config 里的哪一条"。
//  本地 TIER_MAP / cheap-recommended-premium 三档全部退役。
//
//  - llm_tier_config 表:每个 category 存 tier 字符串
//      * 'cloud:{id}'  → 用户在 qianshanai.cn 配的某条云端配置
//      * 'custom:{id}' → 老用户的本地自定义槽(兼容性保留)
//  - resolveScene / resolveCategory 只处理上面两种;都拿不到 → 返 null
//      上层(LLM service / image gen / video gen)收到 null 就报"先去网页配置"
//  - 不再做 cloud→local provider 翻译,provider 字段就是云端 providerCode 字面量
// ══════════════════════════════════════════════════════════════════════
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
const cloud_llm_config_1 = require("./cloud-llm-config");
const llm_tiers_1 = require("./llm-tiers");
/** UI 要展示的任务类(顺序即 UI 顺序) */
const ALL_CATEGORIES = ['text-fast', 'text-long', 'image', 'video', 'voice'];
class LLMTierConfigService {
    /** 启动时:若表为空则种默认档位(全部 cheap,等用户登录拉到云端再覆盖) */
    async init() {
        const existing = await db_1.db.select().from(schema_1.llmTierConfig);
        if (existing.length === 0) {
            for (const cat of ALL_CATEGORIES) {
                try {
                    await db_1.db.insert(schema_1.llmTierConfig).values({
                        category: cat,
                        tier: llm_tiers_1.DEFAULT_TIER_PER_CATEGORY[cat],
                    });
                }
                catch (err) {
                    logger_1.logger.warn(`[TierConfig] seed ${cat} failed: ${err}`);
                }
            }
            logger_1.logger.info('[TierConfig] seeded default tier config for 5 categories');
        }
    }
    // ═══════════════ 档位 CRUD ═══════════════
    async listTierConfig() {
        const rows = await db_1.db.select().from(schema_1.llmTierConfig);
        const map = new Map();
        for (const r of rows)
            map.set(r.category, r.tier);
        return ALL_CATEGORIES.map((cat) => ({
            category: cat,
            label: llm_tiers_1.CATEGORY_LABELS[cat],
            tier: map.get(cat) || llm_tiers_1.DEFAULT_TIER_PER_CATEGORY[cat],
            tierLabel: llm_tiers_1.TIER_LABELS[map.get(cat) || llm_tiers_1.DEFAULT_TIER_PER_CATEGORY[cat]] || '',
        }));
    }
    async setTier(category, tier) {
        const [existing] = await db_1.db
            .select()
            .from(schema_1.llmTierConfig)
            .where((0, drizzle_orm_1.eq)(schema_1.llmTierConfig.category, category));
        if (existing) {
            await db_1.db
                .update(schema_1.llmTierConfig)
                .set({ tier, updatedAt: new Date().toISOString() })
                .where((0, drizzle_orm_1.eq)(schema_1.llmTierConfig.category, category));
        }
        else {
            await db_1.db.insert(schema_1.llmTierConfig).values({ category, tier });
        }
        await this.syncRoutingTable();
    }
    async resetToDefaults() {
        await db_1.db.delete(schema_1.llmTierConfig);
        for (const cat of ALL_CATEGORIES) {
            await db_1.db.insert(schema_1.llmTierConfig).values({
                category: cat,
                tier: llm_tiers_1.DEFAULT_TIER_PER_CATEGORY[cat],
            });
        }
        await this.syncRoutingTable();
    }
    // ═══════════════ 自定义槽(向后兼容,完全云端化后通常空) ═══════════════
    async listCustomSlots(category) {
        const rows = category
            ? await db_1.db.select().from(schema_1.llmCustomSlots).where((0, drizzle_orm_1.eq)(schema_1.llmCustomSlots.category, category))
            : await db_1.db.select().from(schema_1.llmCustomSlots);
        return rows;
    }
    async createCustomSlot(input) {
        const inserted = await db_1.db.insert(schema_1.llmCustomSlots).values(input).returning();
        return inserted[0];
    }
    async deleteCustomSlot(id) {
        await db_1.db.delete(schema_1.llmCustomSlots).where((0, drizzle_orm_1.eq)(schema_1.llmCustomSlots.id, id));
        const refs = await db_1.db.select().from(schema_1.llmTierConfig).where((0, drizzle_orm_1.eq)(schema_1.llmTierConfig.tier, `custom:${id}`));
        for (const r of refs) {
            await db_1.db
                .update(schema_1.llmTierConfig)
                .set({ tier: llm_tiers_1.DEFAULT_TIER_PER_CATEGORY[r.category] })
                .where((0, drizzle_orm_1.eq)(schema_1.llmTierConfig.id, r.id));
        }
        await this.syncRoutingTable();
    }
    // ═══════════════ 解析:scene / category → 云端配置 ═══════════════
    async resolveTierString(tierStr, category) {
        const tier = tierStr ?? llm_tiers_1.DEFAULT_TIER_PER_CATEGORY[category];
        // 自定义槽分支(老用户)
        if (tier.startsWith('custom:')) {
            const slotId = parseInt(tier.slice(7), 10);
            const [slot] = await db_1.db
                .select()
                .from(schema_1.llmCustomSlots)
                .where((0, drizzle_orm_1.eq)(schema_1.llmCustomSlots.id, slotId));
            if (slot) {
                return { provider: slot.provider, model: slot.modelId };
            }
            // slot 不存在 → 退到默认查云端默认配置
        }
        // 云端配置分支:tier='cloud:{id}'
        if (tier.startsWith('cloud:')) {
            const cloudId = parseInt(tier.slice(6), 10);
            const cc = await (0, cloud_llm_config_1.getCloudConfigById)(cloudId);
            if (cc) {
                return {
                    provider: cc.providerCode || 'lingya',
                    model: cc.modelName,
                    providerCode: cc.providerCode,
                    baseUrl: cc.baseUrl,
                    cloudId: cc.id,
                };
            }
        }
        // 兜底:拉该 category 对应 type 的云端默认条
        // text-fast / text-long → llm  ;  image → image  ;  video → video  ;  voice → voice
        const cloudType = category === 'image' ? 'image' :
            category === 'video' ? 'video' :
                category === 'voice' ? 'voice' : 'llm';
        try {
            const list = await (0, cloud_llm_config_1.getCloudConfigs)(cloudType);
            const def = list?.configs.find((c) => c.id === list.defaultId) || list?.configs[0];
            if (def) {
                return {
                    provider: def.providerCode || 'lingya',
                    model: def.modelName,
                    providerCode: def.providerCode,
                    baseUrl: def.baseUrl,
                    cloudId: def.id,
                };
            }
        }
        catch (err) {
            logger_1.logger.warn(`[TierConfig] cloud default load fail (${cloudType}): ${String(err)}`);
        }
        return null;
    }
    /** 给 LLM 场景路由用 */
    async resolveScene(scene) {
        const category = llm_tiers_1.SCENE_TO_CATEGORY[scene];
        if (!category)
            return null;
        const [cfg] = await db_1.db
            .select()
            .from(schema_1.llmTierConfig)
            .where((0, drizzle_orm_1.eq)(schema_1.llmTierConfig.category, category));
        return this.resolveTierString(cfg?.tier, category);
    }
    /** 给图片/视频/语音直接按 category 解析用 */
    async resolveCategory(category) {
        const [cfg] = await db_1.db
            .select()
            .from(schema_1.llmTierConfig)
            .where((0, drizzle_orm_1.eq)(schema_1.llmTierConfig.category, category));
        const r = await this.resolveTierString(cfg?.tier, category);
        if (!r)
            return null;
        return {
            ...r,
            capability: 'standard',
            price: r.providerCode || null,
        };
    }
    // ═══════════════ pickActiveProvider —— UI 顶部展示用 ═══════════════
    /**
     * 拿用户云端"主活跃 LLM provider"的 providerCode(给 Settings 顶部 badge 用)。
     * 选择规则:
     *   ① 如果云端有 lingya 配置 → 'lingya'
     *   ② 否则取云端 LLM 列表里的第一条
     *   ③ 一条都没有 → null,UI 提示"先去网页配置"
     */
    async pickActiveProvider(_category) {
        try {
            const list = await (0, cloud_llm_config_1.getCloudConfigs)('llm');
            const configs = list?.configs || [];
            if (configs.length === 0)
                return null;
            const lingya = configs.find((c) => c.providerCode === 'lingya');
            if (lingya)
                return 'lingya';
            return configs[0].providerCode || null;
        }
        catch (err) {
            logger_1.logger.warn(`[TierConfig] pickActiveProvider 拉云端失败: ${String(err)}`);
            return null;
        }
    }
    // ═══════════════ 同步到 llm_routing 旧表 ═══════════════
    /** 把当前 tier config 展开成 scene 级路由,写进 llm_routing 表(给老 completeWithScene 用) */
    async syncRoutingTable() {
        const scenes = Object.keys(llm_tiers_1.SCENE_TO_CATEGORY);
        for (const scene of scenes) {
            const resolved = await this.resolveScene(scene);
            if (!resolved)
                continue;
            const [existing] = await db_1.db
                .select()
                .from(schema_1.llmRouting)
                .where((0, drizzle_orm_1.eq)(schema_1.llmRouting.scene, scene));
            if (existing) {
                await db_1.db
                    .update(schema_1.llmRouting)
                    .set({
                    provider: resolved.provider,
                    model: resolved.model,
                    updatedAt: new Date().toISOString(),
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.llmRouting.scene, scene));
            }
            else {
                await db_1.db.insert(schema_1.llmRouting).values({
                    scene,
                    provider: resolved.provider,
                    model: resolved.model,
                });
            }
        }
        const routing = await db_1.db.select().from(schema_1.llmRouting);
        llm_1.llm.setRouting(routing.map((r) => ({ scene: r.scene, provider: r.provider, model: r.model })));
        logger_1.logger.info(`[TierConfig] synced ${scenes.length} scenes to llm_routing`);
    }
    // ═══════════════ 给前端的 UI 元信息 ═══════════════
    /** Settings 页档位下拉数据 */
    async getFullConfigForUI() {
        const provider = (await this.pickActiveProvider('text-fast')) || 'lingya';
        const tierConfigs = await this.listTierConfig();
        const customSlots = await this.listCustomSlots();
        const result = [];
        // 云端配置预拉(给每个 category 列云端选项用)
        const cloudByType = await (async () => {
            try {
                const [llmList, imgList, vidList, voiceList] = await Promise.all([
                    (0, cloud_llm_config_1.getCloudConfigs)('llm'),
                    (0, cloud_llm_config_1.getCloudConfigs)('image'),
                    (0, cloud_llm_config_1.getCloudConfigs)('video'),
                    (0, cloud_llm_config_1.getCloudConfigs)('voice'),
                ]);
                return {
                    llm: llmList?.configs || [],
                    image: imgList?.configs || [],
                    video: vidList?.configs || [],
                    voice: voiceList?.configs || [],
                };
            }
            catch (err) {
                logger_1.logger.warn(`[TierConfig] cloudByType load fail: ${String(err)}`);
                return { llm: [], image: [], video: [], voice: [] };
            }
        })();
        const cloudListFor = (cat) => {
            if (cat === 'image')
                return cloudByType.image;
            if (cat === 'video')
                return cloudByType.video;
            if (cat === 'voice')
                return cloudByType.voice;
            return cloudByType.llm;
        };
        for (const cfg of tierConfigs) {
            const cat = cfg.category;
            const options = [];
            // 云端配置选项
            for (const cc of cloudListFor(cat)) {
                options.push({
                    value: `cloud:${cc.id}`,
                    label: `☁️ ${cc.name}`,
                    modelId: cc.modelName,
                    price: cc.providerCode || null,
                    kind: 'cloud',
                });
            }
            // 自定义槽(老用户兼容)
            const slotsForCat = customSlots.filter((s) => s.category === cat);
            for (const slot of slotsForCat) {
                options.push({
                    value: `custom:${slot.id}`,
                    label: `🎨 ${slot.label}`,
                    modelId: slot.modelId,
                    price: null,
                    kind: 'custom',
                });
            }
            const supports = options.length > 0;
            result.push({
                category: cat,
                label: llm_tiers_1.CATEGORY_LABELS[cat],
                currentTier: cfg.tier,
                tierOptions: options,
                activeProviderSupports: supports,
            });
        }
        return {
            activeProvider: provider,
            categories: result,
        };
    }
}
exports.LLMTierConfigService = LLMTierConfigService;
exports.llmTierConfig = new LLMTierConfigService();
//# sourceMappingURL=llm-tier-config.js.map