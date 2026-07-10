"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const competitor_1 = require("../services/competitor");
const validate_1 = require("../utils/validate");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
const CreateSchema = zod_1.z.object({
    platform: zod_1.z.string().min(1).max(32),
    accountName: zod_1.z.string().min(1).max(100),
    accountId: zod_1.z.string().max(100).optional(),
    avatarUrl: zod_1.z.string().url().optional(),
    followerCount: zod_1.z.number().int().min(0).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
const UpdateSchema = zod_1.z.object({
    accountName: zod_1.z.string().min(1).max(100).optional(),
    accountId: zod_1.z.string().max(100).optional(),
    avatarUrl: zod_1.z.string().url().optional(),
    followerCount: zod_1.z.number().int().min(0).optional(),
    notes: zod_1.z.string().max(500).optional(),
    isActive: zod_1.z.number().int().min(0).max(1).optional(),
});
const AddContentSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(300),
    url: zod_1.z.string().max(500).optional(),
    likeCount: zod_1.z.number().int().min(0).optional(),
    commentCount: zod_1.z.number().int().min(0).optional(),
    shareCount: zod_1.z.number().int().min(0).optional(),
    publishedAt: zod_1.z.string().optional(),
});
// 竞品账号
router.get('/', async (req, res) => {
    try {
        const { platform } = req.query;
        res.json(ok(await competitor_1.competitor.list({ platform: platform || undefined })));
    }
    catch (err) {
        logger_1.logger.error('competitor/list error: ' + err);
        res.status(500).json(fail(err));
    }
});
router.post('/', (0, validate_1.validateBody)(CreateSchema), async (req, res) => {
    try {
        res.json(ok(await competitor_1.competitor.create(req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.patch('/:id', (0, validate_1.validateBody)(UpdateSchema), async (req, res) => {
    try {
        res.json(ok(await competitor_1.competitor.update(Number(req.params.id), req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/:id', async (req, res) => {
    try {
        res.json(ok(await competitor_1.competitor.remove(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 竞品内容
router.get('/:id/contents', async (req, res) => {
    try {
        res.json(ok(await competitor_1.competitor.listContents(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/:id/contents', (0, validate_1.validateBody)(AddContentSchema), async (req, res) => {
    try {
        res.json(ok(await competitor_1.competitor.addContent(Number(req.params.id), req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/contents/:cid', async (req, res) => {
    try {
        res.json(ok(await competitor_1.competitor.removeContent(Number(req.params.cid))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=competitor.js.map