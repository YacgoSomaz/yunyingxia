"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competitor = exports.CompetitorService = void 0;
/**
 * 竞品监控 —— 最小可用版。
 *
 * 范围：
 *   - 竞品账号的 CRUD（平台 + 账号名 + 主页 URL + 备注）
 *   - 手动录入竞品内容（用户粘贴：标题/URL/点赞/评论/发布时间）
 *   - 批量快查：列表 + 聚合热度
 *
 * 不做：
 *   - 自动抓取对方主页（每家平台反爬策略不同，要维护成本高，先留给后续）
 *
 * 后续扩展点（留在 TODO 位置）：
 *   - 接入 distribute/publishers 的 cookie 抓取能力做半自动拉取
 *   - 数据趋势（某竞品最近 7 天点赞均值）
 */
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
class CompetitorService {
    async list(opts = {}) {
        const { platform } = opts;
        const base = platform
            ? db_1.db.select().from(schema_1.competitors).where((0, drizzle_orm_1.eq)(schema_1.competitors.platform, platform))
            : db_1.db.select().from(schema_1.competitors);
        const rows = await base.orderBy((0, drizzle_orm_1.desc)(schema_1.competitors.isActive), (0, drizzle_orm_1.desc)(schema_1.competitors.id));
        // 每个竞品带上 contentCount（聚合计数，不拉内容本体）
        const countRows = await db_1.db
            .select({
            competitorId: schema_1.competitorContents.competitorId,
            c: (0, drizzle_orm_1.sql) `count(*)`,
        })
            .from(schema_1.competitorContents)
            .groupBy(schema_1.competitorContents.competitorId);
        const cMap = new Map(countRows.map((r) => [r.competitorId, Number(r.c)]));
        return rows.map((r) => ({ ...r, contentCount: cMap.get(r.id) || 0 }));
    }
    async create(data) {
        const inserted = await db_1.db
            .insert(schema_1.competitors)
            .values({
            platform: data.platform,
            accountName: data.accountName,
            accountId: data.accountId ?? null,
            avatarUrl: data.avatarUrl ?? null,
            followerCount: data.followerCount ?? 0,
            notes: data.notes ?? null,
            isActive: 1,
        })
            .returning();
        return inserted[0];
    }
    async update(id, data) {
        await db_1.db.update(schema_1.competitors).set(data).where((0, drizzle_orm_1.eq)(schema_1.competitors.id, id));
        const [row] = await db_1.db.select().from(schema_1.competitors).where((0, drizzle_orm_1.eq)(schema_1.competitors.id, id));
        return row;
    }
    async remove(id) {
        // 先清内容再删账号（外键）
        await db_1.db.delete(schema_1.competitorContents).where((0, drizzle_orm_1.eq)(schema_1.competitorContents.competitorId, id));
        await db_1.db.delete(schema_1.competitors).where((0, drizzle_orm_1.eq)(schema_1.competitors.id, id));
        return { removed: true, id };
    }
    async listContents(competitorId, limit = 50) {
        return db_1.db
            .select()
            .from(schema_1.competitorContents)
            .where((0, drizzle_orm_1.eq)(schema_1.competitorContents.competitorId, competitorId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.competitorContents.publishedAt), (0, drizzle_orm_1.desc)(schema_1.competitorContents.id))
            .limit(limit);
    }
    async addContent(competitorId, data) {
        const [inserted] = await db_1.db
            .insert(schema_1.competitorContents)
            .values({
            competitorId,
            title: data.title,
            url: data.url ?? null,
            likeCount: data.likeCount ?? 0,
            commentCount: data.commentCount ?? 0,
            shareCount: data.shareCount ?? 0,
            publishedAt: data.publishedAt ?? null,
            fetchedAt: new Date().toISOString(),
        })
            .returning();
        return inserted;
    }
    async removeContent(id) {
        await db_1.db.delete(schema_1.competitorContents).where((0, drizzle_orm_1.eq)(schema_1.competitorContents.id, id));
        return { removed: true, id };
    }
}
exports.CompetitorService = CompetitorService;
exports.competitor = new CompetitorService();
//# sourceMappingURL=competitor.js.map