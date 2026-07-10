"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesizeToMp3 = synthesizeToMp3;
exports.checkTtsHealth = checkTtsHealth;
exports.addNaturalPauses = addNaturalPauses;
/**
 * 纯 JS Edge TTS 封装（走微软 Edge 浏览器的 Read Aloud API）
 *
 * - 不依赖用户本地 Python / edge-tts 命令行
 * - 通过 WebSocket 拉 MP3 字节流，直接写磁盘
 * - `toFile` 会返回 audio 路径和 metadata（word/sentence boundary）路径
 *
 * 备注：微软 API 有限流，短时内大并发可能 429。这里用最简的串行实现，
 * 每段文案独立一个 MsEdgeTTS 实例 + close()，避免长连接占用。
 */
const logger_1 = require("../utils/logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const binaries_1 = require("../utils/binaries");
/**
 * Edge TTS 输出的 MP3 自带 LAME 编码器 info-tag(头部 + 末尾 ≈ 1~1.3s 静音 padding)。
 *
 * 影响:
 *   - 单段 `ffprobe stream=duration` 读纯样本时长,**不含 padding**
 *   - `ffmpeg concat -c copy` 合并时**保留全部样本**(padding 不去除)
 *   - 30 段 Edge MP3 concat 后总时长 = 各段 probed 累计 + N × ~1.3s
 *   - → 字幕同步校正打 +15s 漂移 → 全局 scaling 拉长字幕 → 用户感知字幕跟不上
 *
 * 修复:合成完立即 ffmpeg 重编码一次。
 *   - 重编码会丢弃源文件的 LAME info-tag,产生干净的 MP3
 *   - probed 跟实际播放长度一致,concat 后不会再多出 padding
 *   - 同时 `-af aresample=async=1` 让样本严格对齐时间轴
 *
 * 性能成本:每段加 ~100-200ms 的 ffmpeg encode,30 段视频 ≈ 3-6s,可接受
 */
function stripLameInfoTagPadding(mp3Path) {
    if (!fs_1.default.existsSync(mp3Path))
        return;
    const cleanPath = mp3Path + '.clean.mp3';
    try {
        (0, child_process_1.execFileSync)((0, binaries_1.getFfmpegPath)(), [
            '-y',
            '-i', mp3Path,
            '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1',
            // 去掉源文件所有 metadata(包括 LAME info-tag)
            '-map_metadata', '-1',
            // aresample 强制重采样,消除 encoder delay
            '-af', 'aresample=async=1:first_pts=0',
            cleanPath,
        ], { stdio: 'ignore' });
        if (fs_1.default.existsSync(cleanPath) && fs_1.default.statSync(cleanPath).size > 100) {
            fs_1.default.unlinkSync(mp3Path);
            fs_1.default.renameSync(cleanPath, mp3Path);
        }
    }
    catch (err) {
        logger_1.logger.warn(`[TTS][Edge] LAME padding 清理失败,保留原文件(后续 concat 可能有 ~1s 漂移): ${String(err?.message || err).slice(0, 120)}`);
        try {
            if (fs_1.default.existsSync(cleanPath))
                fs_1.default.unlinkSync(cleanPath);
        }
        catch { }
    }
}
/**
 * 把文案合成到 mp3 文件。
 * 成功返回 outPath；失败抛异常（调用方可以 catch 后走占位/降级）。
 */
async function synthesizeToMp3(opts) {
    // 带重试：微软 Edge Read Aloud 对太短/太简单的文本偶尔返回空 stream（"No audio data received"）
    let lastErr;
    const text = (opts.text || '').trim() || '（空文案）';
    // 太短的文案补一点文字让服务器更愿意干活
    const paddedText = text.length < 4 ? text + '。请注意。' : text;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await synthesizeOnce({ ...opts, text: paddedText });
        }
        catch (err) {
            lastErr = err;
            // 短暂等待后重试
            await new Promise((r) => setTimeout(r, 300 + attempt * 500));
        }
    }
    throw new Error(`TTS 合成失败（重试 3 次）：${String(lastErr?.message || lastErr)}`);
}
async function synthesizeOnce(opts) {
    // 延迟 require，让 main 的启动不依赖 msedge-tts 是否真的能 import
    let MsEdgeTTS;
    let OUTPUT_FORMAT;
    try {
        const mod = require('msedge-tts');
        MsEdgeTTS = mod.MsEdgeTTS;
        OUTPUT_FORMAT = mod.OUTPUT_FORMAT;
    }
    catch (err) {
        throw new Error(`msedge-tts 未正确安装: ${String(err)}`);
    }
    // MsEdgeTTS.toFile 把传入路径当作"目录"，在里面产生 audio.mp3
    const parentDir = path_1.default.dirname(opts.outPath);
    fs_1.default.mkdirSync(parentDir, { recursive: true });
    const tmpDir = path_1.default.join(parentDir, `.tts-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    fs_1.default.mkdirSync(tmpDir, { recursive: true });
    const tts = new MsEdgeTTS();
    try {
        // 音质从 48kbps 升级到 96kbps（免费升级，文件大小翻倍但音质明显更好）
        await tts.setMetadata(opts.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        // 注：SSML break 标签会让 msedge-tts 的默认 template 嵌套出错（微软服务返空）
        // 改用"标点重复"来模拟停顿：句号 → 句号+空格（edge-tts 对连续符号有短暂停顿）
        const richText = addNaturalPauses(opts.text);
        // toFile 支持 ProsodyOptions 控制语速/语调/音量
        const prosody = {};
        if (opts.rate && opts.rate !== '+0%')
            prosody.rate = opts.rate;
        if (opts.pitch && opts.pitch !== '+0Hz')
            prosody.pitch = opts.pitch;
        const { audioFilePath } = Object.keys(prosody).length > 0
            ? await tts.toFile(tmpDir, richText, prosody)
            : await tts.toFile(tmpDir, richText);
        // 校验文件真的有内容（>100 字节才算合成成功；避免 server 返回空 stream 但被当作 success）
        try {
            const stat = fs_1.default.statSync(audioFilePath);
            if (!stat.size || stat.size < 100) {
                throw new Error(`No audio data received (size=${stat.size})`);
            }
        }
        catch (err) {
            throw err;
        }
        try {
            if (fs_1.default.existsSync(opts.outPath))
                fs_1.default.unlinkSync(opts.outPath);
            fs_1.default.renameSync(audioFilePath, opts.outPath);
            // 抹掉 LAME info-tag padding,让 probed 与 concat 后时长一致(否则字幕会漂移)
            stripLameInfoTagPadding(opts.outPath);
            return opts.outPath;
        }
        catch {
            // rename 失败兜底:直接对原路径清 padding 后返回
            stripLameInfoTagPadding(audioFilePath);
            return audioFilePath;
        }
    }
    finally {
        try {
            tts.close();
        }
        catch {
            /* swallow */
        }
        try {
            fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
        catch {
            /* swallow */
        }
    }
}
/** 启动自检：试合成一段极短文本，看 TTS 链路是否通 */
async function checkTtsHealth() {
    const probeDir = path_1.default.join(require('os').tmpdir(), 'qianshan-tts-probe');
    fs_1.default.mkdirSync(probeDir, { recursive: true });
    const out = path_1.default.join(probeDir, `probe-${Date.now()}.mp3`);
    try {
        await synthesizeToMp3({
            voice: 'zh-CN-XiaoxiaoNeural',
            text: '你好',
            outPath: out,
        });
        try {
            fs_1.default.unlinkSync(out);
        }
        catch { }
        return { ok: true };
    }
    catch (err) {
        logger_1.logger.warn('[TTS] health probe failed: ' + String(err?.message || err));
        return { ok: false, error: String(err?.message || err) };
    }
}
/**
 * 让配音更有节奏。
 *
 * 我们**不用 SSML break**，因为 msedge-tts 的默认 template 已经把文本包在
 * `<prosody>` 内，再插 `<break>` 会让微软服务端返空（实测 7/7 都挂）。
 *
 * 改用纯文本技巧：
 * - 规整句末标点（去掉重复/混用）
 * - 保留换行（edge-tts 对段落换行本身就会做短停顿）
 * - 在英文字母/数字前后补空格，避免被当整体快读
 */
function addNaturalPauses(text) {
    if (!text)
        return '';
    let t = text;
    // 1. 规范标点：多个连续标点合成一个
    t = t.replace(/[。！？]{2,}/g, (m) => m[0]);
    t = t.replace(/[，；]{2,}/g, (m) => m[0]);
    // 2. 段落换行 → 句号换行（给 TTS 提供更清晰的停顿信号）
    t = t.replace(/\n\n+/g, '。\n');
    // 3. 英文/数字两端加空格（例："React useEffect" 会被当整体，加空格后分开）
    t = t.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2');
    t = t.replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
    return t;
}
//# sourceMappingURL=tts-edge.js.map