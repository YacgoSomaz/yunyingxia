"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateViaBaiduXiling = generateViaBaiduXiling;
/**
 * 百度曦灵照片数字人 — submit + 轮询 + 下载
 *
 * 流程:
 *   1) prepareXilingInputUrls() 把本地 image/audio → 公网 HTTPS URL
 *   2) POST /api/digitalhuman/open/v1/video/image/submit
 *   3) GET  /api/digitalhuman/open/v1/video/image/task?taskId=&requestId=
 *   4) videoUrl 下载到本地 outputPath
 *
 * 失败行为(跟阿里一致):
 *   - 抛错让 generateDigitalHumanBatch 单分镜降级,主流程不中断
 *
 * 文档:https://cloud.baidu.com/doc/AI_DH/s/Ylywv4uqg
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const logger_1 = require("../utils/logger");
const xiling_auth_1 = require("./xiling-auth");
const xiling_public_assets_1 = require("./xiling-public-assets");
function netFetch(url, init) {
    return (electron_1.net?.fetch || fetch)(url, init);
}
const XILING_ESTIMATE_CNY_PER_SEC = 0.075; // 占位估价,实际以百度后台账单为准
function probeAudioDuration(audioPath) {
    try {
        const { execFileSync } = require('child_process');
        const { getFfprobePath } = require('../utils/binaries');
        const out = execFileSync(getFfprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return Number(JSON.parse(out)?.format?.duration) || 0;
    }
    catch {
        return 0;
    }
}
async function generateViaBaiduXiling(req, cfg) {
    const startMs = Date.now();
    if (!fs_1.default.existsSync(req.imagePath)) {
        throw new Error(`数字人形象图不存在: ${req.imagePath}`);
    }
    if (!fs_1.default.existsSync(req.audioPath)) {
        throw new Error(`音频文件不存在: ${req.audioPath}`);
    }
    const audioDur = probeAudioDuration(req.audioPath);
    // 曦灵对极短音频可能直接 reject,< 0.5s 直接跳过
    if (audioDur > 0 && audioDur < 0.5) {
        throw new Error(`音频时长 ${audioDur.toFixed(2)}s 过短,曦灵无法生成`);
    }
    // 1) 准备公网 URL
    const urls = await (0, xiling_public_assets_1.prepareXilingInputUrls)({
        imagePath: req.imagePath,
        audioPath: req.audioPath,
        cfg,
    });
    // 2) 提交任务
    const requestId = crypto_1.default.randomUUID();
    const submitUrl = `${normalizeBaseUrl(cfg.baseUrl)}/api/digitalhuman/open/v1/video/image/submit`;
    const submitBody = {
        requestId,
        model: cfg.model,
        driveType: 'VOICE',
        inputImageUrl: urls.inputImageUrl,
        inputAudioUrl: urls.inputAudioUrl,
    };
    logger_1.logger.info(`[DigitalHuman:Xiling] submit model=${cfg.model} requestId=${requestId}`);
    let submitRes;
    try {
        submitRes = await netFetch(submitUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: (0, xiling_auth_1.makeXilingAuth)(cfg.appId, cfg.appKey),
            },
            body: JSON.stringify(submitBody),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (err) {
        await safeCleanup(urls);
        throw new Error(`曦灵提交网络异常: ${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        await safeCleanup(urls);
        throw new Error(`曦灵提交失败 HTTP ${submitRes.status}: ${submitText.slice(0, 300)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        await safeCleanup(urls);
        throw new Error(`曦灵提交响应非 JSON: ${submitText.slice(0, 300)}`);
    }
    const bizCode = submitJson?.code ?? submitJson?.result?.code ?? submitJson?.data?.code;
    if (bizCode != null && String(bizCode) !== '0' && String(bizCode) !== '200') {
        await safeCleanup(urls);
        throw new Error(`曦灵提交业务码异常 code=${bizCode} msg=${submitJson?.message || submitJson?.msg || ''}`);
    }
    const taskId = submitJson?.result?.taskId ||
        submitJson?.result?.task_id ||
        submitJson?.data?.taskId ||
        submitJson?.data?.task_id ||
        submitJson?.taskId ||
        submitJson?.task_id;
    if (!taskId) {
        await safeCleanup(urls);
        throw new Error(`曦灵提交未返回 taskId: ${submitText.slice(0, 300)}`);
    }
    logger_1.logger.info(`[DigitalHuman:Xiling] task submitted: ${taskId}`);
    // 3) 轮询 (首次 3s,后续每 5s,总超时 10min,排队比阿里慢)
    const MAX_WAIT = 10 * 60 * 1000;
    let pollInterval = 3000;
    const pollStart = Date.now();
    let lastStatus = '';
    let lastLoggedAt = 0;
    let videoUrl = '';
    let durationSec = 0;
    while (Date.now() - pollStart < MAX_WAIT) {
        await new Promise((r) => setTimeout(r, pollInterval));
        if (pollInterval < 5000)
            pollInterval = 5000;
        const pollUrl = `${normalizeBaseUrl(cfg.baseUrl)}/api/digitalhuman/open/v1/video/image/task?taskId=${encodeURIComponent(taskId)}&requestId=${encodeURIComponent(requestId)}`;
        let pollRes;
        try {
            pollRes = await netFetch(pollUrl, {
                headers: { Authorization: (0, xiling_auth_1.makeXilingAuth)(cfg.appId, cfg.appKey) },
                signal: AbortSignal.timeout(15000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[DigitalHuman:Xiling] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        if (!pollRes.ok) {
            logger_1.logger.warn(`[DigitalHuman:Xiling] poll HTTP ${pollRes.status}`);
            continue;
        }
        const pollText = await pollRes.text();
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            logger_1.logger.warn(`[DigitalHuman:Xiling] poll response not JSON: ${pollText.slice(0, 100)}`);
            continue;
        }
        const data = pollJson?.result || pollJson?.data || pollJson;
        // 状态字段在不同版本可能叫 status / taskStatus / state,都试一下
        const rawStatus = data?.status ?? data?.taskStatus ?? data?.task_status ?? data?.state ?? '';
        const status = normalizeTaskStatus(rawStatus);
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[DigitalHuman:Xiling:${taskId}] status=${status || '(empty)'} elapsed=${((Date.now() - pollStart) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        // 成功:覆盖 success/succeeded/done/finished/completed/complete 多种写法
        if (/^(success|succeeded|done|finished|complete[d]?)$/.test(status)) {
            videoUrl =
                data?.videoUrl ||
                    data?.video_url ||
                    data?.resultUrl ||
                    data?.result_url ||
                    data?.outputUrl ||
                    data?.output_url ||
                    data?.video?.url ||
                    '';
            durationSec = normalizeDurationSec(data?.durationSec || data?.duration || audioDur, audioDur);
            if (!videoUrl) {
                await safeCleanup(urls);
                throw new Error(`曦灵 SUCCEEDED 但未返回 videoUrl: ${pollText.slice(0, 300)}`);
            }
            break;
        }
        // 失败:覆盖 fail/failed/error/cancelled/canceled/expired
        if (/^(fail(ed)?|error|cancel(led|ed)|expired)$/.test(status)) {
            const msg = data?.message || data?.msg || data?.errorMsg || pollText.slice(0, 200);
            await safeCleanup(urls);
            throw new Error(`曦灵生成失败 status=${status} msg=${msg}`);
        }
    }
    if (!videoUrl) {
        await safeCleanup(urls);
        throw new Error(`曦灵生成超时(10min, last_status=${lastStatus || '(empty)'})`);
    }
    // 4) 下载视频到本地
    fs_1.default.mkdirSync(path_1.default.dirname(req.outputPath), { recursive: true });
    logger_1.logger.info(`[DigitalHuman:Xiling:${taskId}] downloading ${videoUrl.slice(0, 80)}...`);
    let dl;
    try {
        dl = await netFetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    }
    catch (err) {
        await safeCleanup(urls);
        throw new Error(`曦灵视频下载网络异常: ${String(err?.message || err)}`);
    }
    if (!dl.ok) {
        await safeCleanup(urls);
        throw new Error(`曦灵视频下载失败 HTTP ${dl.status}`);
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    fs_1.default.writeFileSync(req.outputPath, buf);
    await safeCleanup(urls);
    const elapsedSec = (Date.now() - startMs) / 1000;
    const costEstimateCny = +(durationSec * XILING_ESTIMATE_CNY_PER_SEC).toFixed(3);
    logger_1.logger.info(`[DigitalHuman:Xiling:${taskId}] done ${(buf.length / 1024 / 1024).toFixed(1)}MB ` +
        `dur=${durationSec.toFixed(1)}s cost≈¥${costEstimateCny} elapsed=${elapsedSec.toFixed(1)}s`);
    return {
        localPath: req.outputPath,
        taskId: String(taskId),
        elapsedSec,
        costEstimateCny,
        durationSec,
    };
}
async function safeCleanup(urls) {
    if (!urls.cleanup)
        return;
    try {
        await urls.cleanup();
    }
    catch (err) {
        logger_1.logger.warn(`[DigitalHuman:Xiling] cleanup failed: ${String(err?.message || err)}`);
    }
}
function normalizeBaseUrl(baseUrl) {
    return (baseUrl || 'https://open.xiling.baidu.com').replace(/\/+$/, '');
}
function normalizeTaskStatus(raw) {
    if (typeof raw === 'number') {
        if (raw === 2 || raw === 3)
            return 'success';
        if (raw < 0 || raw === 4 || raw === 5)
            return 'failed';
        return 'processing';
    }
    const s = String(raw || '').trim().toLowerCase();
    if (!s)
        return '';
    if (['success', 'succeeded', 'done', 'finished', 'completed', 'complete'].includes(s)) {
        return 'success';
    }
    if (['fail', 'failed', 'failure', 'error', 'cancelled', 'canceled', 'expired'].includes(s)) {
        return 'failed';
    }
    if (['running', 'processing', 'pending', 'queueing', 'queued', 'created'].includes(s)) {
        return 'processing';
    }
    return s;
}
function normalizeDurationSec(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
        return fallback || 0;
    // 曦灵部分响应 duration 使用毫秒。
    return n > 1000 ? n / 1000 : n;
}
//# sourceMappingURL=xiling-photo.js.map