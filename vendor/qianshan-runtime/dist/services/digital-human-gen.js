"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDigitalHuman = generateDigitalHuman;
exports.generateDigitalHumanBatch = generateDigitalHumanBatch;
exports.overlayDigitalHuman = overlayDigitalHuman;
/**
 * 数字人生成 — provider 分发(阿里万相 wan2.2-s2v / 百度曦灵照片数字人)
 *
 * provider 切换在 Settings 页本地配置(digital-human-prefs),不进云端 user_llm_config。
 *
 * 两个 provider 都最终产出本地 mp4,后续 overlayDigitalHuman 不需要知道来源。
 *
 * 阿里 wan2.2-s2v 限制:
 *   - 音频 <20s + 文件 <15MB,图片 [400,7000]px + <10MB,必须北京地域 key
 *   - 480P ¥0.5/秒,720P ¥0.9/秒,复用云端 voice 类百炼 sk-xxx
 *
 * 百度曦灵限制(详见 xiling-photo.ts):
 *   - 需要 inputImageUrl/inputAudioUrl 公网 HTTPS(本地路径不行)
 *   - 用户自己的 AppID/AppKey,在 Settings 配
 *   - turbo_v2 / quality_v2 两档,价格以百度后台为准
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const logger_1 = require("../utils/logger");
const cloud_llm_config_1 = require("./cloud-llm-config");
const dashscope_file_upload_1 = require("./dashscope-file-upload");
const digital_human_prefs_1 = require("./digital-human-prefs");
const xiling_photo_1 = require("./xiling-photo");
const SUBMIT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis';
const TASK_BASE = 'https://dashscope.aliyuncs.com/api/v1/tasks/';
const MODEL = 'wan2.2-s2v';
/** 取百炼 API key — 复用 voice 类配置 */
async function getDashscopeKey() {
    const local = digital_human_prefs_1.digitalHumanPrefs.getResolved().aliyun?.apiKey;
    if (local) {
        return local;
    }
    try {
        const cloud = await (0, cloud_llm_config_1.getCloudDefault)('voice', 'aliyun_dashscope');
        return cloud?.apiKey || null;
    }
    catch (err) {
        logger_1.logger.warn(`[DigitalHuman] get dashscope key failed: ${String(err)}`);
        return null;
    }
}
/** 用 Electron net.fetch 走 Chrome 网络栈(全局 fetch 已替换,但保险起见显式标注) */
function netFetch(url, init) {
    return (electron_1.net?.fetch || fetch)(url, init);
}
/**
 * 检查音频时长是否 ≤ 20s。超了就返 false 让上层跳过这个分镜。
 * 用 ffprobe 探,失败时保守认为可以(让 API 自己拒)。
 */
