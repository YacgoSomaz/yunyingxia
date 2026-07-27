"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * /api/digital-human/* — 数字人生成器本地偏好
 *
 *  GET  /api/digital-human/prefs        读偏好(仅本地 Settings 用,AppKey 交给密码框隐藏)
 *  PUT  /api/digital-human/prefs        改偏好(provider / xiling.* 局部更新)
 *  POST /api/digital-human/prefs/test   非破坏性 smoke test(只做字段校验 + 签名生成)
 *
 * 不在云端模型配置里,是本地 JSON + safeStorage 加密落盘。
 */
const express_1 = require("express");
const zod_1 = require("zod");
const digital_human_prefs_1 = require("../services/digital-human-prefs");
const validate_1 = require("../utils/validate");
const logger_1 = require("../utils/logger");
const license_1 = require("../services/license");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
router.get('/prefs', (_req, res) => {
    try {
        res.json(ok(digital_human_prefs_1.digitalHumanPrefs.getPublic()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
const PrefsUpdateSchema = zod_1.z.object({
    provider: zod_1.z.enum(['aliyun_wan_s2v', 'baidu_xiling_photo']).optional(),
    aliyun: zod_1.z
        .object({
        apiKey: zod_1.z.string().max(256).optional(),
        model: zod_1.z.string().max(64).optional(),
    })
        .optional(),
    xiling: zod_1.z
        .object({
        appId: zod_1.z.string().max(64).optional(),
        // 明文 AppKey,后端加密落盘;空字符串 = 不动旧 key
        appKey: zod_1.z.string().max(128).optional(),
        model: zod_1.z.enum(['turbo_v2', 'quality_v2']).optional(),
        baseUrl: zod_1.z.string().url().max(200).optional(),
        uploadMode: zod_1.z.enum(['qianshan_temp_upload', 'custom_public_asset']).optional(),
        tempUploadUrl: zod_1.z.string().url().max(500).or(zod_1.z.literal('')).optional(),
        tempUploadToken: zod_1.z.string().max(500).optional(),
    })
        .optional(),
});
router.put('/prefs', (0, validate_1.validateBody)(PrefsUpdateSchema), (req, res) => {
    try {
        const updated = digital_human_prefs_1.digitalHumanPrefs.set(req.body);
        res.json(ok(updated));
    }
    catch (err) {
        logger_1.logger.error('digital-human/prefs PUT error: ' + err);
        res.status(500).json(fail(err));
    }
});
router.delete('/prefs', (_req, res) => {
    try {
        res.json(ok(digital_human_prefs_1.digitalHumanPrefs.clear()));
    }
    catch (err) {
        logger_1.logger.error('digital-human/prefs DELETE error: ' + err);
        res.status(500).json(fail(err));
    }
});
/**
 * 非破坏性 smoke test:
 *   - 当前 provider 是阿里:只确认云端 voice 类百炼 key 拉得到
 *   - 当前 provider 是曦灵:只验证 AppID + AppKey 能生成签名(不真调付费接口)
 * 任何 OK 都说明配置层无明显问题;不保证真生成时不出错。
 */
router.post('/prefs/test', async (_req, res) => {
    try {
        const { provider, aliyun, xiling } = digital_human_prefs_1.digitalHumanPrefs.getResolved();
        if (provider === 'baidu_xiling_photo') {
            if (!xiling) {
                return res.status(400).json(fail('曦灵 AppID 或 AppKey 未配置'));
            }
            if (xiling.uploadMode === 'custom_public_asset' && !xiling.tempUploadUrl) {
                return res
                    .status(400)
                    .json(fail('曦灵需要公网素材上传接口,请填写自定义公网素材接口 URL'));
            }
            if (xiling.uploadMode === 'qianshan_temp_upload' && !(0, license_1.getMemberInfo)()?.accessToken) {
                return res.status(400).json(fail('千山临时素材上传需要先登录千山账号'));
            }
            // 试生成一次签名,签得出来就算 smoke ok
            const { makeXilingAuth } = require('../services/xiling-auth');
            const auth = makeXilingAuth(xiling.appId, xiling.appKey);
            const parts = auth.split('/');
            if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
                return res.status(500).json(fail('签名生成异常(格式不符)'));
            }
            return res.json(ok({
                provider,
                xilingSignaturePreview: `${parts[0]}/${parts[1].slice(0, 8)}.../${parts[2]}`,
                model: xiling.model,
                baseUrl: xiling.baseUrl,
                uploadMode: xiling.uploadMode,
                tempUploadConfigured: !!xiling.tempUploadUrl,
                message: '签名生成成功;实际生成请用真分镜验证(避免无谓计费)',
            }));
        }
        // 阿里路径:优先本地百炼 key,兼容旧版云端 voice key
        if (aliyun?.apiKey) {
            return res.json(ok({
                provider,
                model: aliyun.model || 'wan2.2-s2v',
                message: '本地百炼 Key 已配置,可调用阿里万相 wan2.2-s2v',
            }));
        }
        const { getCloudDefault } = require('../services/cloud-llm-config');
        const cloud = await getCloudDefault('voice', 'aliyun_dashscope');
        if (!cloud?.apiKey) {
            return res
                .status(400)
                .json(fail('阿里数字人未配置本地百炼 Key,也未拉到旧版云端 voice 类百炼 Key'));
        }
        return res.json(ok({ provider, message: '旧版云端 voice 类 key 拉取成功,可调用 wan2.2-s2v' }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=digital-human.js.map
