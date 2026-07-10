"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarAssets = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
/**
 * 数字人形象素材
 *
 * 存的是"用户上传的照片"或"系统预设照片"的元数据。
 * 桌面端调阿里云万相 wan2.2-s2v 数字人 API 时,要把这张图上传到 dashscope 临时存储,
 * 拿到公网 URL 后再传给 video-synthesis API。
 *
 * 一行 = 一个数字人形象。用户可以有多个,但同一时刻只有一个 isDefault=1。
 */
exports.avatarAssets = (0, sqlite_core_1.sqliteTable)('avatar_assets', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    /** 用户起的名字(前端展示用) */
    name: (0, sqlite_core_1.text)('name').notNull(),
    /** 'user' = 用户上传,'preset' = 系统预设(放在 resources/avatar-presets/) */
    source: (0, sqlite_core_1.text)('source').notNull(),
    /** 本地图片绝对路径
     *   - source=user:    userdata/avatar/u-xxx.jpg
     *   - source=preset:  resources/avatar-presets/real-1.png 等
     */
    localPath: (0, sqlite_core_1.text)('local_path').notNull(),
    /** 是否为当前默认形象(全局只能一个 = 1) */
    isDefault: (0, sqlite_core_1.integer)('is_default').default(0),
    createdAt: (0, sqlite_core_1.text)('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});
//# sourceMappingURL=avatar.js.map