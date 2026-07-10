"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const video_workshop_1 = require("../services/video-workshop");
const sse_manager_1 = require("../services/sse-manager");
const logger_1 = require("../utils/logger");
const validate_1 = require("../utils/validate");
const safe_paths_1 = require("../utils/safe-paths");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
const AdVideoSchema = zod_1.z.object({
    productImagePath: zod_1.z.string().min(1),
    creativeDesc: zod_1.z.string().min(1).max(2000),
    duration: zod_1.z.number().int().min(3).max(15).optional(),
    // 主线 A
    copywritingId: zod_1.z.number().int().positive().optional(),
});
const CoverSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200),
    subtitle: zod_1.z.string().max(200).optional(),
    templateId: zod_1.z.number().int().positive().optional(),
    backgroundPath: zod_1.z.string().optional(),
    /** AI 生成背景的中文 prompt（与 backgroundPath 二选一，AI 生成优先级更低）*/
    bgPromptCN: zod_1.z.string().max(500).optional(),
    /** 文字样式预设 */
    style: zod_1.z.enum(['centered', 'bottom-left', 'top-block', 'gradient']).default('centered').optional(),
    platform: zod_1.z.string().min(1).max(32),
    // 主线 A
    copywritingId: zod_1.z.number().int().positive().optional(),
    /** 视觉风格预设 ID（来自 stylePresets, module='visual'）。
     *  生效于 AI 背景生成：拼 fixedSuffix 到 prompt + 用 visualStyle.negativePrompt
     *  不传 = 默认电影写实（跟老行为一致，向后兼容） */
    visualStyleId: zod_1.z.number().int().nullable().optional(),
});
// ─── AI 广告视频（SSE） ───
router.post('/ad/generate-stream', (0, validate_1.validateBody)(AdVideoSchema), async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        await video_workshop_1.videoWorkshop.generateAdVideo(req.body, sse);
    }
    catch (err) {
        logger_1.logger.error('video/ad error: ' + err);
        sse.sendError(String(err));
    }
});
router.get('/ad/:id', async (req, res) => {
    try {
        const row = await video_workshop_1.videoWorkshop.getAdVideo(Number(req.params.id));
        res.json(ok(row));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/ad/list/all', async (req, res) => {
    try {
        const { page = '1', pageSize = '20' } = req.query;
        const rows = await video_workshop_1.videoWorkshop.listAdVideos(Number(page), Number(pageSize));
        res.json(ok(rows));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 封面 ───
router.post('/cover/generate', (0, validate_1.validateBody)(CoverSchema), async (req, res) => {
    try {
        const result = await video_workshop_1.videoWorkshop.generateCover(req.body);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 查询某平台需要哪些封面规格（前端用来联动渲染"将生成 N 张" 提示） */
router.get('/cover/specs/:platform', (req, res) => {
    try {
        const { PLATFORM_COVER_SPECS } = require('../services/video-workshop');
        const specs = PLATFORM_COVER_SPECS[String(req.params.platform)] || [];
        res.json(ok(specs));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/**
 * 按平台规格批量生成封面套图。
 * 抖音 → 同时出竖封面+横封面；B 站 → 1 张；视频号 → 0 张（拒绝）
 */
router.post('/cover/generate-set', (0, validate_1.validateBody)(CoverSchema), async (req, res) => {
    try {
        const result = await video_workshop_1.videoWorkshop.generateCoverSet(req.body);
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/cover/list', async (_req, res) => {
    try {
        const rows = await video_workshop_1.videoWorkshop.listCovers();
        res.json(ok(rows));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/cover/templates', async (_req, res) => {
    try {
        const rows = await video_workshop_1.videoWorkshop.listCoverTemplates();
        res.json(ok(rows));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 删除 ───
router.delete('/ad/:id', async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.removeAdVideo(Number(req.params.id));
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/ad/batch-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];
        const r = await video_workshop_1.videoWorkshop.removeAdVideoMany(ids);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/cover/:id', async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.removeCover(Number(req.params.id));
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/cover/batch-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : [];
        const r = await video_workshop_1.videoWorkshop.removeCoverMany(ids);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 主线 A：按 copywritingId 列所有衍生视频/封面 */
router.get('/by-copywriting/:copywritingId', async (req, res) => {
    try {
        const result = await video_workshop_1.videoWorkshop.listByCopywritingId(Number(req.params.copywritingId));
        res.json(ok(result));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── BGM ───
router.get('/bgm', async (_req, res) => {
    try {
        const rows = await video_workshop_1.videoWorkshop.listBgm();
        res.json(ok(rows));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 暴露内置曲库默认 URL 给前端（让 BgmTab 能自动 sync）
router.get('/bgm/default-manifest', (_req, res) => {
    const { DEFAULT_BGM_MANIFEST_URL } = require('../config/bgm-cdn');
    res.json(ok({ url: DEFAULT_BGM_MANIFEST_URL || '' }));
});
// 扫描本地文件夹，收录所有 mp3/wav 到 BGM 库
const ScanBgmFolderSchema = zod_1.z.object({
    folderPath: zod_1.z.string().min(1),
    mood: zod_1.z.string().max(32).optional(),
});
router.post('/bgm/scan-folder', (0, validate_1.validateBody)(ScanBgmFolderSchema), async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.scanBgmFolder(req.body.folderPath, req.body.mood);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 把单个音频文件注册到 BGM 库（前端"选文件"入口）
const AddBgmFileSchema = zod_1.z.object({
    audioPath: zod_1.z.string().min(1),
    name: zod_1.z.string().max(100).optional(),
    mood: zod_1.z.string().max(32).optional(),
});
router.post('/bgm/add-file', (0, validate_1.validateBody)(AddBgmFileSchema), async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.addBgmFile(req.body);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 从 OSS manifest 同步曲库目录（只注册元数据，按需下载音频）
const SyncOssSchema = zod_1.z.object({ manifestUrl: zod_1.z.string().url() });
router.post('/bgm/sync-oss', (0, validate_1.validateBody)(SyncOssSchema), async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.syncOssCatalog(req.body.manifestUrl);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 下载 OSS 曲目到本地（点击曲库卡片时按需触发）
const DownloadOssSchema = zod_1.z.object({ id: zod_1.z.number().int().positive() });
router.post('/bgm/download-oss', (0, validate_1.validateBody)(DownloadOssSchema), async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.downloadOssTrack(req.body.id);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/bgm/:id', async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.removeBgm(Number(req.params.id));
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// 修改 BGM 标签（mood）
const UpdateBgmSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    mood: zod_1.z.string().max(32).optional(),
    name: zod_1.z.string().max(100).optional(),
});
router.post('/bgm/update', (0, validate_1.validateBody)(UpdateBgmSchema), async (req, res) => {
    try {
        const r = await video_workshop_1.videoWorkshop.updateBgm(req.body);
        res.json(ok(r));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// BGM 专用播放路由：从 DB 查 file_path 直接 sendFile
//   - 用户上传的本地 BGM 路径（D:\Music\xxx.mp3 之类）不在通用 /file 白名单里，
//     直接走 /file 会被 ensureSafePath 拒成 403,前端 audio 报"no supported source was found"
//   - 这条路由只用 BGM id（不收任意 path），从 DB 查到的 file_path 就是可信的（addBgmFile 入库前已校验存在）
//   - OSS 曲目（filePath 是 https URL）不走这条路由,前端直连 OSS
router.get('/bgm/:id/play', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            return res.status(400).json(fail('bad id'));
        const [row] = await db_1.db.select().from(schema_1.bgmLibrary).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, id));
        if (!row)
            return res.status(404).json(fail('BGM not found'));
        if (/^https?:\/\//.test(row.filePath)) {
            // OSS 曲目走前端直连，这条路由不处理（前端不应该路由到这）
            return res.status(400).json(fail('OSS BGM should be played via direct URL'));
        }
        if (!fs_1.default.existsSync(row.filePath)) {
            return res.status(404).json(fail('BGM file not found on disk: ' + row.filePath));
        }
        res.sendFile(row.filePath);
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─── 文件静态访问（本地文件 -> blob/data URL） ───
router.get('/file', (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath)
            return res.status(400).json(fail('path required'));
        // 路径白名单（防 .. 穿越 / 读任意系统文件）
        let safe;
        try {
            safe = (0, safe_paths_1.ensureSafePath)(filePath);
        }
        catch (err) {
            return res.status(403).json(fail(err));
        }
        res.sendFile(safe);
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=video.js.map