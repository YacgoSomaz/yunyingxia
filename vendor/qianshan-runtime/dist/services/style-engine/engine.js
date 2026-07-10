"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.styleEngine = exports.StyleEngine = void 0;
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const templates_1 = require("./templates");
const builtin_presets_1 = require("./builtin-presets");
const visual_styles_1 = require("./visual-styles");
class StyleEngine {
    /** 初始化内置预设：按 (module, name) 增量 upsert
     *  老用户升级后能拿到新的 BUILTIN_PRESETS（不会重复 insert，也不覆盖用户自定义记录）
     */
    async seedBuiltinPresets() {
        const existing = await db_1.db.select().from(schema_1.stylePresets);
        // 用 (module + name) 作为去重键
        const key = (m, n) => m + '|' + n;
        const builtinKeys = new Set(existing.filter((p) => p.isBuiltin === 1).map((p) => key(p.module, p.name)));
        let inserted = 0;
        for (const preset of builtin_presets_1.BUILTIN_PRESETS) {
            if (builtinKeys.has(key(preset.module, preset.name)))
                continue;
            await db_1.db.insert(schema_1.stylePresets).values({
                name: preset.name,
                description: preset.description,
                module: preset.module,
                config: JSON.stringify(preset.config),
                isBuiltin: 1,
            });
            inserted++;
        }
        if (inserted > 0) {
            // eslint-disable-next-line no-console
            console.log(`[StyleEngine] 内置预设增量入库 ${inserted} 条`);
        }
    }
    /** 获取预设配置 */
    async getPreset(presetId) {
        const [preset] = await db_1.db.select().from(schema_1.stylePresets).where((0, drizzle_orm_1.eq)(schema_1.stylePresets.id, presetId));
        if (!preset)
            throw new Error(`Preset ${presetId} not found`);
        return JSON.parse(preset.config);
    }
    /** 获取模块所有预设 */
    async listPresets(module) {
        return db_1.db.select().from(schema_1.stylePresets).where((0, drizzle_orm_1.eq)(schema_1.stylePresets.module, module));
    }
    /** 创建自定义预设 */
    async createPreset(data) {
        return db_1.db
            .insert(schema_1.stylePresets)
            .values({
            name: data.name,
            description: data.description,
            module: data.module,
            config: JSON.stringify(data.config),
            isBuiltin: 0,
        })
            .returning();
    }
    /** 更新预设（内置只能改 name/description） */
    async updatePreset(id, data) {
        const update = {};
        if (data.name)
            update.name = data.name;
        if (data.description !== undefined)
            update.description = data.description;
        if (data.config)
            update.config = JSON.stringify(data.config);
        return db_1.db.update(schema_1.stylePresets).set(update).where((0, drizzle_orm_1.eq)(schema_1.stylePresets.id, id)).returning();
    }
    /** 删除预设（内置不可删） */
    async deletePreset(id) {
        const [preset] = await db_1.db.select().from(schema_1.stylePresets).where((0, drizzle_orm_1.eq)(schema_1.stylePresets.id, id));
        if (!preset)
            throw new Error('Preset not found');
        if (preset.isBuiltin === 1)
            throw new Error('内置预设不可删除');
        return db_1.db.delete(schema_1.stylePresets).where((0, drizzle_orm_1.eq)(schema_1.stylePresets.id, id));
    }
    /** 渲染 Prompt：将风格配置注入模板 */
    renderPrompt(templateKey, vars, style) {
        const allVars = { ...vars };
        if (style) {
            allVars.style = Object.entries(style)
                .filter(([_, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join('; ');
        }
        return (0, templates_1.renderTemplate)(templateKey, allVars);
    }
    // ─── 视觉风格模板 ───
    /**
     * 获取视觉风格配置
     * @param presetId 预设 ID（来自 stylePresets 表，module='visual'）
     * @returns 解析后的 VisualStyleConfig；找不到或解析失败时返回默认（电影写实）
     */
    async getVisualStyle(presetId) {
        if (!presetId)
            return { ...visual_styles_1.DEFAULT_VISUAL_STYLE };
        try {
            const [preset] = await db_1.db
                .select()
                .from(schema_1.stylePresets)
                .where((0, drizzle_orm_1.eq)(schema_1.stylePresets.id, presetId));
            if (!preset)
                return { ...visual_styles_1.DEFAULT_VISUAL_STYLE };
            return (0, visual_styles_1.parseVisualStyleConfig)(JSON.parse(preset.config));
        }
        catch {
            return { ...visual_styles_1.DEFAULT_VISUAL_STYLE };
        }
    }
    /** 列出所有视觉风格预设（内置 + 自定义） */
    async listVisualPresets() {
        return db_1.db.select().from(schema_1.stylePresets).where((0, drizzle_orm_1.eq)(schema_1.stylePresets.module, 'visual'));
    }
}
exports.StyleEngine = StyleEngine;
exports.styleEngine = new StyleEngine();
//# sourceMappingURL=engine.js.map