"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copywriting = exports.CopywritingService = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const llm_1 = require("./llm");
const style_engine_1 = require("./style-engine");
const content_audit_1 = require("./content-audit");
const drizzle_orm_1 = require("drizzle-orm");
const logger_1 = require("../utils/logger");
/**
 * jsonMode 下 LLM 不能返回裸数组(response_format:json_object 强制对象作根)。
 * LLM 会包成 {titles: [...]} / {items: [...]} / {data: [...]} 等,
 * 直接当数组用会抛 "X is not iterable"。本 helper 把常见包装拆掉。
 */
function unwrapJsonArray(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw && typeof raw === 'object') {
        // 优先按常见字段名拿
        const preferredKeys = ['titles', 'items', 'data', 'list', 'results', 'subtitles', 'array'];
        for (const k of preferredKeys) {
            if (Array.isArray(raw[k]))
                return raw[k];
        }
        // 兜底:找第一个值是数组的字段
        for (const v of Object.values(raw)) {
            if (Array.isArray(v))
                return v;
        }
    }
    return [];
}
// ── 平台适配规则 ──
const ADAPTATION_RULES = {
    douyin: '前 3 秒必须有钩子；多用口语和语气词；总长控制在 300 字内；多用 emoji',
    xiaohongshu: '标题必须包含数字；正文结尾加 10-15 个标签；文风真诚亲和；使用分隔符和 emoji',
    bilibili: '可以较长（500-1000 字）；内容有深度；开头引入弹幕互动引导；用词可以更专业',
    weixin: '图文形式；段落清晰；可以较长；语调正式一点',
    weibo: '短平快，280 字内，有话题标签 #xxx#',
};
class CopywritingService {
    /** 从零生成文案（多步，SSE 推送） */
    async generateFromScratch(input, sse) {
        try {
            const style = input.presetId ? await style_engine_1.styleEngine.getPreset(input.presetId) : undefined;
            // Step 1: 生成大纲
            // jsonMode 强制对象根 → LLM 把数组包成 {items:[...]} 类,unwrap 拿出来
            // 不解就 outline.length undefined,下面 for 不跑 → fullText 空 → 整个文案空
            sse.sendProgress('大纲生成', 10);
            const outlinePrompt = style_engine_1.styleEngine.renderPrompt('copy_outline', {
                topic: input.topic,
                platform: input.platform,
                notes: input.notes || '',
            }, style);
            const outlineRaw = await llm_1.llm.completeJSONWithScene('copy_outline', '文案大师', outlinePrompt);
            const outline = unwrapJsonArray(outlineRaw);
            if (outline.length === 0) {
                throw new Error('文案生成失败:大纲解析后为空,LLM 可能返回了非数组结构');
            }
            sse.sendProgress('大纲完成', 25);
            // Step 2: 逐场景扩写（流式）
            let fullText = '';
            for (let i = 0; i < outline.length; i++) {
                const scene = outline[i];
                const progress = 25 + Math.round(50 * (i / Math.max(outline.length, 1)));
                sse.sendProgress(`场景 ${i + 1}/${outline.length}`, progress);
                const expanded = await llm_1.llm.chatStreamWithScene('copy_expand', {
                    messages: [
                        { role: 'system', content: '你是短视频文案写手。' },
                        {
                            role: 'user',
                            content: style_engine_1.styleEngine.renderPrompt('copy_expand_scene', {
                                scene_title: scene.title ?? '',
                                key_points: JSON.stringify(scene.key_points ?? []),
                            }, style),
                        },
                    ],
                }, (chunk) => sse.sendChunk(chunk.content));
                fullText += expanded + '\n\n';
            }
            // Step 3: 整体润色
            sse.sendProgress('润色中', 80);
            const polished = await llm_1.llm.completeWithScene('copy_polish', '文案润色专家', style_engine_1.styleEngine.renderPrompt('copy_polish', { raw_text: fullText }, style));
            // Step 4: 生成字幕 + 8 个备选标题（并行）
            // jsonMode 下 LLM 强制对象根 → 返回可能是 {titles:[...]}/{items:[...]} 等包装,
            // unwrapJsonArray 把外层拆掉再用。
            sse.sendProgress('字幕与标题', 90);
            const [subtitlesRaw, titlesRaw] = await Promise.all([
                llm_1.llm.completeJSONWithScene('copy_subtitle', '字幕专家', style_engine_1.styleEngine.renderPrompt('copy_subtitle', { text: polished, duration: '60' })),
                llm_1.llm.completeJSONWithScene('copy_title', '标题专家', style_engine_1.styleEngine.renderPrompt('copy_title_generate', {
                    summary: polished.slice(0, 200),
                    platform: input.platform,
                })),
            ]);
            const subtitles = unwrapJsonArray(subtitlesRaw);
            const titles = unwrapJsonArray(titlesRaw);
            // 存入数据库
            const [record] = await db_1.db
                .insert(schema_1.copywritings)
                .values({
                title: titles[0]?.title || input.topic,
                topic: input.topic,
                platform: input.platform,
                outline: JSON.stringify(outline),
                scenes: JSON.stringify(outline),
                finalText: polished,
                subtitles: JSON.stringify(subtitles),
                wordCount: polished.length,
                generationMode: 'from_scratch',
                status: 'done',
                llmModel: 'mock-or-qwen',
                // 主线 A：回填来源
                topicId: input.topicId ?? null,
                sourceKeyword: input.sourceKeyword ?? input.topic ?? null,
            })
                .returning();
            // 存入标题候选
            for (const t of titles) {
                await db_1.db.insert(schema_1.titleCandidates).values({
                    copywritingId: record.id,
                    titleText: t.title,
                    style: t.style,
                });
            }
            // 内容合规审核（规则引擎先跑，high severity 才自动调 LLM）
            sse.sendProgress('合规审核', 98);
            try {
                const auditText = `${record.title}\n${polished}`;
                const audit = await content_audit_1.contentAudit.autoAudit(auditText);
                await db_1.db
                    .update(schema_1.copywritings)
                    .set({
                    auditLevel: audit.level,
                    auditResult: JSON.stringify(audit),
                    auditedAt: audit.auditedAt,
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, record.id));
            }
            catch (e) {
                logger_1.logger.warn('[Copywriting] audit failed (non-fatal): ' + String(e));
            }
            sse.sendDone({ id: record.id, title: record.title });
        }
        catch (err) {
            logger_1.logger.error('Copywriting generateFromScratch error: ' + String(err));
            sse.sendError(String(err));
        }
    }
    /**
     * 基于已有文本做加工（润色 / 扩写 / 压缩 / 改写）。
     *
     * 典型场景：
     *   - 用户粘贴了一篇自己的文稿
     *   - 文案库里已有一条文案，想"再改一版"（此时传 sourceCopywritingId）
     *   - 抓取了一段外部文章（URL 抓取在前端完成）
     *
     * 不同于 generateFromScratch 的"主题→大纲→扩写→润色→字幕→标题"长链路，
     * 这里只做一步：prompt → 流式改写 → 入库 → 审核。
     */
    async rewriteFromText(input, sse) {
        try {
            const MODE_INSTRUCTION = {
                polish: '【润色】不改原文结构与核心意思，只优化表达，让语言更自然流畅、节奏更好。',
                expand: '【扩写】在保留原文要点的前提下，补充具体细节、例子、数据、转折，让文案更饱满。',
                compress: '【压缩】提取原文核心要点，精简成更短的版本。严格按"额外要求"里的字数约束，没说就默认减半。',
                rewrite: '【改写】保留核心信息，但完全重写表达方式，适配目标平台的语气、节奏和标签习惯。不要照抄原文句子。',
            };
            const MODE_LABEL = {
                polish: '润色',
                expand: '扩写',
                compress: '压缩',
                rewrite: '改写',
            };
            const style = input.presetId ? await style_engine_1.styleEngine.getPreset(input.presetId) : undefined;
            sse.sendProgress(`${MODE_LABEL[input.mode]}中`, 20);
            const prompt = style_engine_1.styleEngine.renderPrompt('copy_text_rewrite', {
                source_text: input.sourceText,
                platform: input.platform,
                mode_instruction: MODE_INSTRUCTION[input.mode],
                notes: input.notes || '',
            }, style);
            const result = await llm_1.llm.chatStreamWithScene('copy_rewrite', {
                messages: [
                    { role: 'system', content: '你是自媒体文案加工专家。' },
                    { role: 'user', content: prompt },
                ],
            }, (chunk) => sse.sendChunk(chunk.content));
            sse.sendProgress('保存中', 90);
            // 标题：复用原标题（如果有）或取前 30 字
            const title = input.sourceTitle
                ? `[${MODE_LABEL[input.mode]}] ${input.sourceTitle}`.slice(0, 80)
                : result.slice(0, 30);
            const [record] = await db_1.db
                .insert(schema_1.copywritings)
                .values({
                title,
                topic: `文稿${MODE_LABEL[input.mode]}`,
                platform: input.platform,
                finalText: result,
                wordCount: result.length,
                generationMode: 'text_rewrite',
                status: 'done',
            })
                .returning();
            // 合规审核
            sse.sendProgress('合规审核', 98);
            try {
                const audit = await content_audit_1.contentAudit.autoAudit(result);
                await db_1.db
                    .update(schema_1.copywritings)
                    .set({
                    auditLevel: audit.level,
                    auditResult: JSON.stringify(audit),
                    auditedAt: audit.auditedAt,
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, record.id));
            }
            catch (e) {
                logger_1.logger.warn('[Copywriting] audit failed (non-fatal): ' + String(e));
            }
            sse.sendDone({ id: record.id, title: record.title });
        }
        catch (err) {
            logger_1.logger.error('Copywriting rewriteFromText error: ' + String(err));
            sse.sendError(String(err));
        }
    }
    /** 多平台适配 */
    async adaptToPlatform(copyId, targetPlatform) {
        const [copy] = await db_1.db.select().from(schema_1.copywritings).where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, copyId));
        if (!copy)
            throw new Error('Copywriting not found');
        const adapted = await llm_1.llm.completeWithScene('copy_adapt', '多平台内容适配专家', style_engine_1.styleEngine.renderPrompt('copy_platform_adapt', {
            text: copy.finalText || '',
            source_platform: copy.platform,
            target_platform: targetPlatform,
            adaptation_rules: ADAPTATION_RULES[targetPlatform] || '',
        }));
        // 适配完立刻审核
        let auditLevel = 'pending';
        let auditResultJson = null;
        try {
            const audit = await content_audit_1.contentAudit.autoAudit(adapted);
            auditLevel = audit.level;
            auditResultJson = JSON.stringify(audit);
        }
        catch (e) {
            logger_1.logger.warn('[Copywriting] adapt audit failed (non-fatal): ' + String(e));
        }
        return db_1.db
            .insert(schema_1.copywritingAdaptations)
            .values({
            copywritingId: copyId,
            platform: targetPlatform,
            adaptedText: adapted,
            auditLevel,
            auditResult: auditResultJson,
        })
            .returning();
    }
    /** 为已有文案重新生成 8 个标题 */
    async regenerateTitles(copyId) {
        const [copy] = await db_1.db.select().from(schema_1.copywritings).where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, copyId));
        if (!copy)
            throw new Error('Not found');
        const titlesRaw = await llm_1.llm.completeJSONWithScene('copy_title', '标题专家', style_engine_1.styleEngine.renderPrompt('copy_title_generate', {
            summary: (copy.finalText || '').slice(0, 200),
            platform: copy.platform,
        }));
        // jsonMode 下 LLM 可能返回 {titles:[...]} 等包装,unwrap 取数组
        const titles = unwrapJsonArray(titlesRaw);
        // 清除旧的未选中标题
        for (const t of titles) {
            await db_1.db.insert(schema_1.titleCandidates).values({
                copywritingId: copyId,
                titleText: t.title,
                style: t.style,
            });
        }
        return titles;
    }
    /** 选择一个标题 */
    async selectTitle(copyId, titleId) {
        await db_1.db
            .update(schema_1.titleCandidates)
            .set({ isSelected: 0 })
            .where((0, drizzle_orm_1.eq)(schema_1.titleCandidates.copywritingId, copyId));
        await db_1.db
            .update(schema_1.titleCandidates)
            .set({ isSelected: 1 })
            .where((0, drizzle_orm_1.eq)(schema_1.titleCandidates.id, titleId));
        const [title] = await db_1.db
            .select()
            .from(schema_1.titleCandidates)
            .where((0, drizzle_orm_1.eq)(schema_1.titleCandidates.id, titleId));
        if (title) {
            await db_1.db
                .update(schema_1.copywritings)
                .set({ title: title.titleText, updatedAt: new Date().toISOString() })
                .where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, copyId));
        }
        return title;
    }
    /** 获取文案详情（含标题候选、适配）。文案不存在时返回 null（让路由层正确返回 404）*/
    async getDetail(copyId) {
        const [copy] = await db_1.db.select().from(schema_1.copywritings).where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, copyId));
        if (!copy)
            return null;
        const titles = await db_1.db
            .select()
            .from(schema_1.titleCandidates)
            .where((0, drizzle_orm_1.eq)(schema_1.titleCandidates.copywritingId, copyId));
        const adaptations = await db_1.db
            .select()
            .from(schema_1.copywritingAdaptations)
            .where((0, drizzle_orm_1.eq)(schema_1.copywritingAdaptations.copywritingId, copyId));
        return { ...copy, titleCandidates: titles, adaptations };
    }
    /**
     * 列表（支持搜索 / 筛选 / 排序 / 分页）
     *
     * keyword:         模糊匹配 title / topic / sourceKeyword
     * platform:        精确匹配
     * auditLevel:      pending|safe|warning|risky
     * generationMode:  from_scratch|from_video（精确）
     * dateFrom/dateTo: 按 createdAt 过滤（YYYY-MM-DD）
     * sort:            updated（默认）| created | words
     */
    async list(opts = {}) {
        const { keyword, platform, auditLevel, generationMode, dateFrom, dateTo, sort = 'updated', page = 1, pageSize = 20, } = opts;
        const conds = [];
        if (keyword) {
            // title / topic / sourceKeyword 任一命中
            const kw = `%${keyword}%`;
            conds.push((0, drizzle_orm_1.sql) `(${schema_1.copywritings.title} LIKE ${kw} OR ${schema_1.copywritings.topic} LIKE ${kw} OR ${schema_1.copywritings.sourceKeyword} LIKE ${kw})`);
        }
        if (platform)
            conds.push((0, drizzle_orm_1.eq)(schema_1.copywritings.platform, platform));
        if (auditLevel)
            conds.push((0, drizzle_orm_1.eq)(schema_1.copywritings.auditLevel, auditLevel));
        if (generationMode)
            conds.push((0, drizzle_orm_1.eq)(schema_1.copywritings.generationMode, generationMode));
        if (dateFrom)
            conds.push((0, drizzle_orm_1.gte)(schema_1.copywritings.createdAt, dateFrom));
        if (dateTo)
            conds.push((0, drizzle_orm_1.lte)(schema_1.copywritings.createdAt, dateTo + 'T23:59:59.999Z'));
        const where = conds.length > 0 ? (0, drizzle_orm_1.and)(...conds) : undefined;
        // 排序
        const orderClause = sort === 'created'
            ? [(0, drizzle_orm_1.desc)(schema_1.copywritings.createdAt)]
            : sort === 'words'
                ? [(0, drizzle_orm_1.desc)(schema_1.copywritings.wordCount), (0, drizzle_orm_1.desc)(schema_1.copywritings.updatedAt)]
                : [(0, drizzle_orm_1.desc)(schema_1.copywritings.updatedAt)];
        // 真 total
        const totalRow = await (where
            ? db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.copywritings).where(where)
            : db_1.db.select({ c: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.copywritings));
        const total = Number(totalRow[0]?.c || 0);
        const base = where ? db_1.db.select().from(schema_1.copywritings).where(where) : db_1.db.select().from(schema_1.copywritings);
        const rows = await base
            .orderBy(...orderClause)
            .limit(pageSize)
            .offset((page - 1) * pageSize);
        return { items: rows, page, pageSize, total };
    }
    /** 主线 A：按 topicId 列所有由这条选题衍生的文案 */
    async listByTopicId(topicId) {
        return db_1.db
            .select()
            .from(schema_1.copywritings)
            .where((0, drizzle_orm_1.eq)(schema_1.copywritings.topicId, topicId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.copywritings.id));
    }
    /** 手动编辑 */
    async update(id, data) {
        return db_1.db
            .update(schema_1.copywritings)
            .set({ ...data, updatedAt: new Date().toISOString() })
            .where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, id))
            .returning();
    }
    /** 删除单条文案（含标题候选 + 平台适配 FK 数据） */
    async remove(id) {
        // 按外键依赖顺序删除
        await db_1.db.delete(schema_1.titleCandidates).where((0, drizzle_orm_1.eq)(schema_1.titleCandidates.copywritingId, id));
        await db_1.db.delete(schema_1.copywritingAdaptations).where((0, drizzle_orm_1.eq)(schema_1.copywritingAdaptations.copywritingId, id));
        const result = await db_1.db.delete(schema_1.copywritings).where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, id));
        return { removed: true, id };
    }
    /** 批量删除（同上，级联删子表） */
    async removeMany(ids) {
        if (!ids.length)
            return { removed: 0 };
        let count = 0;
        for (const id of ids) {
            try {
                await this.remove(id);
                count++;
            }
            catch (err) {
                logger_1.logger.warn(`[Copywriting] remove #${id} failed: ${err}`);
            }
        }
        return { removed: count };
    }
    /**
     * 批量重审：对每条文案重跑一次合规审核，更新 auditLevel/auditResult/auditedAt。
     * useLLM=true 时走 LLM 辅助判定（慢但更准），false 走纯词库（快）。
     */
    async batchReaudit(ids, useLLM = false) {
        if (!ids.length)
            return { reaudited: 0, failed: 0, results: [] };
        const rows = await db_1.db.select().from(schema_1.copywritings).where((0, drizzle_orm_1.inArray)(schema_1.copywritings.id, ids));
        const now = new Date().toISOString();
        let reaudited = 0;
        let failed = 0;
        const results = [];
        for (const r of rows) {
            try {
                // 与单条 reaudit 一致：拼 title + finalText 一起审
                const text = `${r.title || ''}\n${r.finalText || ''}`;
                const audit = useLLM
                    ? await content_audit_1.contentAudit.auditWithLLM(text)
                    : await content_audit_1.contentAudit.autoAudit(text);
                await db_1.db
                    .update(schema_1.copywritings)
                    .set({
                    auditLevel: audit.level,
                    auditResult: JSON.stringify(audit),
                    auditedAt: audit.auditedAt || now,
                    updatedAt: now,
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, r.id));
                reaudited++;
                results.push({ id: r.id, level: audit.level, hits: audit.hits?.length || 0 });
            }
            catch (err) {
                failed++;
                logger_1.logger.warn(`[Copywriting] batch reaudit #${r.id} failed: ${err}`);
            }
        }
        return { reaudited, failed, results };
    }
    /**
     * 批量多平台适配：给多条文案，每条都适配到指定的多个平台。
     * 产出 ids.length × platforms.length 条 adaptation 记录。
     */
    async batchAdapt(ids, platforms) {
        if (!ids.length || !platforms.length)
            return { adapted: 0, failed: 0 };
        let adapted = 0;
        let failed = 0;
        for (const id of ids) {
            for (const p of platforms) {
                try {
                    await this.adaptToPlatform(id, p);
                    adapted++;
                }
                catch (err) {
                    failed++;
                    logger_1.logger.warn(`[Copywriting] batch adapt #${id}→${p} failed: ${err}`);
                }
            }
        }
        return { adapted, failed };
    }
    /** 模板库 */
    async listTemplates(category, platform) {
        if (category && platform) {
            return db_1.db
                .select()
                .from(schema_1.templates)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.templates.category, category), (0, drizzle_orm_1.eq)(schema_1.templates.platform, platform)));
        }
        if (category)
            return db_1.db.select().from(schema_1.templates).where((0, drizzle_orm_1.eq)(schema_1.templates.category, category));
        if (platform)
            return db_1.db.select().from(schema_1.templates).where((0, drizzle_orm_1.eq)(schema_1.templates.platform, platform));
        return db_1.db.select().from(schema_1.templates);
    }
}
exports.CopywritingService = CopywritingService;
exports.copywriting = new CopywritingService();
//# sourceMappingURL=copywriting.js.map