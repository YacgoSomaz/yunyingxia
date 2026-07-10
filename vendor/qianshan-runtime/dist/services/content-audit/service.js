"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentAudit = exports.ContentAuditService = void 0;
/**
 * 内容审核服务
 *
 * 两层：
 *   1. 规则引擎（O(n·m) Aho-Corasick 不上，原生 indexOf 足够了，500 词规模）—— ~10ms
 *   2. LLM 精判（可选）—— 命中 high severity 才自动触发
 *
 * 输出 AuditResult 可序列化为 JSON 直接存 copywritings.audit_result
 */
const db_1 = require("../../db");
const schema_1 = require("../../db/schema");
const llm_1 = require("../llm");
const logger_1 = require("../../utils/logger");
const dictionary_1 = require("./dictionary");
const ENGINE_VERSION = 'v1';
class ContentAuditService {
    /** 自定义词库缓存（启动 + 每次修改后 reload） */
    customWords = [];
    async init() {
        await this.reloadCustom();
    }
    async reloadCustom() {
        try {
            const rows = await db_1.db.select().from(schema_1.customForbiddenWords);
            this.customWords = rows.map((r) => ({
                word: r.word,
                category: r.category || 'custom',
                severity: r.severity || 'medium',
                label: r.category || '自定义',
                suggestion: r.note || '该词来自你的自定义词库',
            }));
            logger_1.logger.info(`[Audit] loaded ${this.customWords.length} custom forbidden words`);
        }
        catch (err) {
            logger_1.logger.warn('[Audit] reload custom words failed: ' + String(err));
            this.customWords = [];
        }
    }
    /**
     * 规则引擎审核 —— 同步、快速。
     * 对 500 + 自定义词用 indexOf 扫一遍，~10ms 足够。
     */
    audit(text) {
        const all = [
            ...(0, dictionary_1.flattenWords)(),
            ...this.customWords.map((c) => ({ ...c, customMarker: true })),
        ];
        // 归一化：全转小写扫，但记录位置用原文
        const lower = text.toLowerCase();
        const hits = [];
        const seen = new Set();
        for (const entry of all) {
            const needle = entry.word.toLowerCase();
            const pos = lower.indexOf(needle);
            if (pos < 0)
                continue;
            // 同一 word 只记录一次
            if (seen.has(entry.word))
                continue;
            seen.add(entry.word);
            hits.push({
                word: entry.word,
                category: entry.category,
                severity: entry.severity,
                label: entry.label,
                suggestion: entry.suggestion,
                position: pos,
                custom: entry.customMarker === true,
            });
        }
        // 决定总体 level
        const maxSeverity = hits.reduce((acc, h) => {
            if (!acc)
                return h.severity;
            const rank = { low: 0, medium: 1, high: 2 };
            return rank[h.severity] > rank[acc] ? h.severity : acc;
        }, null);
        let level = 'clean';
        if (maxSeverity === 'high')
            level = 'risky';
        else if (maxSeverity === 'medium' || maxSeverity === 'low')
            level = 'warning';
        return {
            level,
            hits: hits.sort((a, b) => a.position - b.position),
            engineVersion: ENGINE_VERSION,
            totalDictSize: all.length,
            auditedAt: new Date().toISOString(),
        };
    }
    /**
     * LLM 精判：把规则引擎的 hits 交给 LLM 读原文 + 上下文做真假判断。
     * 典型场景：文案里有"最"字但不是绝对化（"最近"），LLM 可以识别为误报。
     */
    async auditWithLLM(text, baseResult) {
        const result = baseResult || this.audit(text);
        if (result.hits.length === 0)
            return result;
        const hitSummary = result.hits
            .slice(0, 20) // 最多报 20 个给 LLM
            .map((h) => `- "${h.word}" (${h.label}, ${h.severity})`)
            .join('\n');
        const prompt = `你是一个内容合规审核员。下面是一段自媒体文案，规则引擎已经命中了一些疑似违禁词。请**用上下文判断**这些命中是真违规还是误报，并给出**改写建议**。

【原文】
${text.slice(0, 2000)}

【规则引擎命中】
${hitSummary}

请按以下 JSON 格式返回，不要其他内容：
{
  "verdict": "risky|warning|clean",
  "explanation": "一段话说明为什么是这个级别",
  "falsePositives": ["误报词 1", "误报词 2"],
  "rewriteTips": "如果要改，具体怎么改的建议"
}`;
        try {
            const reviewJson = await llm_1.llm.completeJSONWithScene('distribute_insight', // 复用一个通用场景
            '内容合规审核员', prompt);
            // 如果 LLM 认为有些是误报，从 hits 里标记出来（不删，让用户自己判断）
            if (Array.isArray(reviewJson?.falsePositives)) {
                for (const fp of reviewJson.falsePositives) {
                    const hit = result.hits.find((h) => h.word === fp);
                    if (hit) {
                        hit.suggestion = `[LLM 认为可能是误报] ${hit.suggestion}`;
                    }
                }
            }
            result.llmReview =
                typeof reviewJson?.explanation === 'string' ? reviewJson.explanation : undefined;
            if (reviewJson?.rewriteTips) {
                result.llmReview =
                    (result.llmReview ? result.llmReview + '\n\n' : '') +
                        '改写建议：' + reviewJson.rewriteTips;
            }
            // LLM 判定优先级更高（但不会把 risky 降成 clean，保守处理）
            if (reviewJson?.verdict === 'clean' && result.level === 'warning') {
                result.level = 'clean';
            }
        }
        catch (err) {
            logger_1.logger.warn('[Audit] LLM review failed: ' + String(err));
        }
        return result;
    }
    /**
     * 自动审核入口：
     *   - 先跑规则引擎
     *   - 如果命中 high，自动触发 LLM 精判（对 high 级别最该准确）
     */
    async autoAudit(text) {
        const result = this.audit(text);
        const hasHigh = result.hits.some((h) => h.severity === 'high');
        if (hasHigh) {
            try {
                return await this.auditWithLLM(text, result);
            }
            catch {
                return result;
            }
        }
        return result;
    }
    // ─── 自定义词库 CRUD ───
    async listCustomWords() {
        return db_1.db.select().from(schema_1.customForbiddenWords);
    }
    async addCustomWord(data) {
        await db_1.db.insert(schema_1.customForbiddenWords).values({
            word: data.word.trim(),
            category: data.category || 'custom',
            severity: data.severity || 'medium',
            note: data.note || null,
        });
        await this.reloadCustom();
    }
    async removeCustomWord(id) {
        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        await db_1.db.delete(schema_1.customForbiddenWords).where(eq(schema_1.customForbiddenWords.id, id));
        await this.reloadCustom();
    }
    /** 内置词库元数据（只返回分类统计，不返回具体词）*/
    builtinStats() {
        return dictionary_1.BUILTIN_FORBIDDEN_WORDS.map((g) => ({
            category: g.category,
            label: g.label,
            emoji: g.emoji,
            severity: g.severity,
            suggestion: g.suggestion,
            count: g.words.length,
        }));
    }
}
exports.ContentAuditService = ContentAuditService;
exports.contentAudit = new ContentAuditService();
//# sourceMappingURL=service.js.map