function probeAudioDuration(audioPath) {
    try {
        const { execFileSync } = require('child_process');
        const { getFfprobePath } = require('../utils/binaries');
        const out = execFileSync(getFfprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const json = JSON.parse(out);
        return Number(json?.format?.duration) || 0;
    }
    catch {
        return 0;
    }
}
/**
 * 生成一段数字人视频 — 看 prefs 选 provider 分发。
 * 失败抛错 — generateDigitalHumanBatch 单分镜失败会降级"不叠数字人",主流程不中断。
 */
async function generateDigitalHuman(req) {
    const { provider, xiling } = digital_human_prefs_1.digitalHumanPrefs.getResolved();
    if (provider === 'baidu_xiling_photo') {
        if (!xiling) {
            throw new Error('已选百度曦灵但 AppID/AppKey 未配置 — 请到 设置→AI 模型→数字人形象 填曦灵 AppID/AppKey,' +
                '或把数字人供应商切回阿里万相');
        }
        return (0, xiling_photo_1.generateViaBaiduXiling)(req, xiling);
    }
    // 默认 / 'aliyun_wan_s2v' → 走阿里
    return generateViaAliyunWanS2V(req);
}
/**
 * 阿里万相 wan2.2-s2v 实现 — 原 generateDigitalHuman 的内容,无功能改动。
 */
async function generateViaAliyunWanS2V(req) {
    const startMs = Date.now();
    const resolution = req.resolution || '480P';
    // 0) 健壮性
    if (!fs_1.default.existsSync(req.imagePath)) {
        throw new Error(`数字人形象图不存在: ${req.imagePath}`);
    }
    if (!fs_1.default.existsSync(req.audioPath)) {
        throw new Error(`音频文件不存在: ${req.audioPath}`);
    }
    const audioDur = probeAudioDuration(req.audioPath);
    if (audioDur > 0 && audioDur > 20) {
        throw new Error(`音频时长 ${audioDur.toFixed(1)}s 超过 wan2.2-s2v 限制(<20s),请缩短文案`);
    }
    const audioStat = fs_1.default.statSync(req.audioPath);
    if (audioStat.size > 15 * 1024 * 1024) {
        throw new Error(`音频文件 ${(audioStat.size / 1024 / 1024).toFixed(1)} MB 超过 15MB`);
    }
    // 1) 拿 API key
    const apiKey = await getDashscopeKey();
    if (!apiKey) {
        throw new Error('未配置百炼 voice key — 数字人功能复用口播/声音克隆配置，请到「设置 → AI 模型/算力」填写本地百炼 Key');
    }
    // 2) 上传音频 + 图片到 dashscope OSS
    // model 必须传 wan2.2-s2v(百炼按 model 隔离访问权限)
    logger_1.logger.info(`[DigitalHuman] uploading audio+image (audio dur=${audioDur.toFixed(1)}s)`);
    const [audioOssUrl, imageOssUrl] = await Promise.all([
        (0, dashscope_file_upload_1.uploadFileToDashscope)(req.audioPath, MODEL),
        (0, dashscope_file_upload_1.uploadFileToDashscope)(req.imagePath, MODEL),
    ]);
    // 3) 提交生成任务
    logger_1.logger.info(`[DigitalHuman] submit ${MODEL} resolution=${resolution}`);
    const submitBody = {
        model: MODEL,
        input: {
            image_url: imageOssUrl,
            audio_url: audioOssUrl,
        },
        parameters: {
            resolution,
        },
    };
    const submitRes = await netFetch(SUBMIT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-DashScope-Async': 'enable',
            'X-DashScope-OssResourceResolve': 'enable', // 让百炼识别我们传的 oss:// URL
        },
        body: JSON.stringify(submitBody),
        signal: AbortSignal.timeout(30000),
    });
    if (!submitRes.ok) {
        const text = await submitRes.text();
        throw new Error(`数字人提交失败 HTTP ${submitRes.status}: ${text.slice(0, 300)}`);
    }
    const submitJson = (await submitRes.json());
    const taskId = submitJson?.output?.task_id;
    if (!taskId) {
        throw new Error(`数字人提交未返回 task_id: ${JSON.stringify(submitJson).slice(0, 300)}`);
    }
    logger_1.logger.info(`[DigitalHuman] task submitted: ${taskId}`);
    // 4) 轮询(总超时 5min,每 5s 一次,首次 3s)
    const MAX_WAIT = 5 * 60 * 1000;
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
        let pollRes;
        try {
            pollRes = await netFetch(`${TASK_BASE}${taskId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(15000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[DigitalHuman] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        if (!pollRes.ok) {
            logger_1.logger.warn(`[DigitalHuman] poll HTTP ${pollRes.status}`);
            continue;
        }
        const pollJson = (await pollRes.json());
        const status = String(pollJson?.output?.task_status || '');
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[DigitalHuman:${taskId}] status=${status} elapsed=${((Date.now() - pollStart) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (status === 'SUCCEEDED') {
            videoUrl = pollJson?.output?.results?.video_url || '';
            durationSec = Number(pollJson?.usage?.duration) || audioDur || 0;
            if (!videoUrl) {
                throw new Error(`数字人 SUCCEEDED 但 results.video_url 为空: ${JSON.stringify(pollJson).slice(0, 300)}`);
            }
            break;
        }
        if (status === 'FAILED') {
            const msg = pollJson?.output?.message || pollJson?.output?.code || '未知';
            throw new Error(`数字人生成失败: ${msg}`);
        }
    }
    if (!videoUrl) {
        throw new Error(`数字人生成超时(5min, last_status=${lastStatus})`);
    }
    // 5) 下载到本地
    fs_1.default.mkdirSync(path_1.default.dirname(req.outputPath), { recursive: true });
    logger_1.logger.info(`[DigitalHuman:${taskId}] downloading ${videoUrl.slice(0, 80)}...`);
    const dl = await netFetch(videoUrl, { signal: AbortSignal.timeout(60000) });
    if (!dl.ok)
        throw new Error(`数字人视频下载失败 HTTP ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    fs_1.default.writeFileSync(req.outputPath, buf);
    const elapsedSec = (Date.now() - startMs) / 1000;
    // 估价:480P ¥0.5/秒,720P ¥0.9/秒
    const unitPrice = resolution === '720P' ? 0.9 : 0.5;
    const costEstimateCny = +(durationSec * unitPrice).toFixed(2);
    logger_1.logger.info(`[DigitalHuman:${taskId}] done ${(buf.length / 1024 / 1024).toFixed(1)}MB ` +
        `dur=${durationSec.toFixed(1)}s cost≈¥${costEstimateCny} elapsed=${elapsedSec.toFixed(1)}s`);
    return {
        localPath: req.outputPath,
        taskId: String(taskId),
        elapsedSec,
        costEstimateCny,
        durationSec,
    };
}
/** 给定一组分镜请求,并发(默认 2 路,避免触限)生成 */
async function generateDigitalHumanBatch(requests, concurrency = 2, onProgress) {
    const results = [];
    const queue = [...requests];
    let nextIndex = 0;
    const runOne = async () => {
        while (true) {
            const idx = nextIndex++;
            if (idx >= queue.length)
                break;
            const item = queue[idx];
            onProgress?.(item.sceneIndex, 'start');
            try {
                const result = await generateDigitalHuman(item.req);
                results.push({ sceneIndex: item.sceneIndex, result });
                onProgress?.(item.sceneIndex, 'done');
            }
            catch (err) {
                const msg = String(err?.message || err);
                results.push({ sceneIndex: item.sceneIndex, error: msg });
                onProgress?.(item.sceneIndex, 'fail', msg);
                logger_1.logger.warn(`[DigitalHuman] scene ${item.sceneIndex} failed: ${msg}`);
            }
        }
    };
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(runOne());
    }
    await Promise.all(workers);
    // 按 sceneIndex 排序保持稳定输出
    results.sort((a, b) => a.sceneIndex - b.sceneIndex);
    return results;
}
/**
 * 把数字人视频 overlay 到主分镜视频右下角(圆形/矩形画中画)。
 *
 * 简单 ffmpeg 一步走:
 *   - 主输入:scene-N.mp4(主画面)
 *   - 副输入:avatar-N.mp4(数字人,带原音 → 我们用 -an 丢掉,只要画面)
 *   - 滤镜:[1:v]scale=W:W,format=yuva420p,圆形 mask(可选) → overlay 到右下
 *   - 输出:scene-N-with-avatar.mp4(继承主输入的 audio)
 */
