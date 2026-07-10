"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * /api/avatar/* — 数字人形象素材 REST API
 *
 *  GET    /api/avatar/list           列出所有形象(user + preset)
 *  POST   /api/avatar/upload         上传一张照片(multipart/form-data,字段名 file,可选 name)
 *  POST   /api/avatar/set-default    切默认 { id }
 *  DELETE /api/avatar/:id            删一张(只能删 user 类型)
 */
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const avatar_asset_1 = require("../services/avatar-asset");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
// 内存上传 — 文件不写盘,直接拿 buffer 交给 service 落到正确位置
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
router.get('/list', async (_req, res) => {
    try {
        const list = await avatar_asset_1.avatarAssetService.list();
        // 不向前端暴露绝对路径(保留文件名 + id 即可)
        const safeList = list.map((row) => ({
            id: row.id,
            name: row.name,
            source: row.source,
            isDefault: !!row.isDefault,
            createdAt: row.createdAt,
        }));
        res.json(ok(safeList));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file)
            throw new Error('未收到文件');
        const name = String(req.body?.name || '').trim() || req.file.originalname;
        const result = await avatar_asset_1.avatarAssetService.uploadUserAvatar({
            name,
            originalFilename: req.file.originalname,
            bytes: req.file.buffer,
        });
        res.json(ok({ id: result.id, name: result.name }));
    }
    catch (err) {
        res.status(400).json(fail(err));
    }
});
router.post('/set-default', async (req, res) => {
    try {
        const id = parseInt(req.body?.id, 10);
        if (!id)
            throw new Error('id 必填');
        await avatar_asset_1.avatarAssetService.setDefault(id);
        res.json(ok({ ok: true }));
    }
    catch (err) {
        res.status(400).json(fail(err));
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await avatar_asset_1.avatarAssetService.remove(id);
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(400).json(fail(err));
    }
});
/** 给 renderer 显示用:返回图片二进制流(类似 /api/video/file) */
router.get('/file/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const localPath = await avatar_asset_1.avatarAssetService.getLocalPath(id);
        if (!localPath)
            return res.status(404).end();
        res.sendFile(localPath);
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=avatar.js.map