"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.validateQuery = validateQuery;
/**
 * 校验 req.body 是否符合 schema；失败直接返回 400。
 * 用法：router.post('/x', validateBody(MySchema), async (req, res) => { ... })
 */
function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: formatZodError(result.error),
            });
        }
        // 覆盖原 body 为 parsed 结果（类型安全）
        req.body = result.data;
        next();
    };
}
function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: formatZodError(result.error),
            });
        }
        // req.query 是只读的，用 Object.defineProperty 绕开
        Object.defineProperty(req, 'query', { value: result.data, writable: true });
        next();
    };
}
function formatZodError(err) {
    return err.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
}
//# sourceMappingURL=validate.js.map