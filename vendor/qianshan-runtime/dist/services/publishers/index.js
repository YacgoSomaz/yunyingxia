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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublisher = getPublisher;
exports.listSupportedPlatforms = listSupportedPlatforms;
const bilibili_1 = require("./bilibili");
const xiaohongshu_1 = require("./xiaohongshu");
const douyin_1 = require("./douyin");
const kuaishou_1 = require("./kuaishou");
const weixin_channels_1 = require("./weixin-channels");
/**
 * 平台发布器注册表。新增平台只需在这里 new 一个实例。
 */
const PUBLISHERS = {};
function register(p) {
    PUBLISHERS[p.platform] = p;
}
register(new bilibili_1.BilibiliPublisher());
register(new xiaohongshu_1.XiaohongshuPublisher());
register(new douyin_1.DouyinPublisher());
register(new kuaishou_1.KuaishouPublisher());
register(new weixin_channels_1.WeixinChannelsPublisher());
function getPublisher(platform) {
    return PUBLISHERS[platform] || null;
}
function listSupportedPlatforms() {
    return Object.values(PUBLISHERS).map((p) => ({
        platform: p.platform,
        label: p.platformLabel,
        implemented: true,
        publishFields: p.publishFields,
    }));
}
__exportStar(require("./base"), exports);
//# sourceMappingURL=index.js.map