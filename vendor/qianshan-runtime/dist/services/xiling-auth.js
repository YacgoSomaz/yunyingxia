"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeXilingAuth = makeXilingAuth;
/**
 * 百度曦灵 Authorization 签名生成
 *
 * 官方文档:https://cloud.baidu.com/doc/AI_DH/s/Ulywupd35
 *
 * 算法:
 *   signature = HMAC-SHA256(appKey, appId + expireTime).hex
 *   Authorization = `${appId}/${signature}/${expireTime}`
 *
 * expireTime 是 ISO-8601 字符串(默认 30 分钟后过期),官方文档原样要求。
 * 实际接入如果 401/403 → 第一步检查 expireTime 格式 + 签名输入串顺序,**不要猜**。
 */
const crypto_1 = __importDefault(require("crypto"));
/**
 * @param appId   百度智能云曦灵 AppId
 * @param appKey  百度智能云曦灵 AppKey(明文,仅在内存里短暂使用,不要落盘)
 * @param ttlMs   签名有效期(毫秒),默认 30 分钟。曦灵长任务轮询时每次都新签,避免超时
 */
function makeXilingAuth(appId, appKey, ttlMs = 30 * 60 * 1000) {
    if (!appId)
        throw new Error('makeXilingAuth: appId 为空');
    if (!appKey)
        throw new Error('makeXilingAuth: appKey 为空');
    const expireTime = new Date(Date.now() + ttlMs).toISOString();
    const signature = crypto_1.default
        .createHmac('sha256', appKey)
        .update(appId + expireTime)
        .digest('hex');
    return `${appId}/${signature}/${expireTime}`;
}
//# sourceMappingURL=xiling-auth.js.map