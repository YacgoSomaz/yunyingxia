"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarAssetService = void 0;
/**
 * 数字人形象素材管理
 *
 * 一个"形象"就是一张照片(jpg/png/webp),后续会用作 wan2.2-s2v 的 image_url 输入。
 * 两种来源:
 *   - source='user'   用户从设置页上传的 → 存在 data/avatar/user-{uuid}.{ext}
 *   - source='preset' 应用内置预设 → 直接指向 assets/avatar-presets/xxx.png
 *
 * 设计要点:
 *   - 预设在 init() 时自动 seed 进表(只 seed 一次,id 已存在就跳过)
 *   - 同时只有一个 isDefault=1(切默认时清旧的)
 *   - 默认形象给一键成片 fallback 用(用户没在 Settings 选 → 用默认)
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const paths_1 = require("../utils/paths");
const logger_1 = require("../utils/logger");
/** 第一版内置预设(占位,后续替换为正式资源)
 *  文件需放在 packages/main/assets/avatar-presets/ 下
 *  打包时通过 electron-builder extraResources 一起带出去 */
const BUILTIN_PRESETS = [
    { name: '商务真人 1', file: 'real-1.png' },
    { name: '商务真人 2', file: 'real-2.png' },
    { name: '卡通主播 1', file: 'cartoon-1.png' },
    { name: '卡通主播 2', file: 'cartoon-2.png' },
];
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
class AvatarAssetService {
    /** 启动时种入预设;不存在就插,已存在不动(预设文件有可能没打包进来 → seed 跳过) */
    async init() {
        try {
            for (const p of BUILTIN_PRESETS) {
                const fullPath = path_1.default.join((0, paths_1.assetsDir)('avatar-presets'), p.file);
                if (!fs_1.default.existsSync(fullPath)) {
                    // 预设文件还没准备 → 跳过这条 seed,不报错
                    continue;
                }
                const exists = await db_1.db
                    .select()
                    .from(schema_1.avatarAssets)
                    .where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.localPath, fullPath));
                if (exists.length > 0)
                    continue;
                await db_1.db.insert(schema_1.avatarAssets).values({
                    name: p.name,
                    source: 'preset',
                    localPath: fullPath,
                    isDefault: 0,
                });
                logger_1.logger.info(`[Avatar] seeded preset: ${p.name} (${p.file})`);
            }
        }
        catch (err) {
            logger_1.logger.warn(`[Avatar] init seed failed: ${String(err)}`);
        }
    }
    /** 列出所有形象素材 */
    async list() {
        const rows = await db_1.db.select().from(schema_1.avatarAssets);
        // user 排前面,preset 排后面;同组按 createdAt 倒序
        return rows.sort((a, b) => {
            if (a.source !== b.source)
                return a.source === 'user' ? -1 : 1;
            return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
    }
    /** 拿当前默认形象;没默认 → 取第一条 user;再没 → 第一条 preset;都没 → null */
    async getDefault() {
        const rows = await db_1.db.select().from(schema_1.avatarAssets).where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.isDefault, 1));
        if (rows.length > 0)
            return rows[0];
        const all = await this.list();
        return all[0] || null;
    }
    /**
     * 上传一张用户照片。bytes 由路由层从 multipart 取出来。
     * 文件落到 data/avatar/u-{hash}.{ext},自动建目录。
     */
    async uploadUserAvatar(input) {
        const ext = path_1.default.extname(input.originalFilename).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
            throw new Error(`不支持的图片格式: ${ext}`);
        }
        if (input.bytes.length > 10 * 1024 * 1024) {
            throw new Error(`图片过大(${(input.bytes.length / 1024 / 1024).toFixed(1)} MB),请压缩到 10MB 以内`);
        }
        if (input.bytes.length < 1024) {
            throw new Error(`图片过小(${input.bytes.length} B),疑似无效文件`);
        }
        const hash = crypto_1.default.randomBytes(6).toString('hex');
        const filename = `u-${Date.now()}-${hash}${ext}`;
        // dataDir('avatar') 只 mkdir parent(=data/),不会创建 data/avatar/
        // 用 dataDir('avatar', filename) 让它 mkdir filename 的 parent = data/avatar/
        const fullPath = (0, paths_1.dataDir)('avatar', filename);
        fs_1.default.writeFileSync(fullPath, input.bytes);
        const inserted = await db_1.db
            .insert(schema_1.avatarAssets)
            .values({
            name: input.name || `我的形象 ${new Date().toLocaleDateString('zh-CN')}`,
            source: 'user',
            localPath: fullPath,
            isDefault: 0,
        })
            .returning();
        logger_1.logger.info(`[Avatar] uploaded user avatar: ${inserted[0].name} → ${fullPath}`);
        return inserted[0];
    }
    /** 设置某个 id 为默认,清掉其他的 isDefault */
    async setDefault(id) {
        const [target] = await db_1.db.select().from(schema_1.avatarAssets).where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.id, id));
        if (!target)
            throw new Error(`形象 id=${id} 不存在`);
        // 清掉其他默认
        await db_1.db.update(schema_1.avatarAssets).set({ isDefault: 0 }).where((0, drizzle_orm_1.ne)(schema_1.avatarAssets.id, id));
        // 标记当前为默认
        await db_1.db.update(schema_1.avatarAssets).set({ isDefault: 1 }).where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.id, id));
        logger_1.logger.info(`[Avatar] set default = id ${id} (${target.name})`);
        return target;
    }
    /** 删除(只允许删 user 类型;preset 不能删,只能"未选中") */
    async remove(id) {
        const [row] = await db_1.db.select().from(schema_1.avatarAssets).where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.id, id));
        if (!row)
            return;
        if (row.source === 'preset') {
            throw new Error('系统预设不可删除');
        }
        await db_1.db.delete(schema_1.avatarAssets).where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.id, id));
        try {
            if (fs_1.default.existsSync(row.localPath))
                fs_1.default.unlinkSync(row.localPath);
        }
        catch (err) {
            logger_1.logger.warn(`[Avatar] remove file failed: ${String(err)}`);
        }
        logger_1.logger.info(`[Avatar] removed: id=${id} (${row.name})`);
    }
    /** 给一个 id 拿对应的本地文件路径(给生成阶段用) */
    async getLocalPath(id) {
        const [row] = await db_1.db.select().from(schema_1.avatarAssets).where((0, drizzle_orm_1.eq)(schema_1.avatarAssets.id, id));
        if (!row)
            return null;
        if (!fs_1.default.existsSync(row.localPath)) {
            logger_1.logger.warn(`[Avatar] file missing: ${row.localPath}`);
            return null;
        }
        return row.localPath;
    }
}
exports.avatarAssetService = new AvatarAssetService();
//# sourceMappingURL=avatar-asset.js.map