async function overlayDigitalHuman(opts) {
    const { execFileSync } = require('child_process');
    const { getFfmpegPath } = require('../utils/binaries');
    const ff = getFfmpegPath();
    const size = opts.size || 280;
    const margin = opts.margin || 30;
    const position = opts.position || 'bottom-right';
    // 解析 shape:优先 shape 字段,否则按旧 circle 字段兜底
    const shape = opts.shape || (opts.circle !== false ? 'circle' : 'square');
    fs_1.default.mkdirSync(path_1.default.dirname(opts.outputPath), { recursive: true });
    // 按 shape 构造数字人滤镜链
    // 注意:必须保持原比例,否则人脸会变形(横向压扁/竖向拉伸)
    let avatarChain;
    if (shape === 'square') {
        // 中心裁切方形:先按短边 scale,再 crop 中心 size×size
        avatarChain =
            // scale 让短边 = size,长边按比例(-2 表示保持宽高比且强制偶数)
            `scale='if(gt(iw,ih),-2,${size})':'if(gt(iw,ih),${size},-2)'` +
                `,crop=${size}:${size}` +
                `,setsar=1`;
    }
    else if (shape === 'original') {
        // 原始比例:短边 = size,长边按比例,不抠像
        avatarChain =
            `scale='if(gt(iw,ih),-2,${size})':'if(gt(iw,ih),${size},-2)'` +
                `,setsar=1`;
    }
    else {
        // circle:保持原比例,然后用 geq 画一个最大内切椭圆/圆作 alpha mask
        // 注:这里椭圆半径用 W/2 和 H/2(不是 min(W,H)/2),所以方形源 = 正圆,矩形源 = 椭圆
        // 用户要"完美正圆"应选 square 模式
        avatarChain =
            `scale='if(gt(iw,ih),-2,${size})':'if(gt(iw,ih),${size},-2)'` +
                `,setsar=1` +
                `,format=yuva420p` +
                // 椭圆方程:((X-W/2)/(W/2))^2 + ((Y-H/2)/(H/2))^2 <= 1 表示在椭圆内
                // ffmpeg geq 不能直接写,改用平方比较:(X-W/2)^2 / (W/2)^2 + (Y-H/2)^2 / (H/2)^2 <= 1
                `,geq='r=r(X,Y):g=g(X,Y):b=b(X,Y):a=if(lte(pow((X-W/2)/(W/2)\\,2)+pow((Y-H/2)/(H/2)\\,2)\\,1)\\,255\\,0)'`;
    }
    // 4 角对应的 overlay 坐标(W/H 是主视频宽高,w/h 是数字人宽高)
    let overlayXY;
    switch (position) {
        case 'top-left':
            overlayXY = `${margin}:${margin}`;
            break;
        case 'top-right':
            overlayXY = `W-w-${margin}:${margin}`;
            break;
        case 'bottom-left':
            overlayXY = `${margin}:H-h-${margin}`;
            break;
        case 'bottom-right':
        default:
            overlayXY = `W-w-${margin}:H-h-${margin}`;
            break;
    }
    const filterComplex = `[1:v]${avatarChain}[av];` +
        `[0:v][av]overlay=${overlayXY}:shortest=1[v]`;
    const args = [
        '-y',
        '-i', opts.scenePath, // [0]
        '-i', opts.avatarPath, // [1]
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '0:a?', // 主分镜的音频(? = 如果没有就不报错)
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        opts.outputPath,
    ];
    try {
        execFileSync(ff, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    }
    catch (err) {
        const stderr = String(err?.stderr || '').slice(-1500);
        throw new Error(`overlay 数字人失败:${err?.message || err}\nstderr: ${stderr}`);
    }
    logger_1.logger.info(`[DigitalHuman][Overlay] done → ${opts.outputPath}`);
}
//# sourceMappingURL=digital-human-gen.js.map
