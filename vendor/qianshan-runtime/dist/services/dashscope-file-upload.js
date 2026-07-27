"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToDashscope = uploadFileToDashscope;
/**
 * 阿里云百炼 - 临时文件上传
 *
 * 工作流：
 *   1) GET /api/v1/uploads?action=getPolicy&model={model}  → 拿 OSS 上传凭证
 *   2) POST {upload_host}（multipart/form-data）          → 把文件传到百炼内部 OSS
 *   3) 返回 oss://{key} URL                                → 后续 API 调用时直接传它
 *
 * 关键限制：
 *   - 上传时指定的 model 必须跟后续调用模型一致（百炼按 model 隔离访问权限）
 *   - 上传后的文件 48h 后自动失效，不可下载/查询/修改，只能消费
 *   - 调用消费方 API 时必须加 header `X-DashScope-OssResourceResolve: enable`
 *     否则百炼不识别这个内部 oss:// URL
 *
 * 文档：https://help.aliyun.com/zh/model-studio/get-temporary-file-url
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../utils/logger");
const cloud_llm_config_1 = require("./cloud-llm-config");
const local_llm_config_1 = require("./local-llm-config");
const GET_POLICY_URL = 'https://dashscope.aliyuncs.com/api/v1/uploads';
/**
 * 上传本地文件到百炼临时存储，返回 oss:// 形式的内部 URL。
 *
 * @param localPath 本地文件绝对路径
 * @param model 上传时绑定的 model（消费方 API 用啥就传啥；声音复刻用 'voice-enrollment'）
 * @returns oss://{upload_dir}/{filename} —— 直接给消费方 API 用
 */
async function uploadFileToDashscope(localPath, model) {
    const localVoice = await local_llm_config_1.localLlmConfig.getVoiceCredential();
    const cloud = await (0, cloud_llm_config_1.getCloudDefault)('voice', 'aliyun_dashscope');
    const apiKey = localVoice?.apiKey || cloud?.apiKey;
    if (!apiKey) {
        throw new Error('未配置百炼 voice key，请在运营虾本地模型配置里填写口播/声音克隆配置');
    }
    if (!fs_1.default.existsSync(localPath))
        throw new Error(`文件不存在: ${localPath}`);
    // ── 1) 拿上传凭证 ──
    const policyUrl = `${GET_POLICY_URL}?action=getPolicy&model=${encodeURIComponent(model)}`;
    const policyRes = await fetch(policyUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!policyRes.ok) {
        const txt = await policyRes.text().catch(() => '');
        throw new Error(`百炼 getPolicy 失败 HTTP ${policyRes.status}: ${txt.slice(0, 200)}`);
    }
    const policyJson = (await policyRes.json());
    const p = policyJson.data;
    if (!p?.upload_host || !p?.policy) {
        throw new Error(`百炼 getPolicy 返回字段不全: ${JSON.stringify(policyJson).slice(0, 200)}`);
    }
    // ── 2) multipart 上传到 OSS ──
    const filename = path_1.default.basename(localPath);
    const key = `${p.upload_dir}/${filename}`;
    const fileBuf = fs_1.default.readFileSync(localPath);
    const form = new FormData();
    form.append('OSSAccessKeyId', p.oss_access_key_id);
    form.append('Signature', p.signature);
    form.append('policy', p.policy);
    form.append('x-oss-object-acl', p.x_oss_object_acl);
    form.append('x-oss-forbid-overwrite', p.x_oss_forbid_overwrite);
    form.append('key', key);
    form.append('success_action_status', '200');
    // file 必须放最后（OSS multipart 协议要求）
    form.append('file', new Blob([fileBuf]), filename);
    const uploadRes = await fetch(p.upload_host, { method: 'POST', body: form });
    if (!uploadRes.ok) {
        const txt = await uploadRes.text().catch(() => '');
        throw new Error(`百炼 OSS upload 失败 HTTP ${uploadRes.status}: ${txt.slice(0, 200)}`);
    }
    const ossUrl = `oss://${key}`;
    logger_1.logger.info(`[DashScope][Upload] ${filename} (${(fileBuf.length / 1024).toFixed(1)} KB) → ${ossUrl}`);
    return ossUrl;
}
//# sourceMappingURL=dashscope-file-upload.js.map
