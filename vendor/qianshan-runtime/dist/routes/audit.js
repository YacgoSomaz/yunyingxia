"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 内容合规审核接口：
 *   - 内置词库统计（只返回分类+count，不返回具体词）
 *   - 自定义词库 CRUD
 *   - ad-hoc 审核（给任意文案做规则引擎 / LLM 精判）
 *   - 重新审核已有 copywriting
 */
const express_1 = require("express");
const zod_1 = require("zod");
const content_audit_1 = require("../services/content-audit");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const validate_1 = require("../utils/validate");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
// ─── 内置词库元数据 ───
router.get('/builtin-stats', (_req, res) => {
    try {
        res.json(ok(content_audit_1.contentAudit.builtinStats()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 自定义词库 CRUD ───
router.get('/custom-words', async (_req, res) => {
    try {
        const rows = await content_audit_1.contentAudit.listCustomWords();
        res.json(ok(rows));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
const AddCustomSchema = zod_1.z.object({
    word: zod_1.z.string().min(1).max(200).trim(),
    category: zod_1.z.string().max(50).optional(),
    severity: zod_1.z.enum(['low', 'medium', 'high']).optional(),
    note: zod_1.z.string().max(500).optional(),
});
router.post('/custom-words', (0, validate_1.validateBody)(AddCustomSchema), async (req, res) => {
    try {
        await content_audit_1.contentAudit.addCustomWord(req.body);
        res.json(ok({ added: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/custom-words/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            return res.status(400).json(fail('invalid id'));
        await content_audit_1.contentAudit.removeCustomWord(id);
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── ad-hoc 审核 ───
const CheckSchema = zod_1.z.object({
    text: zod_1.z.string().min(1).max(20000),
    useLLM: zod_1.z.boolean().optional(),
});
router.post('/check', (0, validate_1.validateBody)(CheckSchema), async (req, res) => {
    try {
        const { text, useLLM } = req.body;
        const result = useLLM
            ? await content_audit_1.contentAudit.auditWithLLM(text)
            : content_audit_1.contentAudit.audit(text);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 重新审核 copywriting ───
router.post('/reaudit/copywriting/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            return res.status(400).json(fail('invalid id'));
        const [copy] = await db_1.db.select().from(schema_1.copywritings).where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, id));
        if (!copy)
            return res.status(404).json(fail('copywriting not found'));
        const text = `${copy.title}\n${copy.finalText || ''}`;
        const useLLM = req.body?.useLLM === true;
        const result = useLLM
            ? await content_audit_1.contentAudit.auditWithLLM(text)
            : await content_audit_1.contentAudit.autoAudit(text);
        await db_1.db
            .update(schema_1.copywritings)
            .set({
            auditLevel: result.level,
            auditResult: JSON.stringify(result),
            auditedAt: result.auditedAt,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.copywritings.id, id));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 重新审核适配版本 ───
router.post('/reaudit/adaptation/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            return res.status(400).json(fail('invalid id'));
        const [adp] = await db_1.db
            .select()
            .from(schema_1.copywritingAdaptations)
            .where((0, drizzle_orm_1.eq)(schema_1.copywritingAdaptations.id, id));
        if (!adp)
            return res.status(404).json(fail('adaptation not found'));
        const useLLM = req.body?.useLLM === true;
        const result = useLLM
            ? await content_audit_1.contentAudit.auditWithLLM(adp.adaptedText)
            : await content_audit_1.contentAudit.autoAudit(adp.adaptedText);
        await db_1.db
            .update(schema_1.copywritingAdaptations)
            .set({
            auditLevel: result.level,
            auditResult: JSON.stringify(result),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.copywritingAdaptations.id, id));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=audit.js.map