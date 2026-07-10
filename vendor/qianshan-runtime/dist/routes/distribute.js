"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const distribute_1 = require("../services/distribute");
const validate_1 = require("../utils/validate");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
// ─── Zod schemas ───
const AccountCreateSchema = zod_1.z.object({
    platform: zod_1.z.string().min(1).max(32),
    accountName: zod_1.z.string().min(1).max(64),
    cookieData: zod_1.z.string().optional(),
    accessToken: zod_1.z.string().optional(),
});
const PublishTaskCreateSchema = zod_1.z.object({
    accountId: zod_1.z.number().int().positive(),
    platform: zod_1.z.string().min(1).max(32),
    contentType: zod_1.z.enum(['video', 'article', 'image']),
    // title 可选：视频号等"标题描述合一"的平台不需要独立 title
    // 需要 title 的平台（抖音/B站等）由 publisher.publishFields 在前端层校验必填
    title: zod_1.z.string().min(1).max(200).optional(),
    description: zod_1.z.string().max(2000).optional(),
    mediaPaths: zod_1.z.array(zod_1.z.string()).optional(),
    tags: zod_1.z.array(zod_1.z.string()).max(20).optional(),
    coverPath: zod_1.z.string().optional(),
    scheduledAt: zod_1.z.string().optional(),
    // 主线 A：作品来源关联
    copywritingId: zod_1.z.number().int().positive().optional(),
    adVideoId: zod_1.z.number().int().positive().optional(),
    slideshowId: zod_1.z.number().int().positive().optional(),
    coverId: zod_1.z.number().int().positive().optional(),
    // 平台专属字段（PlatformFieldSpec 驱动的动态字段）
    platformFields: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
const MultiPublishSchema = zod_1.z.object({
    accountIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1).max(20),
    contentType: zod_1.z.enum(['video', 'article', 'image']),
    // title 可选：视频号等无独立标题字段的平台 → 让 publisher 自己用 description 兜底
    title: zod_1.z.string().min(1).max(200).optional(),
    description: zod_1.z.string().max(2000).optional(),
    mediaPaths: zod_1.z.array(zod_1.z.string()).optional(),
    tags: zod_1.z.array(zod_1.z.string()).max(20).optional(),
    coverPath: zod_1.z.string().optional(),
    copywritingId: zod_1.z.number().int().positive().optional(),
    adVideoId: zod_1.z.number().int().positive().optional(),
    slideshowId: zod_1.z.number().int().positive().optional(),
    coverId: zod_1.z.number().int().positive().optional(),
    platformFields: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
const SuggestTimeSchema = zod_1.z.object({
    platform: zod_1.z.string().min(1),
    category: zod_1.z.string().optional(),
});
const ScheduleCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(64),
    platform: zod_1.z.string().min(1).max(32),
    cronExpr: zod_1.z.string().optional(),
    timeSlots: zod_1.z.array(zod_1.z.string()).min(1),
});
// ─── 平台能力查询 ───
router.get('/platforms', (_req, res) => {
    try {
        res.json(ok(distribute_1.distribute.listSupportedPlatforms()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 账号 ───
router.post('/account', (0, validate_1.validateBody)(AccountCreateSchema), async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.addAccount(req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/account', async (req, res) => {
    try {
        const { platform } = req.query;
        res.json(ok(await distribute_1.distribute.listAccounts(platform)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/account/:id', async (req, res) => {
    try {
        await distribute_1.distribute.removeAccount(Number(req.params.id));
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/account/:id/verify', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.verifyAccount(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 设为该平台的"抓取专用号"（选题雷达优先使用） */
router.post('/account/:id/set-default-scraper', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.setDefaultScraperAccount(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 取消"抓取专用号" */
router.post('/account/:id/clear-default-scraper', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.clearDefaultScraperAccount(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 批量校验所有账号（启动时自活） */
router.post('/account/verify-all', async (_req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.verifyAllAccounts()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 扫码登录：打开 BrowserWindow，等用户扫码完成 */
router.post('/account/:id/login', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.loginAccount(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 发布任务 ───
router.post('/task', (0, validate_1.validateBody)(PublishTaskCreateSchema), async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.createPublishTask(req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/task', async (req, res) => {
    try {
        const { platform, status } = req.query;
        res.json(ok(await distribute_1.distribute.listPublishTasks({
            platform: platform,
            status: status,
        })));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 主线 A：按 copywritingId 列所有相关的发布任务（必须在 /task/:id 之前注册） */
router.get('/task/by-copywriting/:copywritingId', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.listByCopywritingId(Number(req.params.copywritingId))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/task/:id', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.getPublishTask(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.patch('/task/:id', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.updatePublishTask(Number(req.params.id), req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/task/:id', async (req, res) => {
    try {
        await distribute_1.distribute.removePublishTask(Number(req.params.id));
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/task/:id/publish', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.executePublish(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/multi-publish', (0, validate_1.validateBody)(MultiPublishSchema), async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.multiPublish(req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 指标 ───
router.post('/task/:id/metrics/fetch', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.fetchMetrics(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/task/:id/metrics', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.listMetrics(Number(req.params.id))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/overview', async (_req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.overviewByPlatform()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 按账号一次性刷新其所有已发布任务的指标 */
router.post('/metrics/refresh/:accountId', async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.refreshMetricsForAccount(Number(req.params.accountId))));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 一键刷新全部账号的指标 */
router.post('/metrics/refresh-all', async (_req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.refreshAllMetrics()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── AI 发布建议 ───
router.post('/suggest-time', (0, validate_1.validateBody)(SuggestTimeSchema), async (req, res) => {
    try {
        const { platform, category } = req.body;
        res.json(ok(await distribute_1.distribute.suggestPublishTime(platform, category)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/suggest-time', async (req, res) => {
    try {
        const { platform } = req.query;
        res.json(ok(await distribute_1.distribute.listSuggestions(platform)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 计划 ───
router.post('/schedule', (0, validate_1.validateBody)(ScheduleCreateSchema), async (req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.createSchedule(req.body)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/schedule', async (_req, res) => {
    try {
        res.json(ok(await distribute_1.distribute.listSchedules()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.patch('/schedule/:id/toggle', async (req, res) => {
    try {
        const { isActive } = req.body;
        res.json(ok(await distribute_1.distribute.toggleSchedule(Number(req.params.id), !!isActive)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/schedule/:id', async (req, res) => {
    try {
        await distribute_1.distribute.removeSchedule(Number(req.params.id));
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=distribute.js.map