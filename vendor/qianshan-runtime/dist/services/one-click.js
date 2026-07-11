"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oneClick = exports.OneClickService = exports.SUBTITLE_STYLES = exports.VOICES = void 0;
/**
 * 一键成片（One-Click Video）
 *
 * 流程：文案 → LLM 拆分镜 → 按关键词搜图（用户可换/上传）→ TTS 配音 →
 *      生成 SRT 字幕 → ffmpeg 烧录字幕 + BGM 混音 → 输出 mp4
 *
 * 底层表：slideshow_videos（复用，前次产品路线切换时表名保留）
 */
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const llm_1 = require("./llm");
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const image_search_1 = require("./image-search");
const ass_subtitle_1 = require("./ass-subtitle");
const scene_splitter_1 = require("./scene-splitter");
const shared_1 = require("@qianshan/shared");
const scene_enrich_1 = require("./scene-enrich");
const ai_image_gen_1 = require("./ai-image-gen");
const ai_video_gen_1 = require("./ai-video-gen");
const binaries_1 = require("../utils/binaries");
const paths_1 = require("../utils/paths");
// TTS:百炼 sk-xxx 走 cosyvoice 或 MiniMax(由云端 modelName 决定),无 Key 时降级 Edge TTS
//   - cosyvoice 系列 → tts-dashscope.ts
//   - MiniMax/* 系列 → tts-minimax.ts(同一个 sk-xxx,不同 endpoint + body schema)
const tts_dashscope_1 = require("./tts-dashscope");
const tts_minimax_1 = require("./tts-minimax");
const tts_edge_1 = require("./tts-edge");
const cloud_llm_config_1 = require("./cloud-llm-config");
const llm_tier_config_1 = require("./llm-tier-config");
const dashscope_file_upload_1 = require("./dashscope-file-upload");
const tts_clone_1 = require("./tts-clone");
const tts_minimax_clone_1 = require("./tts-minimax-clone");
const external_credentials_1 = require("./external-credentials");
const content_audit_1 = require("./content-audit");
const data_viz_1 = require("./data-viz");
const director_analysis_1 = require("./director-analysis");
const llm_tiers_1 = require("./llm-tiers");
const engine_1 = require("./style-engine/engine");
const visual_styles_1 = require("./style-engine/visual-styles");
/** 判断错误是否为超时（AbortSignal.timeout 触发的 AbortError） */
function isTimeoutError(err) {
    const msg = String(err?.message || err || '');
    return /aborted|timeout|timed out/i.test(msg);
}
const drizzle_orm_1 = require("drizzle-orm");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
/** 清除 LLM 泄漏的角色 ID 标记，如 (char_007)、（char_008） */
function stripCharIds(text) {
    return text.replace(/[（(]char_\d+[）)]/g, '').replace(/\s{2,}/g, ' ').trim();
}
// ═══════════════ 静态元数据 ═══════════════
// TTS 音色库 —— 都通过百炼 sk-xxx 走通(provider='dashscope'):
//   - cosyvoice 系列(longanyang / longxiaochun_v3 等)→ 走 services/audio/tts/SpeechSynthesizer
//   - MiniMax 系列(male-qn-qingse / female-shaonv 等)→ 走 services/aigc/multimodal-generation/generation
// 路由由 dispatchTTS 内根据"云端 voice 配置的 modelName"决定:
//   - modelName 以 'MiniMax/' 开头 → 走 tts-minimax(用 voice.minimaxVoice 字段)
//   - 否则 → 走 tts-dashscope(用 voice.dashscopeVoice 字段)
// 每条音色都映射一个 Edge TTS 音色作为降级(没配百炼 Key 时用)。
// category 用于前端分组:female / male / dialect / character。
exports.VOICES = [
    // ─────── 女声（12 个）───────
    {
        id: 'dashscope-longanhuan',
        label: '龙安欢 · 女 · 欢脱元气（标杆）',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longanhuan',
        edgeVoice: 'zh-CN-XiaoxiaoNeural',
    },
    {
        id: 'dashscope-longanli',
        label: '龙安莉 · 女 · 利落从容',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longanli_v3',
        edgeVoice: 'zh-CN-XiaoxiaoNeural',
    },
    {
        id: 'dashscope-longanwen',
        label: '龙安温 · 女 · 优雅知性',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longanwen_v3',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'dashscope-longanqin',
        label: '龙安亲 · 女 · 亲和活泼',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longanqin_v3',
        edgeVoice: 'zh-CN-XiaoxiaoNeural',
    },
    {
        id: 'dashscope-longanya',
        label: '龙安雅 · 女 · 高雅气质',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longanya_v3',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'dashscope-longanling',
        label: '龙安灵 · 女 · 思维灵动',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longanling_v3',
        edgeVoice: 'zh-CN-XiaomengNeural',
    },
    {
        id: 'dashscope-longmiao',
        label: '龙妙 · 女 · 抑扬顿挫',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longmiao_v3',
        edgeVoice: 'zh-CN-XiaoxiaoNeural',
    },
    {
        id: 'dashscope-longyue',
        label: '龙悦 · 女 · 温暖磁性',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longyue_v3',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'dashscope-longyuan',
        label: '龙媛 · 女 · 温暖治愈',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longyuan_v3',
        edgeVoice: 'zh-CN-XiaomengNeural',
    },
    {
        id: 'dashscope-longxiaochun',
        label: '龙小淳 · 女 · 知性积极',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longxiaochun_v3',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'dashscope-longwanjun',
        label: '龙婉君 · 女 · 细腻柔声',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longwanjun_v3',
        edgeVoice: 'zh-CN-XiaomengNeural',
    },
    {
        // 旧字段保留，避免老用户已选偏好失效
        id: 'dashscope-longjiayi',
        label: '龙嘉怡 · 女 · 知性',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        dashscopeVoice: 'longjiayi_v3',
        edgeVoice: 'zh-CN-XiaomengNeural',
    },
    // ─────── 男声（9 个）───────
    {
        id: 'dashscope-longanyang',
        label: '龙安洋 · 男 · 阳光大男孩（标杆）',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longanyang',
        edgeVoice: 'zh-CN-YunxiNeural',
    },
    {
        id: 'dashscope-longanzhi',
        label: '龙安智 · 男 · 睿智轻熟',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longanzhi_v3',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    {
        id: 'dashscope-longanlang',
        label: '龙安朗 · 男 · 清爽利落',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longanlang_v3',
        edgeVoice: 'zh-CN-YunxiNeural',
    },
    {
        id: 'dashscope-longanyun',
        label: '龙安昀 · 男 · 居家暖男',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longanyun_v3',
        edgeVoice: 'zh-CN-YunjianNeural',
    },
    {
        id: 'dashscope-longsanshu',
        label: '龙三叔 · 男 · 沉稳质感',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longsanshu_v3',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    {
        id: 'dashscope-longxiu',
        label: '龙修 · 男 · 博才说书',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longxiu_v3',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    {
        id: 'dashscope-longnan',
        label: '龙楠 · 男 · 睿智青年',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longnan_v3',
        edgeVoice: 'zh-CN-YunxiNeural',
    },
    {
        id: 'dashscope-longyichen',
        label: '龙逸尘 · 男 · 洒脱活力',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longyichen_v3',
        edgeVoice: 'zh-CN-YunxiNeural',
    },
    {
        // 旧字段保留，避免老用户已选偏好失效
        id: 'dashscope-longshange',
        label: '龙陕哥 · 男 · 原味陕北',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        dashscopeVoice: 'longshange_v3',
        edgeVoice: 'zh-CN-YunjianNeural',
    },
    // ─────── 方言（3 个）───────
    {
        id: 'dashscope-longlaotie',
        label: '龙老铁 · 男 · 东北直率',
        gender: 'male',
        category: 'dialect',
        provider: 'dashscope',
        dashscopeVoice: 'longlaotie_v3',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    {
        id: 'dashscope-longjiaxin',
        label: '龙嘉欣 · 女 · 优雅粤语',
        gender: 'female',
        category: 'dialect',
        provider: 'dashscope',
        dashscopeVoice: 'longjiaxin_v3',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'dashscope-longanmin',
        label: '龙安闽 · 女 · 甜美闽南',
        gender: 'female',
        category: 'dialect',
        provider: 'dashscope',
        dashscopeVoice: 'longanmin_v3',
        edgeVoice: 'zh-CN-XiaoyouNeural',
    },
    // ─────── 趣味角色（3 个）───────
    {
        id: 'dashscope-longjiqi',
        label: '龙机器 · 呆萌机器人',
        gender: 'male',
        category: 'character',
        provider: 'dashscope',
        dashscopeVoice: 'longjiqi_v3',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    {
        id: 'dashscope-longhouge',
        label: '龙猴哥 · 经典猴哥',
        gender: 'male',
        category: 'character',
        provider: 'dashscope',
        dashscopeVoice: 'longhouge_v3',
        edgeVoice: 'zh-CN-YunjianNeural',
    },
    {
        id: 'dashscope-longlaobo',
        label: '龙老伯 · 沧桑岁月爷',
        gender: 'male',
        category: 'character',
        provider: 'dashscope',
        dashscopeVoice: 'longlaobo_v3',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    // ─────── MiniMax Speech-2.8-hd 音色(via 百炼)───────
    // 用户云端 voice 配置 modelName 选 MiniMax/speech-2.8-hd 时启用,走 tts-minimax.ts
    // 鉴权依然是百炼 sk-xxx,无需新申请 MiniMax 官方 key
    // 完整音色列表:https://platform.minimaxi.com/document/voice-list (中文/英文/系统预设/角色音色 共 100+)
    // 这里只放最常用的 8 个;dashscopeVoice 留空字符串(MiniMax 路径不读这个字段)
    {
        id: 'minimax-female-shaonv',
        label: '少女音色 · 女 · MiniMax 2.8(甜美元气)',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        minimaxVoice: 'female-shaonv',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-XiaoxiaoNeural',
    },
    {
        id: 'minimax-female-yujie',
        label: '御姐音色 · 女 · MiniMax 2.8(知性沉稳)',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        minimaxVoice: 'female-yujie',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'minimax-female-chengshu',
        label: '成熟女性 · 女 · MiniMax 2.8(优雅成熟)',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        minimaxVoice: 'female-chengshu',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-XiaoyiNeural',
    },
    {
        id: 'minimax-female-tianmei',
        label: '甜美女性 · 女 · MiniMax 2.8(治愈温柔)',
        gender: 'female',
        category: 'female',
        provider: 'dashscope',
        minimaxVoice: 'female-tianmei',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-XiaomengNeural',
    },
    {
        id: 'minimax-male-qingse',
        label: '青涩青年 · 男 · MiniMax 2.8(阳光大男孩)',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        minimaxVoice: 'male-qn-qingse',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-YunxiNeural',
    },
    {
        id: 'minimax-male-jingying',
        label: '精英青年 · 男 · MiniMax 2.8(沉稳商务)',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        minimaxVoice: 'male-qn-jingying',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
    {
        id: 'minimax-male-badao',
        label: '霸道青年 · 男 · MiniMax 2.8(强势冷酷)',
        gender: 'male',
        category: 'male',
        provider: 'dashscope',
        minimaxVoice: 'male-qn-badao',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-YunjianNeural',
    },
    {
        id: 'minimax-audiobook-male-1',
        label: '有声书男声 · 男 · MiniMax 2.8(浑厚说书)',
        gender: 'male',
        category: 'character',
        provider: 'dashscope',
        minimaxVoice: 'audiobook_male_1',
        dashscopeVoice: '',
        edgeVoice: 'zh-CN-YunyangNeural',
    },
];
// ─── 自定义克隆音色 ───
// 旧 SF 克隆数据保留在 data/custom-voices.json，不读不删；
// 百炼 CosyVoice 复刻 API 待接入，当前 listCustomVoices 返回 []，cloneCustomVoice 抛错
exports.SUBTITLE_STYLES = [
    { id: 'standard', label: '标准（白字黑描边）', force_style: 'FontName=Microsoft YaHei,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=0,Alignment=2,MarginV=50' },
    { id: 'science', label: '科普（白底黑字色块）', force_style: 'FontName=Microsoft YaHei,FontSize=14,PrimaryColour=&H00000000,BackColour=&HC0FFFFFF,BorderStyle=4,Outline=2,Shadow=0,Alignment=2,MarginV=60' },
    { id: 'variety', label: '综艺（白字红描边大字）', force_style: 'FontName=Microsoft YaHei,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H000000FF,Outline=3,Shadow=1,Alignment=2,MarginV=80,Bold=1' },
    { id: 'blackbox', label: '黑底白字（黑色色块）', force_style: 'FontName=Microsoft YaHei,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=8,Shadow=0,Alignment=2,MarginV=70,Bold=1' },
];
// ═══════════════ 工具 ═══════════════
function ensureDataDir(...sub) {
    // 统一走 paths.dataDir：dev → packages/main/data，prod → userData/data
    // 注意：dataDir() 只 mkdir 父目录（避免对 'qianshan.db' 这类文件路径误建文件夹），
    // 所以这里必须显式 mkdir 叶子目录本身——所有调用点传入的都是目录名
    const p = (0, paths_1.dataDir)(...sub);
    if (!fs_1.default.existsSync(p))
        fs_1.default.mkdirSync(p, { recursive: true });
    return p;
}
function voiceById(id) {
    // 1) 预设音色
    const preset = exports.VOICES.find((v) => v.id === id);
    if (preset)
        return preset;
    // 2) 自定义克隆音色(DB 里查 custom_voices)
    //    voice id 直接就是百炼/MiniMax 返回的 voice_id(前端选了"克隆音色 X"传过来)
    try {
        const [row] = db_1.db.select().from(schema_1.customVoices).where((0, drizzle_orm_1.eq)(schema_1.customVoices.voiceId, id)).all();
        if (row) {
            // 关键:targetModel 决定走哪条 TTS 路径
            //   - 'MiniMax/*'  → dispatchTTS 走 MiniMax 端点,voice 用 minimaxVoice 字段
            //   - 'cosyvoice-*' → dispatchTTS 走 cosyvoice 端点,voice 用 dashscopeVoice 字段
            const isMiniMaxClone = (row.targetModel || '').startsWith('MiniMax/');
            return {
                id: row.voiceId,
                label: row.name,
                gender: 'unknown',
                category: 'custom',
                provider: 'dashscope',
                // cosyvoice 克隆走这个,MiniMax 克隆留空(避免误用 cosyvoice 端点跑)
                dashscopeVoice: isMiniMaxClone ? '' : row.voiceId,
                // MiniMax 克隆走这个
                minimaxVoice: isMiniMaxClone ? row.voiceId : undefined,
                // 自定义音色降级时无对应 Edge 音色,用通用女声兜底
                edgeVoice: 'zh-CN-XiaoxiaoNeural',
                // 合成时的 model 名:cosyvoice 克隆固定 v3.5-plus,MiniMax 克隆是 'MiniMax/speech-2.8-hd' 等
                model: row.targetModel || tts_clone_1.CLONE_TARGET_MODEL,
                isCustom: true,
            };
        }
    }
    catch (err) {
        logger_1.logger.warn(`[Voice] custom voice lookup failed for ${id}: ${String(err)}`);
    }
    // 3) 兜底:默认音色
    return exports.VOICES[0];
}
async function getVoiceCloudResolved() {
    try {
        const r = await llm_tier_config_1.llmTierConfig.resolveCategory('voice');
        if (!r?.cloudId) {
            return {
                ok: false,
                reason: 'no-config',
                message: '云端未配置语音(voice)模型,请到 qianshanai.cn 网页端配置',
            };
        }
        const apiKey = await (0, cloud_llm_config_1.getDecryptedKey)(r.cloudId);
        if (!apiKey) {
            return {
                ok: false,
                reason: 'no-key',
                message: '语音 Key 获取失败(网络异常),请稍后重试',
            };
        }
        return {
            ok: true,
            apiKey,
            modelName: r.model || '',
            baseUrl: r.baseUrl,
            providerCode: r.providerCode,
            cloudId: r.cloudId,
        };
    }
    catch (err) {
        logger_1.logger.warn(`[Voice] tier 解析异常: ${String(err)}`);
        return {
            ok: false,
            reason: 'error',
            message: `语音配置解析异常: ${String(err?.message || err).slice(0, 120)}`,
        };
    }
}
// 语音预检探活成功缓存:同一 (cloud配置+model+音色) 5 分钟内不重复合成扣费
let voiceProbeOkCache = null;
async function dispatchTTS(voice, text, outPath, rate, pitch, _emotion) {
    // Edge 风格的 "+10%" 字符串 → 百炼 speed 倍率
    // CosyVoice2 安全范围 0.5-2.0，超过会报错或破音
    const rawSpeed = rate && rate !== '+0%' ? 1 + (parseInt(rate) || 0) / 100 : 1.0;
    const speed = Math.max(0.5, Math.min(2.0, rawSpeed));
    // Edge 风格的 "+5Hz" 字符串 → 百炼 pitch 倍率
    //   - 前端 voicePitch 范围 -10Hz ~ +10Hz
    //   - 百炼 pitch 是倍率（0.5-2.0），1.0 = 不变
    //   - 经验值：每 1Hz 偏移 ≈ 2% 倍率（±10Hz → 0.8-1.2，听感明显但不破音）
    const rawPitch = pitch && pitch !== '+0Hz' ? 1 + (parseInt(pitch) || 0) * 0.02 : 1.0;
    const pitchRatio = Math.max(0.5, Math.min(2.0, rawPitch));
    // Key + model 都从云端 voice 类配置读(完全云端化):
    //   - apiKey:同一个百炼账号的 sk-xxx
    //   - modelName：用户在 qianshanai.cn 选的 cosyvoice 版本(v3-flash / v3.5-plus / 等)
    //
    // model 优先级:
    //   1. voice.model 显式指定(克隆音色,固定要 v3.5-plus,不能用 v3-flash)
    //   2. 云端 voice 配置的 modelName(用户在网页端选的)
    //   3. 都没有 → 走 tts-dashscope.ts 内部默认 cosyvoice-v3-flash
    // 拿不到 key → 直接降级 Edge TTS(免 Key 兜底)
    // ──── 百炼 sk-xxx 路径(cosyvoice 或 MiniMax,由档位选的 modelName 决定)────
    // **走档位系统**:用户在 Settings/视频工坊档位下拉选的那条 cloud config
    let dashscopeKey;
    let cloudVoiceModel;
    let cloudVoiceBaseUrl;
    let fallbackReason;
    const resolved = await getVoiceCloudResolved();
    if (resolved.ok) {
        dashscopeKey = resolved.apiKey;
        cloudVoiceModel = resolved.modelName;
        cloudVoiceBaseUrl = resolved.baseUrl;
    }
    else {
        // 以前这里是完全静默的 —— 拿不到 key 连 warn 都没有,直接走 Edge,
        // 用户配置错了根本无从得知。现在记录原因并透传给调用方。
        fallbackReason = resolved.message;
        logger_1.logger.warn(`[TTS] 云端语音不可用(${resolved.reason}),降级 Edge TTS: ${resolved.message}`);
    }
    if (dashscopeKey) {
        // 实际 model 名:克隆音色 voice.model 优先(必须 v3.5-plus),否则用云端配的
        const effectiveModel = voice.model || cloudVoiceModel || '';
        // ─── MiniMax 路径:云端 modelName 以 'MiniMax/' 开头 ───
        // 走百炼 multimodal-generation/generation 端点,跟 cosyvoice 完全不同 schema
        if (effectiveModel.startsWith('MiniMax/')) {
            // MiniMax 用自己的预设音色名(如 male-qn-qingse / female-shaonv);
            // 用户克隆/cosyvoice voice 在 MiniMax 模式下被 listVoices 过滤掉了,
            // 所以这里 voice.minimaxVoice 必有值,不需要 fallback
            const minimaxVoiceId = voice.minimaxVoice;
            if (minimaxVoiceId) {
                try {
                    await (0, tts_minimax_1.synthesizeMiniMaxToMp3)({
                        voice: minimaxVoiceId,
                        text,
                        outPath,
                        speed,
                        // MiniMax pitch 是 -12~+12 整数,我们 pitchRatio 是 0.5-2.0 倍率
                        // 直接传 0(不动)最稳,pitch 调整通过音色多样性达到
                        pitch: 0,
                        apiKey: dashscopeKey,
                        model: effectiveModel,
                        baseUrl: cloudVoiceBaseUrl,
                    });
                    return { engine: 'minimax', fallback: false };
                }
                catch (err) {
                    fallbackReason = `MiniMax 合成失败: ${String(err?.message || err).slice(0, 200)}`;
                    logger_1.logger.warn(`[TTS] MiniMax 失败,降级 Edge TTS: ${fallbackReason}`);
                    // fall through 到 Edge
                }
            }
            else {
                fallbackReason = `音色 ${voice.id} 不支持 MiniMax(缺 minimaxVoice 映射)`;
                logger_1.logger.warn(`[TTS] 云端 modelName=${effectiveModel} 但 voice ${voice.id} 不带 minimaxVoice,降级 Edge`);
            }
        }
        else {
            // ─── cosyvoice / 其他 dashscope model 路径 ───
            try {
                await (0, tts_dashscope_1.synthesizeDashScopeToMp3)({
                    voice: voice.dashscopeVoice,
                    text,
                    outPath,
                    speed,
                    pitch: pitchRatio,
                    apiKey: dashscopeKey,
                    ...(effectiveModel ? { model: effectiveModel } : {}),
                });
                return { engine: 'cosyvoice', fallback: false };
            }
            catch (err) {
                fallbackReason = `百炼 CosyVoice 合成失败: ${String(err?.message || err).slice(0, 120)}`;
                logger_1.logger.warn(`[TTS] 百炼 CosyVoice 失败,降级 Edge TTS: ${fallbackReason}`);
                // fall through 到 Edge
            }
        }
    }
    // 降级：Edge TTS（speed 倍率 → "+X%" 字符串）
    // Edge 在本架构里永远是兜底(没有"用户主动选 Edge"的入口),所以走到这里必为降级
    const edgePct = Math.round((speed - 1) * 100);
    const edgeRate = edgePct >= 0 ? `+${edgePct}%` : `${edgePct}%`;
    await (0, tts_edge_1.synthesizeToMp3)({
        voice: voice.edgeVoice,
        text,
        outPath,
        rate: edgeRate,
        pitch,
    });
    return { engine: 'edge', fallback: true, fallbackReason: fallbackReason || '未知原因' };
}
function styleById(id) {
    return exports.SUBTITLE_STYLES.find((s) => s.id === id) || exports.SUBTITLE_STYLES[0];
}
/** emotion → TTS 语速倍率
 * B4: excited 1.15→1.10、dramatic 0.90→0.93,降低极端值
 *   - excited 1.15 实测在播报感强的文案上像"机器人念稿",1.10 已有兴奋感且不破音
 *   - dramatic 0.90 偶尔会被 CosyVoice2 拖出"喘气感",0.93 更稳
 *   - 其余倍率经验上是平衡点,本次不动
 */
const EMOTION_SPEED = {
    excited: 1.10,
    cheerful: 1.05,
    humorous: 1.10,
    dramatic: 0.93,
    serious: 0.95,
    calm: 1.00,
};
/**
 * 根据分镜 emotion 和 narrativeRole 调整 TTS 语速
 * - 基础语速由用户设置的 voiceRate 决定
 * - 情绪修正：用 EMOTION_SPEED 倍率调整
 * - insight 角色再乘 0.92（金句慢一点）
 * - 返回格式根据 provider 不同：
 *   - dashscope: 返回 "+X%" 格式（dispatchTTS 内部会再转 speed 倍率）
 *   - edge: 返回 "+X%" 格式
 */
function adjustRateByEmotion(baseRate, emotion, narrativeRole, provider) {
    const emotionFactor = EMOTION_SPEED[emotion || ''] ?? 1.0;
    const insightFactor = narrativeRole === 'insight' ? 0.92 : 1.0;
    const totalFactor = emotionFactor * insightFactor;
    if (provider === 'dashscope') {
        // 百炼用 speed 倍率，baseRate 是 Edge 格式 "+X%"
        const baseFactor = baseRate && baseRate !== '+0%' ? 1 + (parseInt(baseRate) || 0) / 100 : 1.0;
        const finalSpeed = baseFactor * totalFactor;
        // 返回 Edge 格式，dispatchTTS 里会再转换成 speed 倍率
        const pct = Math.round((finalSpeed - 1) * 100);
        return pct >= 0 ? `+${pct}%` : `${pct}%`;
    }
    // Edge TTS: 基础 "+X%" + emotion 修正
    const basePct = baseRate ? (parseInt(baseRate) || 0) : 0;
    const baseFactor = 1 + basePct / 100;
    const finalFactor = baseFactor * totalFactor;
    const finalPct = Math.round((finalFactor - 1) * 100);
    return finalPct >= 0 ? `+${finalPct}%` : `${finalPct}%`;
}
/** 秒 → SRT 时间戳 (HH:MM:SS,mmm) */
function toSrtTime(sec) {
    const ms = Math.max(0, Math.floor(sec * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mi = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mi).padStart(3, '0')}`;
}
/**
 * 把一条长字幕按显示宽切段（英文/数字按半个汉字宽计），避免一屏塞不下。
 * 切点避开英文单词/数字串中间（"seedance" 不会被劈成 "seedanc" + "e"）。
 */
function splitCaption(text, perLine = 15) {
    const isWord = (c) => /[A-Za-z0-9]/.test(c);
    const charW = (c) => (/[\x20-\x7E]/.test(c) ? 0.5 : 1);
    const out = [];
    let pos = 0;
    while (pos < text.length) {
        // 按显示宽走到本行理想终点
        let w = 0;
        let cut = pos;
        while (cut < text.length && w + charW(text[cut]) <= perLine) {
            w += charW(text[cut]);
            cut++;
        }
        if (cut >= text.length) {
            out.push(text.slice(pos));
            break;
        }
        // 切在英文单词中间 → 退到词首；词从行首开始退无可退 → 吞到词尾
        if (isWord(text[cut - 1]) && isWord(text[cut])) {
            let left = cut;
            while (left > pos && isWord(text[left - 1]))
                left--;
            if (left > pos) {
                cut = left;
            }
            else {
                while (cut < text.length && isWord(text[cut]))
                    cut++;
            }
        }
        if (cut <= pos)
            cut = Math.min(pos + perLine, text.length); // 保底防死循环
        out.push(text.slice(pos, cut));
        pos = cut;
    }
    return out.length ? out : [text];
}
/** 下载远程图片到本地缓存 */
async function downloadImage(url, destDir) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`下载图片失败 ${res.status}: ${url}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // 根据 Content-Type 决定扩展名，避免 placehold.co 这类返 svg 的情况
    let ext;
    if (ct.includes('jpeg') || ct.includes('jpg'))
        ext = 'jpg';
    else if (ct.includes('png'))
        ext = 'png';
    else if (ct.includes('webp'))
        ext = 'webp';
    else if (ct.includes('svg')) {
        throw new Error(`图片源返回 SVG 格式，ffmpeg 内置版本不支持 SVG 解码。请换 PNG/JPG 图片源：${url}`);
    }
    else {
        // 未知类型：尝试按 URL 后缀猜
        ext = (url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
    }
    const fname = `img-${crypto_1.default.randomBytes(6).toString('hex')}.${ext}`;
    const dest = path_1.default.join(destDir, fname);
    const buf = Buffer.from(await res.arrayBuffer());
    fs_1.default.writeFileSync(dest, buf);
    return dest;
}
/** 下载远程视频到本地缓存 */
async function downloadVideo(url, destDir) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`下载视频失败 ${res.status}: ${url}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const ext = ct.includes('mp4')
        ? 'mp4'
        : ct.includes('webm')
            ? 'webm'
            : (url.match(/\.(mp4|webm|mov)(\?|$)/i)?.[1] || 'mp4').toLowerCase();
    const fname = `vid-${crypto_1.default.randomBytes(6).toString('hex')}.${ext}`;
    const dest = path_1.default.join(destDir, fname);
    const buf = Buffer.from(await res.arrayBuffer());
    fs_1.default.writeFileSync(dest, buf);
    return dest;
}
/** 给 ASS 时间字符串（H:MM:SS.CC）加上 offsetSec 秒 */
function shiftAssTime(raw, offsetSec) {
    const m = raw.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
    if (!m)
        return raw;
    const total = parseInt(m[1], 10) * 3600 +
        parseInt(m[2], 10) * 60 +
        parseInt(m[3], 10) +
        parseInt(m[4], 10) / 100 +
        offsetSec;
    const h = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = Math.floor(total % 60);
    const cs = Math.round((total - Math.floor(total)) * 100);
    return `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
// estimateDuration 已迁到 @qianshan/shared/duration —— scene-splitter 与本文件共享同一公式
// ═══════════════ Service ═══════════════
/** 启发式判断内容类型（叙事 vs 概念）*/
function detectContentType(text) {
    // 专有名词 / 人名 / 地名 / 数字日期等叙事信号
    const narrativeSignals = [
        /马斯克|李佳琦|董明珠|雷军|罗永浩/,
        /外卖|快递员|保姆|保安|网红|主播/,
        /抖音|快手|小红书|拼多多|美团|淘宝/,
        /\d{4}年|\d+月\d+日|去年|今年|上周|昨天/,
        /我朋友|有个朋友|我同事|我表哥|老王|小李/,
        /首富|明星|CEO|导演|演员/,
    ];
    const conceptualSignals = [
        /方法|技巧|原理|原因|为什么|如何/,
        /第一[，,]|第二[，,]|第三[，,]|首先|其次|最后/,
        /研究表明|数据显示|科学家|专家/,
    ];
    let nScore = 0;
    let cScore = 0;
    for (const r of narrativeSignals)
        if (r.test(text))
            nScore++;
    for (const r of conceptualSignals)
        if (r.test(text))
            cScore++;
    if (nScore >= 3 && nScore > cScore * 1.5)
        return 'narrative';
    if (cScore >= 2 && cScore > nScore * 1.5)
        return 'conceptual';
    return 'mixed';
}
/** 根据内容类型给用户建议（v2 使用的顶层版）*/
function adviceForContentType(type) {
    if (type === 'conceptual') {
        return '✅ 概念型内容。AI 通用素材（Pexels 视频/图）能胜任这种题材。';
    }
    if (type === 'narrative') {
        return ('⚠️ 叙事型内容（讲具体人物/事件/热点）。AI 素材库几乎搜不到匹配的中国场景，' +
            '建议：1. 下载草稿包去剪映替换；2. 配置即梦等 AI 视频生成直接生成贴合画面；3. 手动上传素材。');
    }
    return '🟡 混合型内容。部分画面 AI 能搜对，部分需要手动替换。';
}
class OneClickService {
    // ─── Step 1: 拆分镜 ───
    /**
     * 新版分镜拆分（推荐）：
     *   Step 1 标点切（零 LLM）→ Step 2 模板节奏 → Step 3 LLM 只补画面信息
     *
     * 比老版 analyzeScript 优势：
     *   - 切分不再依赖 LLM，确定性 100%
     *   - LLM 专注写 videoPrompt，质量更高
     *   - 节奏由模板驱动，符合爆款结构
     */
    async analyzeV2(scriptText, template, styleHint = 'auto', qualityMode = 'balanced', onProgress, visualStyleId) {
        if (!scriptText.trim())
            throw new Error('文案为空，无法拆分');
        // 保留用户输入的原文，给前端做对比展示
        const originalScript = scriptText.trim();
        // 加载视觉风格（"画面风格预设"），未选则退化为 DEFAULT_VISUAL_STYLE = 电影写实
        const visualStyle = await engine_1.styleEngine
            .getVisualStyle(visualStyleId)
            .catch(() => visual_styles_1.DEFAULT_VISUAL_STYLE);
        logger_1.logger.info(`[OneClick] 视觉风格 = ${visualStyleId ?? '默认电影写实'} (baseStyle="${visualStyle.baseStyle.slice(0, 24)}...")`);
        // 阶段标记辅助：用 "__STAGE__|label|progress" 前缀让 onProgress 复用通道
        //   路由层识别这个前缀的字符串就调 sse.sendProgress，否则当 LLM token chunk
        //   这样不破坏 onProgress 既有签名，不需要改下游 director/enrich 的回调类型
        const sendStage = (label, progress) => {
            if (onProgress)
                onProgress(`__STAGE__|${label}|${progress.toFixed(2)}`);
        };
        // ── Stage 0: 文案口语化（已下沉为前端手动按钮触发，不再自动跑）──
        // 用户在 step 1 看到分镜后，点"生成口语化"按钮才走 convertToSpokenScript，
        // 这里直接把 scriptText 当作 spokenScript 透传，保持返回字段结构不变
        const spokenScript = scriptText;
        // 内容类型判断（启发式）
        const contentType = detectContentType(scriptText);
        // ── Stage 1: 导演分析（全局视角）──
        // 先用本地标点切做一个粗略分镜列表给导演分析用
        sendStage('🎯 全局导演分析（叙事弧线/角色/关键镜头）', 0.15);
        const roughScenes = (0, scene_splitter_1.splitByPunctuation)(scriptText, {
            minChars: 6, maxChars: 20, minScenes: 3, maxScenes: 120,
        });
        let directorResult = await (0, director_analysis_1.directorAnalyze)(scriptText, roughScenes.map((s) => ({ index: s.index, text: s.text })), onProgress);
        // directorResult 可能为 null（LLM 失败），不阻断主流程
        // 【首选】方案 C：LLM 一次搞定切分镜 + 画面信息（质量最好）
        //   失败则降级到旧的"本地标点切 + LLM 补画面"两阶段
        sendStage('✂️ 切分镜 + 补充画面描述', 0.5);
        let enriched;
        try {
            enriched = await (0, scene_enrich_1.splitAndEnrichScenes)(scriptText, scriptText.slice(0, 200), template, styleHint, qualityMode, onProgress, directorResult, undefined, // forceSplitModel
            visualStyle);
            // 模板 pacing 已在 splitAndEnrichScenes 内部应用
        }
        catch (err) {
            // 超时降级：用同 provider 的 text-long cheap 档（如灵芽 → deepseek-v4-flash）兜底重试一次
            // 比直接退到"标点切"质量好得多——cheap 档也是真 LLM，只是比 premium 便宜
            if (isTimeoutError(err)) {
                const route = llm_1.llm.getRoutingForScene('one_click_split');
                if (route) {
                    const category = llm_tiers_1.SCENE_TO_CATEGORY['one_click_split'];
                    const cheap = (0, llm_tiers_1.resolveTier)(route.provider, category, 'cheap');
                    if (cheap && cheap.model !== route.model) {
                        logger_1.logger.warn(`[OneClick] LLM 切分镜超时（${route.model}），降级 cheap 档 ${cheap.model} 重试一次...`);
                        try {
                            enriched = await (0, scene_enrich_1.splitAndEnrichScenes)(scriptText, scriptText.slice(0, 200), template, styleHint, qualityMode, onProgress, directorResult, { provider: route.provider, model: cheap.model }, visualStyle);
                            logger_1.logger.info(`[OneClick] cheap 档兜底成功，切出 ${enriched.length} 段`);
                            // 跳过下面的标点降级
                            const aiImageAvailable = (0, ai_image_gen_1.hasAnyImageProvider)();
                            const finalScenes = aiImageAvailable
                                ? enriched
                                : enriched.map((s) => {
                                    if (s.generationMode === 'ai-image' || s.generationMode === 'ai-video') {
                                        return {
                                            ...s,
                                            generationMode: 'library',
                                            generationReason: (s.generationReason ? s.generationReason + '；' : '') + '未配 AI provider，降级素材库',
                                        };
                                    }
                                    return s;
                                });
                            sendStage(`✅ 完成（${finalScenes.length} 个分镜）`, 0.95);
                            return {
                                scenes: finalScenes,
                                contentType,
                                advice: adviceForContentType(contentType),
                                template,
                                styleHint,
                                qualityMode,
                                aiImageAvailable,
                                originalScript,
                                spokenScript,
                                visualStyleId: visualStyleId ?? null,
                            };
                        }
                        catch (retryErr) {
                            logger_1.logger.warn(`[OneClick] cheap 档也失败，继续降级标点切: ${String(retryErr?.message || retryErr).slice(0, 120)}`);
                            // fall through 到标点降级
                        }
                    }
                }
            }
            logger_1.logger.warn(`[OneClick] LLM 切分镜失败，降级标点切: ${String(err?.message || err).slice(0, 120)}`);
            // 降级链：标点切 → LLM 补画面
            // 每镜目标时长由导演分析的 pacingStrategy 决定（qualityMode 只管 ai-video 配额，不管节奏）
            // 读不到导演结果（null/undefined/NaN/非法值）时兜底 5s，并夹紧到画面节拍范围
            const cnCount = (scriptText.match(/[\u4e00-\u9fff]/g) || []).length;
            const enCount = (scriptText.replace(/[\u4e00-\u9fff]/g, '').match(/[A-Za-z0-9]+/g) || []).length;
            const estDurationSec = cnCount * 0.25 + enCount * 0.35;
            // 与 splitAndEnrichV2 共用同一套节奏计算（含 MAX_SCENES 上限），
            // 否则 LLM 路径切 40 段，标点降级却切 65 段，两条路径节奏会漂
            const rawAvg = directorResult?.pacingStrategy?.suggestedAvgDuration;
            const { secPerScene, targetSceneCount } = (0, scene_enrich_1.computePacing)(estDurationSec, rawAvg);
            const idealChars = Math.round(secPerScene / 0.25); // 中文 1 字 ≈ 0.25s
            // fallback 也是画面生成单位：目标 5-8s，硬上限约 12s，避免降级路径产出 20s 长分镜。
            const upperMul = 1.5;
            const maxCharsCap = Math.min(scene_enrich_1.VISUAL_SCENE_HARD_MAX_CHARS, Math.round(idealChars * upperMul));
            logger_1.logger.info(`[OneClick] 标点降级: qualityMode=${qualityMode}(${secPerScene.toFixed(1)}s/段), 目标 ${targetSceneCount} 段（上限${scene_enrich_1.MAX_SCENES}）, 每段 ≤${maxCharsCap} 字（约≤${scene_enrich_1.VISUAL_SCENE_HARD_MAX_SEC}s）`);
            const rawScenes = (0, scene_splitter_1.splitByPunctuation)(scriptText, {
                minChars: 6,
                maxChars: maxCharsCap,
                targetSeconds: Math.min(8, secPerScene),
                minScenes: Math.min(3, targetSceneCount),
                maxScenes: Math.max(10, Math.ceil(targetSceneCount * 1.3)),
            });
            if (rawScenes.length === 0)
                throw new Error('文案为空，无法拆分');
            const pacedScenes = (0, scene_enrich_1.applyTemplatePacing)(rawScenes, template);
            enriched = await (0, scene_enrich_1.enrichScenes)(pacedScenes.map((s) => ({ index: s.index, text: s.text, estDuration: s.estDuration })), scriptText.slice(0, 200), template, styleHint, qualityMode, onProgress, directorResult, visualStyle);
        }
        // 如果用户没配 AI 图片 provider，把 ai-image/ai-video 全降级为 library
        const aiImageAvailable = (0, ai_image_gen_1.hasAnyImageProvider)();
        const finalScenes = aiImageAvailable
            ? enriched
            : enriched.map((s) => {
                if (s.generationMode === 'ai-image' || s.generationMode === 'ai-video') {
                    return {
                        ...s,
                        generationMode: 'library',
                        generationReason: (s.generationReason ? s.generationReason + '；' : '') + '未配 AI provider，降级素材库',
                    };
                }
                return s;
            });
        sendStage(`✅ 完成（${finalScenes.length} 个分镜）`, 0.95);
        return {
            scenes: finalScenes,
            contentType,
            advice: adviceForContentType(contentType),
            template,
            styleHint,
            qualityMode,
            aiImageAvailable,
            originalScript,
            spokenScript,
            visualStyleId: visualStyleId ?? null,
        };
    }
    /** 老版（保留以兼容已存在的前端调用）*/
    async analyzeScript(scriptText) {
        // 按字数上限（10 分钟 ≈ 1500 中文字）保护
        const trimmed = scriptText.slice(0, 1800);
        const prompt = `你是一个短视频脚本编辑 + 视觉素材搜索专家。请把下面这段中文口播文案拆成 3-8 个分镜，每个分镜 5-20 秒。

## 内容类型判断（重要）
先判断这段文案的类型：
- **conceptual**（概念/论点型）：讲道理、知识科普、观点论证。AI 通用素材库能胜任。
  例子：React useEffect 讲解、心理学小知识、专注力提升方法
- **narrative**（叙事/故事型）：讲具体事件、人物、情节、明星/热点。AI 素材库匹配度低（找不到"马斯克"、"外卖小哥"、"抖音短剧"的真实画面）。
  例子：讲 AI 做短剧的发展、讲某明星故事、聊抖音平台新闻
- **mixed**（混合型）：前面叙事后面讲观点，或交替

## 拆分要求
1. 保持文案原意，不要改写。逐字拆分归纳。
2. 每个分镜的 text 字段是那段文案的逐字内容，用于 TTS 朗读。

## 搜图关键词要求（关键）
每个分镜给 3-5 个**英文搜图词组**，用于搜 Pexels/Unsplash 的真实视频/图片。

**好的关键词**：
- 具象名词+场景：\`focused person working laptop\`、\`coffee latte art barista\`
- 中国特色内容：带 "chinese" 前缀：\`chinese traditional alley architecture\`、\`chinese new year family dinner\`
- 抽象概念用"概念图"：\`concept of concentration mind\`、\`teamwork office collaboration\`
- 动作/场景：\`food delivery rider motorcycle city\`、\`student studying library books\`

**不要这样**：
- ❌ 拼音直译：\`hutong\`、\`chunjie\`、\`waimai\`（英文库搜不到）
- ❌ 单个词：\`focus\`、\`love\`、\`study\`（太空泛，搜出来乱七八糟）
- ❌ 中文：\`专注\`、\`学习\`（英文库不认识）
- ❌ 太抽象：\`happiness\`、\`success\`（用具象的"笑脸"/"奖杯"代替）

## 举例

中文文案：今天讲 React 的 useEffect Hook
→ keywords: \`["developer coding laptop","programming code screen","react javascript logo"]\`

中文文案：下班路上累到走不动
→ keywords: \`["tired businessman walking street night","exhausted worker subway","commute city evening"]\`

中文文案：春节家人团聚包饺子
→ keywords: \`["chinese family dinner reunion","chinese dumpling cooking kitchen","chinese new year celebration"]\`

## 输出

文案：
"""
${trimmed}
"""

只输出 JSON 对象，不要其他内容：
{
  "contentType": "conceptual" | "narrative" | "mixed",
  "scenes": [
    { "text": "逐字内容", "duration": 8, "keywords": ["keyword phrase 1","keyword phrase 2","keyword phrase 3"] }
  ]
}`;
        try {
            // LLM 现在返对象 { contentType, scenes }，但老版本可能直接返数组，都要兼容
            const raw = await llm_1.llm.completeJSONWithScene('one_click_split', '短视频脚本编辑', prompt);
            // 两种格式兼容
            let arr = [];
            let contentType = 'mixed';
            if (Array.isArray(raw)) {
                arr = raw;
            }
            else if (raw && typeof raw === 'object') {
                arr = Array.isArray(raw.scenes) ? raw.scenes : [];
                if (['conceptual', 'narrative', 'mixed'].includes(raw.contentType)) {
                    contentType = raw.contentType;
                }
            }
            if (arr.length === 0) {
                return {
                    scenes: this.fallbackSplit(scriptText),
                    contentType: 'mixed',
                    advice: this.adviceFor('mixed'),
                };
            }
            const scenes = arr.slice(0, 10).map((s, i) => ({
                index: i + 1,
                text: String(s?.text ?? '').trim(),
                duration: typeof s?.duration === 'number' && s.duration >= 2
                    ? Math.min(30, s.duration)
                    : (0, shared_1.estimateDuration)(String(s?.text ?? '')),
                keywords: Array.isArray(s?.keywords)
                    ? s.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 5)
                    : [],
            }));
            return { scenes, contentType, advice: this.adviceFor(contentType) };
        }
        catch (err) {
            logger_1.logger.warn('[OneClick] LLM split failed, fallback: ' + String(err));
            return {
                scenes: this.fallbackSplit(scriptText),
                contentType: 'mixed',
                advice: this.adviceFor('mixed'),
            };
        }
    }
    /** 根据内容类型生成用户建议文案 */
    adviceFor(type) {
        if (type === 'conceptual') {
            return '✅ 概念型内容。AI 通用素材（Pexels 视频/图）能胜任这种题材。';
        }
        if (type === 'narrative') {
            return ('⚠️ 叙事型内容（讲具体人物/事件/热点）。AI 素材库几乎搜不到匹配的中国场景（比如"外卖小哥"、"抖音"、"明星"），' +
                '出来的视频画面会跟文案脱节。\n\n' +
                '**建议**：\n' +
                '1. 点历史作品的「下载草稿包」，拿到音频+字幕去剪映里替换每段画面\n' +
                '2. 或者配置 AI 视频生成（即梦/Kling），每段 3-5 元让 AI 直接生成贴合的视频\n' +
                '3. 或者手动上传你自己的素材替换 AI 选的图');
        }
        return ('🟡 混合型内容。部分画面 AI 能搜对，部分需要你手动替换。生成后可在剪映里微调。');
    }
    /** LLM 不可用时按句号分段的兜底 */
    fallbackSplit(text) {
        const sentences = text
            .split(/[。！？\n]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const scenes = [];
        const chunkSize = Math.max(2, Math.ceil(sentences.length / 6));
        for (let i = 0; i < sentences.length; i += chunkSize) {
            const t = sentences.slice(i, i + chunkSize).join('。') + '。';
            scenes.push({
                index: scenes.length + 1,
                text: t,
                duration: (0, shared_1.estimateDuration)(t),
                keywords: [],
            });
        }
        return scenes;
    }
    // ─── Step 2: 搜图 ───
    async search(keywords, perProvider = 5, styleHint = 'auto') {
        return (0, image_search_1.searchImages)(keywords, perProvider, styleHint);
    }
    /**
     * 混合搜素材：Pexels 视频优先 + Pexels/Unsplash 图片回落
     * 视频质量远高于静态图 + Ken Burns，前端把视频候选排在前面。
     */
    async searchMixed(keywords, resolution = '1080x1920', videoCount = 3, imageCount = 5, styleHint = 'auto') {
        const [videos, images] = await Promise.all([
            (0, image_search_1.searchVideos)(keywords, resolution, videoCount, styleHint),
            (0, image_search_1.searchImages)(keywords, imageCount, styleHint),
        ]);
        return { videos, images };
    }
    /**
     * 按分镜生成模式获取素材（素材库 / AI 图片 / AI 视频）
     *
     * 核心路由：
     *   - library: 调 searchMixed，返回视频+图片候选
     *   - ai-image: 调 generateImage，返回一张 AI 生成图（作为单候选）
     *   - ai-video: 预留接口（当前由上层 generate 流程另行处理），退回 library
     *
     * 降级策略：
     *   - AI 图生成失败 → 降级 library
     *   - library 完全零结果 → 若配置了 AI provider，尝试用 AI 图补救
     */
    async searchForScene(scene, opts = {}) {
        const resolution = opts.resolution || '1080x1920';
        const styleHint = opts.styleHint || 'auto';
        const aspect = this.resolutionToAspect(resolution);
        // ─── 按需补写 prompt(用户切换 mode 后第一次生成时触发)─────────────────────
        //   触发条件:目标 mode 的 prompt 缺失 / 跟另一个 prompt 完全相同 / 等于口播原文(兜底)
        //   失败时直接用原 prompt,不阻塞主流程
        //   仅在 ai-image / ai-video 路径触发(library / data-viz / mixed-video-image 不需要)
        //   不回写前端 — 接受每次重生成都补写一次:
        //     ① 1-2 秒 + cheap 档 LLM 调用,成本极低
        //     ② 重生成本意就是"换个视角",每次新 prompt 反而是 feature
        if (scene.generationMode === 'ai-video' || scene.generationMode === 'ai-image') {
            const sceneText = (scene.text || '').trim();
            const targetMode = scene.generationMode;
            const targetPrompt = ((targetMode === 'ai-video' ? scene.videoPromptCN : scene.aiImagePromptCN) || '').trim();
            const otherPrompt = ((targetMode === 'ai-video' ? scene.aiImagePromptCN : scene.videoPromptCN) || '').trim();
            const needRefine = !targetPrompt ||
                (!!sceneText && targetPrompt === sceneText) ||
                (!!otherPrompt && targetPrompt === otherPrompt);
            if (needRefine && sceneText) {
                logger_1.logger.info(`[searchForScene] scene#${scene.index} ${targetMode} prompt 需要补写 ` +
                    `(empty=${!targetPrompt}, sameAsText=${targetPrompt === sceneText}, ` +
                    `sameAsOther=${!!otherPrompt && targetPrompt === otherPrompt})`);
                const refined = await (0, scene_enrich_1.refineSinglePrompt)(sceneText, otherPrompt, targetMode);
                // 写回 scene 局部对象,后续 ai-image / ai-video 分支会直接读新值
                if (targetMode === 'ai-video') {
                    scene.videoPromptCN = refined;
                    scene.videoPromptEN = ''; // 让生成只用 promptCN
                }
                else {
                    scene.aiImagePromptCN = refined;
                    scene.aiImagePromptEN = '';
                }
            }
        }
        // 1) library：直接走现有逻辑
        if (scene.generationMode === 'library') {
            const { videos, images } = await this.searchMixed(scene.searchKeywords, resolution, 3, 5, styleHint);
            // 库也没搜到 && 有 AI provider —— 自动升级为 ai-image
            if (videos.length === 0 && images.length === 0 && (0, ai_image_gen_1.hasAnyImageProvider)()) {
                const upgraded = await this.searchForScene({ ...scene, generationMode: 'ai-image' }, { ...opts });
                return { ...upgraded, mode: 'library', fallbackReason: '素材库零结果，自动升级 AI 图' };
            }
            return { mode: 'library', actualMode: 'library', videos, images };
        }
        // 2) ai-image：调文生图 provider
        if (scene.generationMode === 'ai-image') {
            if (!(0, ai_image_gen_1.hasAnyImageProvider)()) {
                // 没配 AI → 降级库搜
                const r = await this.searchMixed(scene.searchKeywords, resolution, 3, 5, styleHint);
                return {
                    mode: 'ai-image',
                    actualMode: 'library',
                    videos: r.videos,
                    images: r.images,
                    fallbackReason: '未配置 AI 图片 provider，已降级到素材库',
                };
            }
            const destDir = opts.aiDestDir || path_1.default.join(process.cwd(), 'data', 'ai-images');
            try {
                const provider = (0, ai_image_gen_1.pickAvailableImageProvider)();
                const effectivePromptCN = stripCharIds(scene.aiImagePromptCN || scene.videoPromptCN || '');
                const effectivePromptEN = stripCharIds(scene.aiImagePromptEN || scene.videoPromptEN || '');
                if (!effectivePromptCN && !effectivePromptEN) {
                    logger_1.logger.warn(`[OneClick] ai-image scene ${scene.index} 没有 prompt，将跳过生成`);
                }
                const result = await (0, ai_image_gen_1.generateImage)({
                    promptCN: effectivePromptCN,
                    promptEN: effectivePromptEN,
                    aspect,
                    // scene 在 enrichScenes 阶段就把 visualStyle.negativePrompt 落到自身字段，
                    // 这里直接消费即可——没有 = 让 ai-image-gen 用 DEFAULT_NEGATIVE 兜底（向后兼容老 scene）
                    negativePrompt: scene.negativePrompt,
                }, destDir, provider);
                return {
                    mode: 'ai-image',
                    actualMode: 'ai-image',
                    aiImagePath: result.localPath,
                    aiImageCost: result.costCny,
                };
            }
            catch (err) {
                const cause = err?.cause;
                const causeStr = cause ? ` | cause: ${cause.code || ''} ${String(cause.message || cause).slice(0, 120)}` : '';
                logger_1.logger.warn(`[OneClick] AI 图生成失败，降级素材库: ${String(err?.message || err)}${causeStr}`);
                const r = await this.searchMixed(scene.searchKeywords, resolution, 3, 5, styleHint);
                return {
                    mode: 'ai-image',
                    actualMode: 'library',
                    videos: r.videos,
                    images: r.images,
                    fallbackReason: `AI 图生成失败（${String(err?.message || err).slice(0, 60)}），已降级素材库`,
                };
            }
        }
        // 3) ai-video：直接调已配置的视频 provider
        //    优先级：灵芽（按档位统管，直连聚合）→ 百炼 HappyHorse（直连）
        //    失败或未配置 → 降级 ai-image；ai-image 再失败 → 降级 library
        if (scene.generationMode === 'ai-video') {
            const providers = (0, ai_video_gen_1.listProviders)();
            // 用户在「设置 → AI 模型 → HappyHorse 卡片」可以独立关掉视频功能
            // （只想用 TTS 不想烧视频钱），关了就把 happyhorse 从优先级里剔除
            // 视频开关打开时 HappyHorse 排前面：直连百炼省去灵芽中间层加价；
            // 灵芽作为兜底，HappyHorse 失败 / 未配置时才落到灵芽
            // 完全云端化:视频统一走灵芽,百炼视频用户在云端配灵芽 key 跑同样 happyhorse-1.0-t2v 模型
            const priority = ['lingyaai'];
            const configured = priority.find((id) => providers.find((p) => p.id === id && p.configured));
            if (!configured) {
                logger_1.logger.info(`[OneClick] ai-video 未配置任何 provider，降级 ai-image`);
                return this.searchForScene({ ...scene, generationMode: 'ai-image' }, { ...opts }).then((r) => ({
                    ...r,
                    mode: 'ai-video',
                    fallbackReason: '未配置 AI 视频 provider，已降级 AI 图',
                }));
            }
            const videoDestDir = opts.aiVideoDestDir
                || (opts.aiDestDir || path_1.default.join(process.cwd(), 'data'))
                    .replace(/[\\/]ai-images$/, '/ai-generated');
            try {
                const result = await (0, ai_video_gen_1.regenerateOne)(configured, {
                    prompt: scene.videoPromptCN || scene.videoPromptEN || scene.searchKeywords.join(' '),
                    aspect,
                    duration: 5,
                }, videoDestDir);
                return {
                    mode: 'ai-video',
                    actualMode: 'ai-video',
                    aiVideoPath: result.localPath,
                    aiVideoCost: result.costCny,
                    aiVideoProvider: configured,
                };
            }
            catch (err) {
                logger_1.logger.warn(`[OneClick] AI 视频生成失败，降级 ai-image: ${String(err?.message || err)}`);
                const downgraded = await this.searchForScene({ ...scene, generationMode: 'ai-image' }, { ...opts });
                return {
                    ...downgraded,
                    mode: 'ai-video',
                    fallbackReason: `AI 视频生成失败（${String(err?.message || err).slice(0, 60)}），已降级 AI 图`,
                };
            }
        }
        // 4) mixed-video-image：长分镜（>12s）— 前 8s veo 视频 + 后 N s 图片 + Ken Burns
        //    合成阶段会用 ffmpeg 拼接两段，0.5s xfade 过渡
        //    返回值同时带 aiVideoPath 和 aiImagePath，下游 generate() 检测到两者都有时做拼接
        if (scene.generationMode === 'mixed-video-image') {
            const providers = (0, ai_video_gen_1.listProviders)();
            // 同 ai-video 分支：HappyHorse 优先（直连省钱），灵芽兜底
            // 完全云端化:视频统一走灵芽,百炼视频用户在云端配灵芽 key 跑同样 happyhorse-1.0-t2v 模型
            const priority = ['lingyaai'];
            const configured = priority.find((id) => providers.find((p) => p.id === id && p.configured));
            // 没视频 provider —— 整段降级 ai-image（图片靠 Ken Burns 撑场）
            if (!configured) {
                logger_1.logger.info(`[OneClick] mixed scene#${scene.index} 无视频 provider，降级 ai-image`);
                return this.searchForScene({ ...scene, generationMode: 'ai-image' }, { ...opts }).then((r) => ({
                    ...r,
                    mode: 'mixed-video-image',
                    fallbackReason: '未配置 AI 视频 provider，已降级 AI 图',
                }));
            }
            const videoDestDir = opts.aiVideoDestDir
                || (opts.aiDestDir || path_1.default.join(process.cwd(), 'data'))
                    .replace(/[\\/]ai-images$/, '/ai-generated');
            const imageDestDir = opts.aiDestDir || path_1.default.join(process.cwd(), 'data', 'ai-images');
            const hasImg = (0, ai_image_gen_1.hasAnyImageProvider)();
            // 并发跑两条：视频 8s + 静态图
            const videoPromise = (0, ai_video_gen_1.regenerateOne)(configured, {
                prompt: scene.videoPromptCN || scene.videoPromptEN || scene.searchKeywords.join(' '),
                aspect,
                duration: 8, // veo / wan / seedance 都支持 8s
            }, videoDestDir).catch((err) => {
                logger_1.logger.warn(`[OneClick] mixed scene#${scene.index} 视频生成失败: ${String(err?.message || err)}`);
                return null;
            });
            const imagePromise = (async () => {
                if (!hasImg)
                    return null;
                try {
                    const provider = (0, ai_image_gen_1.pickAvailableImageProvider)();
                    const promptCN = stripCharIds(scene.aiImagePromptCN || scene.videoPromptCN || '');
                    const promptEN = stripCharIds(scene.aiImagePromptEN || scene.videoPromptEN || '');
                    if (!promptCN && !promptEN)
                        return null;
                    return await (0, ai_image_gen_1.generateImage)({ promptCN, promptEN, aspect, negativePrompt: scene.negativePrompt }, imageDestDir, provider);
                }
                catch (err) {
                    logger_1.logger.warn(`[OneClick] mixed scene#${scene.index} 图片生成失败: ${String(err?.message || err)}`);
                    return null;
                }
            })();
            const [videoResult, imageResult] = await Promise.all([videoPromise, imagePromise]);
            // 两边都失败 → 全降级到素材库
            if (!videoResult && !imageResult) {
                const r = await this.searchMixed(scene.searchKeywords, resolution, 3, 5, styleHint);
                return {
                    mode: 'mixed-video-image',
                    actualMode: 'library',
                    videos: r.videos,
                    images: r.images,
                    fallbackReason: '混合模式视频和图片都生成失败，已降级素材库',
                };
            }
            // 只成功视频 → actualMode 退到 ai-video（合成阶段会按 5-12s 自然拉伸）
            if (videoResult && !imageResult) {
                return {
                    mode: 'mixed-video-image',
                    actualMode: 'ai-video',
                    aiVideoPath: videoResult.localPath,
                    aiVideoCost: videoResult.costCny,
                    aiVideoProvider: configured,
                    fallbackReason: '混合模式图片生成失败，仅返回视频段',
                };
            }
            // 只成功图片 → actualMode 退到 ai-image
            if (!videoResult && imageResult) {
                return {
                    mode: 'mixed-video-image',
                    actualMode: 'ai-image',
                    aiImagePath: imageResult.localPath,
                    aiImageCost: imageResult.costCny,
                    fallbackReason: '混合模式视频生成失败，仅返回图片段',
                };
            }
            // 双成功 ✅
            return {
                mode: 'mixed-video-image',
                actualMode: 'mixed-video-image',
                aiVideoPath: videoResult.localPath,
                aiVideoCost: videoResult.costCny,
                aiVideoProvider: configured,
                aiImagePath: imageResult.localPath,
                aiImageCost: imageResult.costCny,
            };
        }
        // 5) data-viz：编程生成数据可视化图片
        if (scene.generationMode === 'data-viz') {
            const config = scene.dataVizConfig;
            if (!config) {
                logger_1.logger.info(`[OneClick] data-viz scene ${scene.index} 缺少 dataVizConfig，降级 ai-image`);
                return this.searchForScene({ ...scene, generationMode: 'ai-image' }, opts).then((r) => ({ ...r, mode: 'data-viz', fallbackReason: '缺少 dataVizConfig，降级 AI 图' }));
            }
            try {
                const pngPath = await (0, data_viz_1.generateDataViz)(config, opts.resolution);
                return {
                    mode: 'data-viz',
                    actualMode: 'data-viz',
                    aiImagePath: pngPath,
                };
            }
            catch (err) {
                logger_1.logger.warn(`[OneClick] data-viz 生成失败，降级 ai-image: ${String(err?.message || err)}`);
                const downgraded = await this.searchForScene({ ...scene, generationMode: 'ai-image' }, opts);
                return {
                    ...downgraded,
                    mode: 'data-viz',
                    fallbackReason: `数据图生成失败（${String(err?.message || err).slice(0, 60)}），已降级 AI 图`,
                };
            }
        }
        // 兜底：未知 mode → library
        logger_1.logger.warn(`[OneClick] searchForScene 未匹配的 mode=${scene.generationMode}, 兜底走 library`);
        const r = await this.searchMixed(scene.searchKeywords, resolution, 3, 5, styleHint);
        return {
            mode: scene.generationMode,
            actualMode: 'library',
            videos: r.videos,
            images: r.images,
            fallbackReason: `未识别的生成模式 ${scene.generationMode}`,
        };
    }
    /** 分辨率串 → aspect 枚举（给 AI 图 provider 用）*/
    resolutionToAspect(resolution) {
        const [w, h] = resolution.split('x').map(Number);
        if (!w || !h)
            return '9:16';
        if (w > h)
            return '16:9';
        if (w === h)
            return '1:1';
        return '9:16';
    }
    // ─── Step 3: 完整生成（SSE） ───
    async generate(input, sse) {
        const voice = voiceById(input.voiceId);
        const style = styleById(input.subtitleStyle);
        const [w, h] = (input.resolution || '1080x1920').split('x').map(Number);
        // B3: contentType 决定默认 BGM 音量(用户未显式指定时):
        //   - conceptual (讲解/教学,接近 tutorial)  → 12% : BGM 退后,语音清晰
        //   - narrative (故事/叙事)                 → 25% : BGM 撑氛围
        //   - mixed                                 → 20% : 折中
        const _ctForBgm = detectContentType(input.scriptText || '');
        const defaultBgmVolPct = _ctForBgm === 'conceptual' ? 12 : _ctForBgm === 'narrative' ? 25 : 20;
        // 合规预检：只做规则引擎（轻）+ 非阻塞提示。risky 级别仍允许生成，但 SSE 明确告警
        try {
            const pre = content_audit_1.contentAudit.audit(input.scriptText || '');
            if (pre.level !== 'clean') {
                sse.sendProgress(`⚠️ 文案含 ${pre.hits.length} 处疑似违禁词（${pre.level}）`, 1);
                logger_1.logger.warn(`[OneClick] pre-audit ${pre.level}: ${pre.hits.map((h) => h.word).join(', ')}`);
            }
        }
        catch (e) {
            logger_1.logger.warn('[OneClick] pre-audit failed: ' + String(e));
        }
        // BGM 校验 + OSS 按需下载
        let bgmFilePath = null;
        if (input.bgmId) {
            const [bgm] = await db_1.db.select().from(schema_1.bgmLibrary).where((0, drizzle_orm_1.eq)(schema_1.bgmLibrary.id, input.bgmId));
            if (!bgm)
                throw new Error(`BGM #${input.bgmId} 不存在`);
            if (bgm.filePath && /^https?:\/\//.test(bgm.filePath)) {
                // 是 OSS URL，先下载到本地
                logger_1.logger.info(`[OneClick] BGM #${input.bgmId} 是 OSS 曲目，先下载`);
                const { videoWorkshop } = require('./video-workshop');
                const downloaded = await videoWorkshop.downloadOssTrack(input.bgmId);
                if (downloaded?.filePath && fs_1.default.existsSync(downloaded.filePath)) {
                    bgmFilePath = downloaded.filePath;
                }
            }
            else if (bgm.filePath && fs_1.default.existsSync(bgm.filePath)) {
                bgmFilePath = bgm.filePath;
            }
        }
        // 创建 draft 记录
        const [record] = await db_1.db
            .insert(schema_1.slideshowVideos)
            .values({
            title: input.title,
            images: JSON.stringify(input.scenes.map((s) => s.imagePath || s.imageUrl || '')),
            scriptText: input.scriptText,
            // 持久化用户输入的原文，让"继续编辑"能还原 step 1 顶部口语化对比 Alert
            originalScript: input.originalScript || null,
            voiceId: input.voiceId,
            subtitleStyle: input.subtitleStyle,
            scenes: JSON.stringify(input.scenes),
            bgmId: input.bgmId ?? null,
            resolution: input.resolution,
            status: 'preparing',
            copywritingId: input.copywritingId ?? null,
            // 视觉风格预设：用于"继续编辑"恢复前端下拉默认值
            visualStyleId: input.visualStyleId ?? null,
        })
            .returning();
        try {
            // 1. 准备每个分镜的本地素材：视频优先，图片回落
            //    每一条记录 { kind: 'video'|'image', localPath }
            sse.sendProgress('准备素材', 5);
            const assetDir = ensureDataDir('one-click-cache', `v${record.id}`);
            const aiImageDir = ensureDataDir('one-click-cache', `v${record.id}`, 'ai-images');
            const aspect = this.resolutionToAspect(input.resolution || '1080x1920');
            const localAssets = [];
            for (let i = 0; i < input.scenes.length; i++) {
                const s = input.scenes[i];
                try {
                    if (s.videoUrl) {
                        const p = await downloadVideo(s.videoUrl, assetDir);
                        // mixed-video-image：videoUrl 是 8s 视频段，mixedImagePath 是延时静态图
                        const mixedStill = s.mixedImagePath && fs_1.default.existsSync(s.mixedImagePath)
                            ? s.mixedImagePath
                            : undefined;
                        localAssets.push({ kind: 'video', localPath: p, mixedImagePath: mixedStill });
                    }
                    else if (s.imagePath && fs_1.default.existsSync(s.imagePath)) {
                        // 用户上传 / AI 视频本地路径：按扩展名判断视频/图片
                        const ext = path_1.default.extname(s.imagePath).toLowerCase();
                        const kind = /\.(mp4|webm|mov|mkv)$/.test(ext) ? 'video' : 'image';
                        // mixed-video-image：imagePath 是视频段，mixedImagePath 是延时图
                        const mixedStill = kind === 'video' && s.mixedImagePath && fs_1.default.existsSync(s.mixedImagePath)
                            ? s.mixedImagePath
                            : undefined;
                        localAssets.push({ kind, localPath: s.imagePath, mixedImagePath: mixedStill });
                    }
                    else if (s.imageUrl) {
                        const p = await downloadImage(s.imageUrl, assetDir);
                        localAssets.push({ kind: 'image', localPath: p });
                    }
                    else if (s.generationMode === 'data-viz' && s.dataVizConfig) {
                        // 数据场景：编程生成可视化图片（不用 AI，100% 准确）
                        sse.sendProgress(`分镜 ${i + 1}/${input.scenes.length}：生成数据图表中...`, 5 + (i * 15) / input.scenes.length);
                        const pngPath = await (0, data_viz_1.generateDataViz)(s.dataVizConfig, input.resolution);
                        logger_1.logger.info(`[OneClick] scene#${s.index} data-viz ok: ${path_1.default.basename(pngPath)}`);
                        localAssets.push({ kind: 'image', localPath: pngPath });
                    }
                    else if (s.generationMode === 'ai-image' && (0, ai_image_gen_1.hasAnyImageProvider)()) {
                        // 分镜标了 ai-image，但用户没预先跑过 search-for-scene（或者跑了没保存）
                        // → 合成时兜底，现场调 AI 图 provider 生成
                        sse.sendProgress(`分镜 ${i + 1}/${input.scenes.length}：AI 生成图片中...`, 5 + (i * 15) / input.scenes.length);
                        const promptCN = stripCharIds((s.aiImagePromptCN || s.text || '')).slice(0, 500);
                        const promptEN = stripCharIds((s.aiImagePromptEN || '')).slice(0, 500);
                        if (!promptCN && !promptEN) {
                            throw new Error(`分镜 ${s.index} 标为 AI 图但缺少 prompt`);
                        }
                        // 云端化后 preferredImageProvider 不再起作用,统一走云端配置
                        const gen = await (0, ai_image_gen_1.generateImage)({ promptCN, promptEN, aspect, negativePrompt: s.negativePrompt }, aiImageDir);
                        logger_1.logger.info(`[OneClick] scene#${s.index} ai-image ok (${gen.provider} ${gen.elapsedSec.toFixed(1)}s ¥${gen.costCny})`);
                        localAssets.push({ kind: 'image', localPath: gen.localPath });
                    }
                    else {
                        throw new Error(`分镜 ${s.index} 没有配图或视频`);
                    }
                }
                catch (err) {
                    throw new Error(`分镜 ${s.index} 素材准备失败：${String(err?.message || err)}`);
                }
                sse.sendProgress(`准备素材 ${i + 1}/${input.scenes.length}（${localAssets[i].kind === 'video' ? '视频片段' : '静态图'}）`, 5 + ((i + 1) * 15) / input.scenes.length);
            }
            // 2. TTS：逐场景合成，得到每段音频 + 实际时长
            sse.sendProgress('TTS 配音', 22);
            const audioDir = ensureDataDir('one-click-cache', `v${record.id}`, 'audio');
            const segmentAudios = [];
            // 记录哪些分镜的语音降级了(云端 AI 音色 → Edge 免费机械音 / 静音占位),
            // 最终通过 sendDone 透传给前端结果页显式提醒 —— 降级绝不能静默
            const ttsFallbacks = [];
            for (let i = 0; i < input.scenes.length; i++) {
                const s = input.scenes[i];
                const outAudio = path_1.default.join(audioDir, `seg-${i + 1}.mp3`);
                if (config_1.USE_MOCK) {
                    // Mock：写占位音频 + 用估算时长
                    fs_1.default.writeFileSync(outAudio, `# Mock TTS\n# voice=${voice.dashscopeVoice || voice.id}\n# text=${s.text}\n`);
                    segmentAudios.push({ path: outAudio, duration: s.duration || (0, shared_1.estimateDuration)(s.text), text: s.text });
                }
                else {
                    try {
                        // CosyVoice2 配音：emotion 走自然语言指令前缀（在 dispatchTTS 内拼），
                        // 同时按 emotion 微调语速（语速倍率 ×0.9-1.15）
                        const emotionRate = adjustRateByEmotion(input.voiceRate, s.emotion, s.narrativeRole, voice.provider);
                        const ttsRes = await dispatchTTS(voice, s.text, outAudio, emotionRate, input.voicePitch, s.emotion);
                        if (ttsRes.fallback) {
                            ttsFallbacks.push({ scene: i + 1, reason: ttsRes.fallbackReason || '未知原因' });
                        }
                        // 合理性检查：高速率下 SF 偶尔返回空帧/破音频，probe 出来 < 0.5s 但本应至少 1s+
                        // 用 estimate 兜底（按 90% 缩放，因为是加速合成的）
                        const probed = this.probeDuration(outAudio);
                        const est = (0, shared_1.estimateDuration)(s.text);
                        const expectedMin = Math.max(0.6, est * 0.4); // 至少应该 40% 时长
                        let actual;
                        if (probed >= expectedMin) {
                            actual = probed;
                        }
                        else {
                            const fallbackEst = s.duration || est;
                            logger_1.logger.warn(`[OneClick] seg ${i + 1} probe=${probed.toFixed(2)}s 异常偏短（< ${expectedMin.toFixed(2)}s），` +
                                `fallback 用估算 ${fallbackEst.toFixed(2)}s。可能 TTS 加速过头/限流`);
                            actual = fallbackEst;
                        }
                        // 调试：打印 estimate / probed / 比例。语速 +30% 时理论 ratio ≈ 0.77
                        // 字幕不同步多半因为 probed 没反映加速 → 这条日志能直接看出来
                        logger_1.logger.info(`[TTS] seg ${i + 1}: text="${s.text.slice(0, 24)}..." est=${est.toFixed(2)}s probed=${probed.toFixed(2)}s ratio=${(probed / est).toFixed(2)}`);
                        segmentAudios.push({ path: outAudio, duration: actual, text: s.text });
                    }
                    catch (e) {
                        // TTS 合成失败（微软服务偶尔抽风 / 断网 / 限流）
                        // 不再用文本文件做 fallback（会让后续 ffmpeg concat 崩）
                        // 生成一段静音占位 mp3 让流程继续；字幕会照常烧录
                        logger_1.logger.warn(`[OneClick] tts failed on seg ${i + 1}: ${String(e)}`);
                        const fallbackDuration = s.duration || (0, shared_1.estimateDuration)(s.text) || 3;
                        try {
                            await execFileAsync((0, binaries_1.getFfmpegPath)(), [
                                '-y',
                                '-f', 'lavfi',
                                '-i', `anullsrc=r=24000:cl=mono`,
                                '-t', String(fallbackDuration),
                                '-c:a', 'libmp3lame', '-b:a', '48k',
                                outAudio,
                            ]);
                            segmentAudios.push({ path: outAudio, duration: fallbackDuration, text: s.text });
                            ttsFallbacks.push({
                                scene: i + 1,
                                reason: `TTS 完全失败,该段为静音占位: ${String(e?.message || e).slice(0, 120)}`,
                            });
                        }
                        catch (silenceErr) {
                            logger_1.logger.error(`[OneClick] silence fallback also failed on seg ${i + 1}: ${String(silenceErr)}`);
                            throw new Error(`第 ${i + 1} 段配音合成失败：${String(e?.message || e)}。建议：检查网络连接后重试，或换一个音色`);
                        }
                    }
                }
                sse.sendProgress(`TTS 配音 ${i + 1}/${input.scenes.length}`, 22 + ((i + 1) * 30) / input.scenes.length);
            }
            // 语音降级汇总:在进度流里立刻可见(结果页 done 事件还会再带完整明细)
            if (ttsFallbacks.length > 0) {
                logger_1.logger.warn(`[OneClick] ${ttsFallbacks.length}/${input.scenes.length} 个分镜语音降级: ` +
                    ttsFallbacks.map((f) => `#${f.scene}(${f.reason.slice(0, 60)})`).join('; '));
                sse.sendProgress(`⚠️ ${ttsFallbacks.length} 个分镜使用了免费兜底音色(机械音),完成后请查看提示`, 52);
            }
            // ── 字幕同步校正：先实测合并后 mp3 的真实总时长，与各段 probed 时长之和比对 ──
            //   语速调节后 TTS provider 返回的 mp3 容器 duration 偶尔不准（开头/结尾静音 padding 等），
            //   probed 加起来 ≠ 实际播放总长 → 字幕累计漂移，越到后面越明显。
            //   解决：合并测一次实际总长，按比例缩放每段 duration，让字幕累计 = 实际播放长。
            if (!config_1.USE_MOCK && segmentAudios.length > 0) {
                try {
                    const subAlignList = path_1.default.join(assetDir, 'subtitle-align-list.txt');
                    const subAlignMerged = path_1.default.join(assetDir, 'subtitle-align-merged.mp3');
                    fs_1.default.writeFileSync(subAlignList, segmentAudios.map((a) => `file '${a.path.replace(/'/g, "'\\''")}'`).join('\n'));
                    await execFileAsync((0, binaries_1.getFfmpegPath)(), [
                        '-y', '-f', 'concat', '-safe', '0', '-i', subAlignList,
                        '-c', 'copy', subAlignMerged,
                    ]);
                    const realMerged = this.probeDuration(subAlignMerged);
                    const sumProbed = segmentAudios.reduce((sum, a) => sum + a.duration, 0);
                    if (realMerged > 0.5 && sumProbed > 0.5) {
                        const ratio = realMerged / sumProbed;
                        const drift = realMerged - sumProbed;
                        if (Math.abs(drift) > 0.3) {
                            logger_1.logger.warn(`[OneClick] 字幕同步校正：实测合并后 ${realMerged.toFixed(2)}s vs 各段累计 ${sumProbed.toFixed(2)}s ` +
                                `（漂移 ${drift > 0 ? '+' : ''}${drift.toFixed(2)}s, ratio=${ratio.toFixed(3)}），按比例缩放各段时长`);
                            for (const a of segmentAudios)
                                a.duration *= ratio;
                        }
                        else {
                            logger_1.logger.info(`[OneClick] 字幕同步校正：实测合并 ${realMerged.toFixed(2)}s ≈ 累计 ${sumProbed.toFixed(2)}s（漂移 ${drift.toFixed(2)}s 在容差内，跳过）`);
                        }
                    }
                }
                catch (err) {
                    logger_1.logger.warn('[OneClick] 字幕同步预校正失败，使用 probed 时长：' + String(err));
                }
            }
            // ─── Phase 1.5: 数字人生成(opt-in,只对 useAvatar=true 的分镜调 wan2.2-s2v) ───
            // 产出 assetDir/avatar/avatar-{sceneIdx}.mp4,跟 segmentAudios[i] 同长。
            // 失败的分镜静默降级:不叠数字人,主流程不中断。
            const avatarOverlays = [];
            const avatarSettings = input.avatar;
            if (avatarSettings?.assetId) {
                const targetIndices = [];
                for (let i = 0; i < input.scenes.length; i++) {
                    if (input.scenes[i].useAvatar)
                        targetIndices.push(i);
                }
                // 诊断日志:展示前端发过来的 useAvatar 实际命中了哪些分镜(场景编号是 i+1 = 1-based)
                // C bug 排查用:用户说"我选了 1,2,3 但生成出来不是",这行日志能直接看到前端发了哪些
                logger_1.logger.info(`[OneClick] 数字人请求 — 总分镜 ${input.scenes.length} 个, ` +
                    `useAvatar=true 命中 ${targetIndices.length} 个: ` +
                    `场景[${targetIndices.map((i) => i + 1).join(', ')}]`);
                if (targetIndices.length > 0) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const { avatarAssetService } = require('./avatar-asset');
                        const avatarImagePath = await avatarAssetService.getLocalPath(avatarSettings.assetId);
                        if (!avatarImagePath) {
                            logger_1.logger.warn(`[OneClick] 数字人形象 id=${avatarSettings.assetId} 找不到本地文件,跳过全部数字人分镜`);
                        }
                        else {
                            const { generateDigitalHumanBatch } = require('./digital-human-gen');
                            const avatarDir = path_1.default.join(assetDir, 'avatar');
                            fs_1.default.mkdirSync(avatarDir, { recursive: true });
                            const reqs = targetIndices.map((idx) => ({
                                sceneIndex: idx,
                                req: {
                                    imagePath: avatarImagePath,
                                    audioPath: segmentAudios[idx].path,
                                    outputPath: path_1.default.join(avatarDir, `avatar-${idx + 1}.mp4`),
                                    resolution: avatarSettings.resolution || '480P',
                                },
                            }));
                            sse.sendProgress(`生成数字人 0/${targetIndices.length} (排队中…)`, 50);
                            let doneCount = 0;
                            const avTotal = targetIndices.length;
                            const batchResults = await generateDigitalHumanBatch(reqs, 2, (sceneIdx, status, err) => {
                                if (status === 'fail') {
                                    logger_1.logger.warn(`[OneClick] avatar scene ${sceneIdx + 1} fail: ${err}`);
                                    doneCount++;
                                }
                                if (status === 'done') {
                                    doneCount++;
                                    // 50% → 53% 之间细粒度推进度,让用户知道在动
                                    const pct = 50 + (doneCount / avTotal) * 3;
                                    sse.sendProgress(`生成数字人 ${doneCount}/${avTotal}`, pct);
                                }
                                if (status === 'start') {
                                    sse.sendProgress(`生成数字人 ${doneCount}/${avTotal} (分镜 ${sceneIdx + 1} 开始)`, 50);
                                }
                            });
                            for (const r of batchResults) {
                                if (r.result?.localPath) {
                                    avatarOverlays.push({ sceneIdx: r.sceneIndex, videoPath: r.result.localPath });
                                }
                            }
                            const ok = avatarOverlays.length;
                            const total = targetIndices.length;
                            logger_1.logger.info(`[OneClick] 数字人生成 ${ok}/${total} 成功`);
                            if (ok < total) {
                                sse.sendProgress(`数字人 ${ok}/${total} 成功(${total - ok} 个失败已降级到无画中画)`, 53);
                            }
                        }
                    }
                    catch (err) {
                        logger_1.logger.warn('[OneClick] 数字人 Phase 1.5 整体失败,降级为无数字人: ' + String(err));
                    }
                }
            }
            else {
                // 勾了数字人但请求没带 avatar 形象设置(前端没配默认形象 / 老版本前端)
                // → 按设计全部忽略,但必须留日志,否则"勾了却没有数字人"无从排查
                const wantedAvatar = input.scenes.filter((s) => s.useAvatar).length;
                if (wantedAvatar > 0) {
                    logger_1.logger.warn(`[OneClick] ${wantedAvatar} 个分镜勾选了数字人,但请求未带 avatar 形象设置 — ` +
                        '全部忽略(请检查 设置→数字人形象 是否已配置默认形象)');
                }
            }
            // 3. 生成字幕（优先用 ASR 真实时间戳）
            sse.sendProgress('生成字幕样式', 55);
            // 段间停顿已撤回（用户觉得反而不如紧凑念流畅）。设 0 让全链路自动 no-op：
            //   - 字幕 cursor 推进 = 纯 narration 时长
            //   - 画面 scene.duration = 纯 narration 时长
            //   - ffmpegCompose Phase 1 不再插静音文件
            const INTER_SEGMENT_PAUSE_SEC = 0;
            const N = segmentAudios.length;
            const totalGap = N > 1 ? INTER_SEGMENT_PAUSE_SEC * (N - 1) : 0;
            let totalDuration = segmentAudios.reduce((sum, a) => sum + a.duration, 0) + totalGap;
            const assPath = path_1.default.join(assetDir, `subtitles.ass`);
            const [resW, resH] = (input.resolution || '1080x1920').split('x').map(Number);
            // 字幕时间轴：cursor 推进时算上每段后的 250ms 静音（最后一段没有静音）
            //   字幕本身 [start, start+narration] 在念到的位置消失，不延伸到 silence
            //   下一段字幕从 prev.start + prev.narration + gap 开始 → 中间 250ms 无字幕
            let cursor = 0;
            const karaokeSegs = segmentAudios.map((a, i) => {
                const seg = {
                    start: cursor,
                    end: cursor + a.duration, // 字幕在 narration 结束就停
                    text: a.text,
                    highlights: (0, ass_subtitle_1.guessHighlights)(a.text, input.scenes[i]?.keywords),
                };
                cursor += a.duration + (i < N - 1 ? INTER_SEGMENT_PAUSE_SEC : 0);
                return seg;
            });
            // 如果用户配了 SiliconFlow，跑一次 ASR 用真实时间戳替换估算值
            const sfCred = external_credentials_1.externalCreds.get('siliconflow');
            if (sfCred?.apiKey && !config_1.USE_MOCK) {
                try {
                    sse.sendProgress('语音识别对齐字幕时间戳', 58);
                    // 先拼段音频成一个完整 mp3（和 ffmpegCompose 里一样的 concat 手法）
                    const audioListFile = path_1.default.join(assetDir, 'asr-audio-list.txt');
                    fs_1.default.writeFileSync(audioListFile, segmentAudios.map((a) => `file '${a.path.replace(/'/g, "'\\''")}'`).join('\n'));
                    const mergedForAsr = path_1.default.join(assetDir, 'asr-merged.m4a');
                    await execFileAsync((0, binaries_1.getFfmpegPath)(), [
                        '-y',
                        '-f', 'concat', '-safe', '0', '-i', audioListFile,
                        '-c:a', 'aac', '-b:a', '96k',
                        mergedForAsr,
                    ]);
                    // 调 ASR
                    const { asr } = require('./asr');
                    const asrResult = await asr.transcribeAudio(mergedForAsr);
                    // ASR 识别完成，仅用于 log 参考
                    // ⚠️ 不覆盖 karaokeSegs 的 start/end：
                    //    视频片段是按 probeDuration(每段 TTS 音频) 累加切割的，
                    //    字幕边界必须用同一套时间轴才能严格同步，不能用 ASR 的结果覆盖。
                    //    ASR 匹配容错（60%）在长视频里会导致累计漂移，越到后面越偏。
                    logger_1.logger.info(`[OneClick] ASR 识别完成（仅参考）：${asrResult.segments.length} 段，` +
                        `ASR总时长 ${asrResult.segments[asrResult.segments.length - 1]?.end?.toFixed(2)}s ` +
                        `vs ffprobe实测 ${totalDuration.toFixed(2)}s`);
                }
                catch (err) {
                    logger_1.logger.warn('[OneClick] ASR 对齐失败，使用估算时间戳：' + String(err));
                    // 失败不抛，继续用估算的 karaokeSegs
                }
            }
            // 生成 Karaoke ASS（带时间戳、淡入）
            const { writeKaraokeAss } = require('./ass-subtitle');
            writeKaraokeAss(assPath, resW, resH, input.subtitleStyle, karaokeSegs, {
                fontSizeOverride: input.subtitleFontSize,
                marginVOverride: input.subtitleMarginV,
            });
            // 仍保留一份 SRT 副本，方便用户拖进剪映改
            const srtPath = path_1.default.join(assetDir, `subtitles.srt`);
            this.writeSrt(srtPath, segmentAudios);
            // 4. ffmpeg 合成
            sse.sendProgress('FFmpeg 合成视频', 62);
            const videoDir = ensureDataDir('videos');
            const outputPath = path_1.default.join(videoDir, `oneclick-${record.id}-${Date.now()}.mp4`);
            if (config_1.USE_MOCK) {
                fs_1.default.writeFileSync(outputPath, `# Mock one-click video\n# scenes=${input.scenes.length}\n# duration=${totalDuration}s\n# voice=${voice.dashscopeVoice || voice.id}\n# style=${style.id}\n# bgm=${bgmFilePath ?? 'none'}\n`);
            }
            else {
                // 尾段过渡：默认全开（最优效果），用户传 tail.enabled === false 才关闭
                const tailIn = input.tail || {};
                const tailResolved = tailIn.enabled === false
                    ? undefined
                    : {
                        enabled: true,
                        freezeSec: typeof tailIn.freezeMs === 'number' ? tailIn.freezeMs / 1000 : 1.5,
                        voiceFadeSec: typeof tailIn.voiceFadeMs === 'number' ? tailIn.voiceFadeMs / 1000 : 0.3,
                        bgmFadeSec: typeof tailIn.bgmFadeMs === 'number' ? tailIn.bgmFadeMs / 1000 : 1.5,
                        fadeBlackSec: typeof tailIn.fadeBlackMs === 'number' ? tailIn.fadeBlackMs / 1000 : 0.6,
                    };
                await this.ffmpegCompose({
                    scenes: localAssets.map((a, i) => ({
                        kind: a.kind,
                        localPath: a.localPath,
                        mixedImagePath: a.mixedImagePath,
                        // 画面时长 = TTS 时长 + 末尾 250ms 静音（末段除外，让 tail 段接管）
                        // 这样画面和音频的总长度一致，concat 后字幕时间轴严格对齐
                        duration: segmentAudios[i].duration +
                            (i < segmentAudios.length - 1 ? INTER_SEGMENT_PAUSE_SEC : 0),
                        // 新增: 把 shotType/emotion 传进去,让 Ken Burns + BGM 音量按场景动态
                        shotType: input.scenes[i]?.shotType,
                        emotion: input.scenes[i]?.emotion,
                        keepOriginalAudio: input.scenes[i]?.keepOriginalAudio,
                    })),
                    avatarOverlays,
                    avatarSettings: avatarSettings
                        ? {
                            pipSize: avatarSettings.pipSize ?? 280,
                            pipMargin: avatarSettings.pipMargin ?? 30,
                            shape: (avatarSettings.shape ||
                                // 兜底:旧 circle 字段 → circle 模式;false → square 模式
                                (avatarSettings.circle === false ? 'square' : 'circle')),
                            position: avatarSettings.position ?? 'bottom-right',
                        }
                        : undefined,
                    segmentAudios,
                    assPath,
                    outputPath,
                    resolution: input.resolution,
                    bgmFilePath,
                    bgmVolume: (input.bgmVolume ?? defaultBgmVolPct) / 100, // 前端 0-50% → 0-0.5;未指定时按 contentType 自动选
                    aiVideoAudioVolume: typeof input.aiVideoAudioVolume === 'number'
                        ? input.aiVideoAudioVolume / 100
                        : 0.3,
                    assetDir,
                    // A3: 段间淡入淡出时长 — generate 没跑导演分析,这里走默认 medium (0.3s)
                    //   后续若把 director 分析迁进 generate 或通过 input 传入,可在此挂上 overallPace
                    // C3: 最终编码档跟随用户选的 qualityMode
                    qualityMode: input.qualityMode,
                    tail: tailResolved,
                    onProgress: (stage, pct) => sse.sendProgress(stage, 62 + pct * 0.35),
                });
                // 入库的 totalDuration 包含尾段冻结（缩略图截图也基于这个时长比例）
                if (tailResolved) {
                    totalDuration = totalDuration + tailResolved.freezeSec;
                }
            }
            // 5. 抽缩略图（B7: 改成总时长 15% 处)
            //   旧实现固定 -ss 2 → 短视频会落在淡入还没完成的位置(第 2s 处可能正在淡入),
            //   长视频又只取开头 2s,完全错过高潮。15% 是经验上覆盖"已稳定+尚未冗长"的最佳点。
            //   兜底:总时长不足 3s 时仍回退到 1s,避免取到完全没内容的首帧。
            let thumbnailPath = null;
            if (!config_1.USE_MOCK) {
                try {
                    thumbnailPath = path_1.default.join(assetDir, 'thumbnail.jpg');
                    const thumbT = totalDuration >= 3 ? Math.max(1, totalDuration * 0.15) : 1;
                    await execFileAsync((0, binaries_1.getFfmpegPath)(), [
                        '-y',
                        '-ss', thumbT.toFixed(2),
                        '-i', outputPath,
                        '-frames:v', '1',
                        '-vf', 'scale=480:-1',
                        '-q:v', '3',
                        thumbnailPath,
                    ]);
                }
                catch (err) {
                    logger_1.logger.warn('[OneClick] thumbnail extract failed: ' + String(err));
                    thumbnailPath = null;
                }
            }
            // 6. 入库
            await db_1.db
                .update(schema_1.slideshowVideos)
                .set({
                outputPath,
                srtPath,
                thumbnailPath,
                duration: Math.round(totalDuration),
                status: 'done',
                errorMsg: null,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.slideshowVideos.id, record.id));
            sse.sendProgress('完成', 100);
            sse.sendDone({
                id: record.id,
                outputPath,
                srtPath,
                thumbnailPath,
                duration: Math.round(totalDuration),
                // 语音降级明细(空数组不传):前端结果页据此显示 warning Alert,
                // 让用户知道"这条片的语音是兜底机械音,该去检查配置",而不是怪工具音质差
                ttsFallbacks: ttsFallbacks.length > 0 ? ttsFallbacks : undefined,
            });
        }
        catch (err) {
            await db_1.db
                .update(schema_1.slideshowVideos)
                .set({ status: 'failed', errorMsg: String(err) })
                .where((0, drizzle_orm_1.eq)(schema_1.slideshowVideos.id, record.id));
            throw err;
        }
    }
    // ─── ffmpeg 组合（新架构：每 scene 独立 normalize → concat → 字幕+BGM） ───
    async ffmpegCompose(p) {
        const [w, h] = p.resolution.split('x').map(Number);
        const ff = (0, binaries_1.getFfmpegPath)();
        // A3: 整体节奏决定段间淡入淡出时长 —— 三档要拉开足够差距,肉眼能看出区别
        //   fast   0.15s : 干脆利落不拖沓
        //   medium 0.30s : 默认
        //   slow   0.50s : 舒缓有呼吸感
        //   旧方案 0.2/0.3/0.4 三档差才 0.1s,改了等于没改
        const fadeDurByPace = p.overallPace === 'fast' ? 0.15 : p.overallPace === 'slow' ? 0.5 : 0.3;
        // C3: 最终编码档跟随用户选的 qualityMode
        //   budget    : crf 26, preset veryfast, 96k 音频  ← 体积小,出片最快
        //   balanced  : crf 22, preset medium,   128k 音频 ← 默认
        //   premium   : crf 19, preset slow,     192k 音频 ← 画质优先
        //   unlimited : crf 17, preset slower,   256k 音频 ← 完美主义
        const finalEnc = p.qualityMode === 'budget'
            ? { crf: '26', preset: 'veryfast', ab: '96k' }
            : p.qualityMode === 'premium'
                ? { crf: '19', preset: 'slow', ab: '192k' }
                : p.qualityMode === 'unlimited'
                    ? { crf: '17', preset: 'slower', ab: '256k' }
                    : { crf: '22', preset: 'medium', ab: '128k' };
        // 段间停顿已撤回（用户觉得插静音反而不如紧凑念流畅）。设 0 表示禁用：
        //   - Phase 1 audio concat 不再生成 / 插入 gap.mp3
        //   - 字幕 / 画面时长不会被人为延长
        //   - 注意：generate() 里也有同名常量，两处必须保持一致
        const INTER_SEGMENT_PAUSE_SEC = 0;
        // 尾段过渡参数（已解析过的秒值；不启用时全部 0，关键开关 .enabled 控制行为）
        const tailOn = !!p.tail?.enabled;
        const freezeSec = tailOn ? Math.max(0, p.tail.freezeSec || 0) : 0;
        const voiceFadeSec = tailOn ? Math.max(0, p.tail.voiceFadeSec || 0) : 0;
        const bgmFadeSec = tailOn ? Math.max(0, p.tail.bgmFadeSec || 0) : 0;
        const fadeBlackSec = tailOn ? Math.max(0, p.tail.fadeBlackSec || 0) : 0;
        const tailExtraSec = freezeSec; // 主轴时长扩展（纯冻结，不加片尾卡）
        // 旁路计算：配音真实时长（mergedAudio）= 各段相加；总视频长 = 配音 + 尾段
        const narrationDur = p.segmentAudios.reduce((sum, a) => sum + a.duration, 0);
        const totalVidDur = narrationDur + tailExtraSec;
        if (tailOn) {
            logger_1.logger.info(`[OneClick] tail enabled: freeze=${freezeSec}s voiceFade=${voiceFadeSec}s bgmFade=${bgmFadeSec}s fadeBlack=${fadeBlackSec}s | narration=${narrationDur.toFixed(2)}s totalVid=${totalVidDur.toFixed(2)}s`);
        }
        // Phase 1: 拼音频（每两段 TTS 之间插 250ms 静音，让 TTS 听起来更像真人换气） -----
        //   旧设计：所有 TTS 紧贴 concat → 听感"赶"
        //   新设计：每两段中间插 INTER_SEGMENT_PAUSE_SEC（250ms）静音
        //   字幕/画面 cursor 在 generate() 里已经把 gap 计算进 segment.duration，全链对齐
        p.onProgress?.('拼接 TTS 音频', 2);
        // 先生成一个 250ms 的静音 mp3（24kHz 单声道，跟 TTS 同格式），可重复使用
        const gapPath = path_1.default.join(p.assetDir, `inter-gap-${Math.round(INTER_SEGMENT_PAUSE_SEC * 1000)}ms.mp3`);
        if (INTER_SEGMENT_PAUSE_SEC > 0 && p.segmentAudios.length > 1) {
            try {
                await execFileAsync(ff, [
                    '-y',
                    '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
                    '-t', INTER_SEGMENT_PAUSE_SEC.toFixed(3),
                    '-c:a', 'libmp3lame', '-b:a', '48k',
                    gapPath,
                ]);
            }
            catch (err) {
                logger_1.logger.warn('[OneClick] 段间静音文件生成失败，跳过段间停顿: ' + String(err));
            }
        }
        const useGap = fs_1.default.existsSync(gapPath) && p.segmentAudios.length > 1;
        // 拼 audio-list.txt：tts1, gap, tts2, gap, ..., gap, ttsN（gap 不放在最后一段后面）
        const audioListFile = path_1.default.join(p.assetDir, 'audio-list.txt');
        const audioListLines = [];
        for (let i = 0; i < p.segmentAudios.length; i++) {
            audioListLines.push(`file '${p.segmentAudios[i].path.replace(/'/g, "'\\''")}'`);
            if (useGap && i < p.segmentAudios.length - 1) {
                audioListLines.push(`file '${gapPath.replace(/'/g, "'\\''")}'`);
            }
        }
        fs_1.default.writeFileSync(audioListFile, audioListLines.join('\n'));
        if (useGap) {
            logger_1.logger.info(`[OneClick] 段间停顿：${(INTER_SEGMENT_PAUSE_SEC * 1000).toFixed(0)}ms × ${p.segmentAudios.length - 1} = ${((INTER_SEGMENT_PAUSE_SEC * (p.segmentAudios.length - 1))).toFixed(2)}s`);
        }
        // ⚠️ 用 -c copy 保留原始 MP3 流（不重编码），
        //    避免 AAC 编码器每段 ~23ms encoder delay 累积漂移（40段≈920ms）。
        //    TTS 各段同来源（24kHz 单声道 MP3），gap 也是同格式，copy concat 安全。
        const mergedAudio = path_1.default.join(p.assetDir, 'merged.mp3');
        await execFileAsync(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', audioListFile, '-c', 'copy', mergedAudio]);
        // Phase 2: 每 scene 独立 normalize -----------------
        // 关键改进：
        //   - 图片：Ken Burns 动态（缓慢放大/平移），取代静态
        //   - 视频：保留原始运动
        //   - 横竖比不匹配时用高斯模糊原图铺底，取代黑边
        //   - 段首 0.3s 淡入、段尾 0.3s 淡出（段内过渡柔和）
        const normDir = path_1.default.join(p.assetDir, 'normalized');
        fs_1.default.mkdirSync(normDir, { recursive: true });
        const normalizedPaths = [];
        for (let i = 0; i < p.scenes.length; i++) {
            const s = p.scenes[i];
            const outPath = path_1.default.join(normDir, `scene-${i + 1}.mp4`);
            const dur = Math.max(1, s.duration);
            const fadeDur = fadeDurByPace;
            const fadeOutStart = Math.max(0, dur - fadeDur);
            const args = ['-y'];
            // mixed-video-image：视频段 + 静态图 0.5s xfade 拼接成单段输出
            if (s.kind === 'video' && s.mixedImagePath && fs_1.default.existsSync(s.mixedImagePath)) {
                const xfadeDur = 0.5;
                // 探测真实视频长度（veo 通常 8s，但可能 ±0.1）
                const probedVidLen = this.probeDuration(s.localPath) || 8;
                // 如果分镜总时长 <= 视频长度 + 1s，没必要拼图，直接走纯视频分支
                if (dur <= probedVidLen + 1) {
                    // 落入下面 video 分支
                }
                else {
                    // 视频段长度（用真实长度，最多到 dur - 1，给图片留空间）
                    const vidLen = Math.min(probedVidLen, dur - 1);
                    // 图片段长度 = 总长 - 视频长 + xfade（保证 xfade 后总长 = dur）
                    const imgLen = dur - vidLen + xfadeDur;
                    // Input 0: 视频段
                    args.push('-i', s.localPath);
                    // Input 1: 静态图 —— 单帧读入（不 loop），靠 zoompan d=imgFrames 自己生成 imgLen 秒
                    //   全流水线统一 30 fps:更顺滑、与 AI 视频源材料(seedance/wan/zhipu/jimeng/vidu 都默认 30fps)对齐,避免混编降帧
                    //   ⚠️ 不要写成 `-loop 1 -t imgLen -i image`：那是 INPUT 选项,
                    //      会让 fps=30 后送给 zoompan imgLen×30 个相同输入帧,
                    //      每帧再各自展开 imgFrames 帧 → 帧数平方爆炸（千倍级超长输出）
                    args.push('-i', s.mixedImagePath);
                    // Ken Burns for 静态图段（缓慢推近，不依赖 shotType — 与已成视频形成对比）
                    // 同 A1 思路:线性插值 1.0→1.12,首末位置不随 imgLen 变化
                    const imgFrames = Math.max(30, Math.round(30 * imgLen));
                    const kbDenom = Math.max(1, imgFrames - 1);
                    const kbZoom = `1.0000+(0.1200)*on/${kbDenom}`;
                    const kbX = `iw/2-(iw/zoom/2)`;
                    const kbY = `ih/2-(ih/zoom/2)`;
                    // 视频段处理链
                    const vChain = ['fps=30'];
                    vChain.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`, `trim=duration=${vidLen.toFixed(3)}`, 'setpts=PTS-STARTPTS', 'setsar=1', 'format=yuv420p', `fade=t=in:st=0:d=${fadeDur}`);
                    // 图片段处理链（单帧输入 + zoompan 生成 imgFrames 帧 = imgLen 秒）
                    //   不要前置 fps=30，否则会把单帧扩成 30 帧再送 zoompan，又触发平方爆炸
                    // 尾段启用时，最后一个分镜跳过 fade-out（否则 tpad 会冻结一帧黑画面）
                    const isLastScene = i === p.scenes.length - 1;
                    const skipFadeOut = isLastScene && tailOn && freezeSec > 0;
                    const iChain = [
                        `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=decrease`,
                        `zoompan=z='${kbZoom}':x='${kbX}':y='${kbY}':d=${imgFrames}:s=${w}x${h}:fps=30`,
                        'setsar=1',
                        'format=yuv420p',
                    ];
                    if (!skipFadeOut) {
                        iChain.push(`fade=t=out:st=${Math.max(0, imgLen - fadeDur).toFixed(3)}:d=${fadeDur}`);
                    }
                    // xfade offset：第一段从 vidLen-xfadeDur 处开始过渡
                    const xfadeOffset = Math.max(0, vidLen - xfadeDur);
                    // 最后场景在 xfade 之后再 tpad 冻结，让最后一帧定格 freezeSec 秒
                    const tailTpad = skipFadeOut
                        ? `,tpad=stop_mode=clone:stop_duration=${freezeSec.toFixed(3)}`
                        : '';
                    const filterComplex = `[0:v]${vChain.join(',')}[v0];` +
                        `[1:v]${iChain.join(',')}[v1];` +
                        `[v0][v1]xfade=transition=fade:duration=${xfadeDur}:offset=${xfadeOffset.toFixed(3)},format=yuv420p${tailTpad}[vout]`;
                    // mixed-video-image 分支当前不支持"保留 AI 视频原音"（filter_complex 已占用 [0:a]/[1:a]
                    //  布局，要塞原音得引入 audio xfade，复杂度高；先统一加静音轨保 concat 一致）
                    // 加 lavfi 静音输入（在已有的视频/图片输入之后，所以是 input 2）
                    args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo');
                    args.push('-filter_complex', filterComplex, '-map', '[vout]', '-map', '2:a');
                    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-t', String(dur), outPath);
                    await execFileAsync(ff, args);
                    normalizedPaths.push(outPath);
                    p.onProgress?.(`处理分镜 ${i + 1}/${p.scenes.length}（视频+延时图，${dur.toFixed(1)}s）`, 5 + ((i + 1) * 50) / p.scenes.length);
                    continue;
                }
            }
            if (s.kind === 'video') {
                // 视频 → 目标分辨率：
                //   现在 AI 视频从源头就出对的比例（veo/wan/seedance 都按 9:16/16:9 真出），
                //   所以不再需要 crop 裁切兜底——直接 scale + pad 黑边即可。
                // 视频长 < dur 时循环填到 dur；视频长 >= dur 时截到 dur（夹到口播长度）
                args.push('-stream_loop', '-1', '-i', s.localPath, '-t', String(dur));
                // 必须在 -vf 之前补上静音输入（如果不保留原音），否则 ffmpeg 会把 -vf 误绑到 lavfi 输入上
                const _wantsKeepAudio_v = !!s.keepOriginalAudio && this.probeHasAudio(s.localPath);
                if (!_wantsKeepAudio_v) {
                    args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo');
                }
                const vfSteps = ['fps=30'];
                // 保持原始 aspect ratio，不够铺满的部分 pad 黑边
                // （源头比例对了 → 视频自身和目标 aspect 一致 → 不会有黑边）
                vfSteps.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`);
                vfSteps.push('setsar=1', 'format=yuv420p', `fade=t=in:st=0:d=${fadeDur}`);
                // 最后场景启用尾段时跳过 fade-out（否则 tpad 冻结一帧黑画面），改为 tpad 冻结
                const isLastSceneV = i === p.scenes.length - 1;
                if (isLastSceneV && tailOn && freezeSec > 0) {
                    vfSteps.push(`tpad=stop_mode=clone:stop_duration=${freezeSec.toFixed(3)}`);
                }
                else {
                    vfSteps.push(`fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDur}`);
                }
                args.push('-vf', vfSteps.join(','));
            }
            else {
                // 图片：Ken Burns（zoompan）+ 简单 pad，fade in/out
                //
                // 【批次 2】按 shotType 选不同运镜 — 让视觉节奏匹配镜头意图
                //   close-up 特写 → 缓慢拉远(zoom-out slow)揭示环境
                //   medium  中景 → 缓慢推近(zoom-in normal)聚焦主体
                //   wide    远景 → 水平平移(pan-right)展示全景
                //   pov     第一视角 → 快速推近(zoom-in fast)代入感
                //   aerial  航拍 → 极慢拉远(zoom-out very slow)大气感
                // 未指定 shotType 时兜底:偶奇交替(保持旧行为)
                const frames = Math.max(30, Math.round(30 * dur));
                // 【A1】Ken Burns 用线性插值替代逐帧累加 —— 旧实现 zoom+0.0008/帧,
                //   3s (90 帧) 推到 1.072,10s (300 帧) 推到 1.24,镜头节奏完全失控。
                //   现在固定 zoom 区间(from→to),按总帧数均分:无论 dur 多少,首末帧位置一致。
                //   表达式:  z = from + (to - from) * on / (frames - 1)
                //   pan 同理:走 ±panRange/2 全程,与帧数无关。
                let zFrom;
                let zTo;
                let panRange; // 水平平移像素量 (在 2x 放大坐标系下)
                switch (s.shotType) {
                    case 'close-up':
                        // 特写:从 1.30 缓慢拉远到 1.00,揭示细节到环境
                        zFrom = 1.30;
                        zTo = 1.00;
                        panRange = 0;
                        break;
                    case 'medium':
                        // 中景:从 1.00 缓慢推近到 1.18
                        zFrom = 1.00;
                        zTo = 1.18;
                        panRange = 0;
                        break;
                    case 'wide':
                        // 远景:几乎不缩放,只水平平移 ±40px
                        zFrom = 1.00;
                        zTo = 1.06;
                        panRange = 80;
                        break;
                    case 'pov':
                        // POV:快速推近,强代入
                        zFrom = 1.00;
                        zTo = 1.30;
                        panRange = 0;
                        break;
                    case 'aerial':
                        // 航拍:极慢拉远,大气感
                        zFrom = 1.15;
                        zTo = 1.00;
                        panRange = 0;
                        break;
                    default: {
                        // 未指定 → 偶奇交替
                        if (i % 2 === 0) {
                            zFrom = 1.00;
                            zTo = 1.18;
                            panRange = 0;
                        }
                        else {
                            zFrom = 1.18;
                            zTo = 1.00;
                            panRange = 50;
                        }
                        break;
                    }
                }
                const fStr = (n) => n.toFixed(4);
                const dz = zTo - zFrom;
                const denom = Math.max(1, frames - 1);
                // zoompan 的 zoom 变量初值是 1.0;我们直接用 on 计算位置,完全不依赖 zoom 状态
                const zoomExpr = Math.abs(dz) < 1e-4
                    ? fStr(zFrom)
                    : `${fStr(zFrom)}+(${fStr(dz)})*on/${denom}`;
                const xExpr = panRange === 0
                    ? `iw/2-(iw/zoom/2)`
                    : `iw/2-(iw/zoom/2)+(on/${denom}-0.5)*${panRange}`;
                const yExpr = `ih/2-(ih/zoom/2)`;
                args.push('-loop', '1', '-i', s.localPath, '-t', String(dur));
                // 图片场景没有原音可保留，必须加静音输入；放在 -vf 之前防止误绑
                args.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo');
                // scale 到 2 倍画布给 zoompan 平滑运镜的 headroom。
                // ⚠️ 必须接 pad 把画布补满到 2w×2h —— 否则用户上传的"非目标比例"图片
                //    (如横图传进竖屏项目)scale 后只占画布一部分,zoompan 按 s=w×h 裁切的
                //    窗口会超出图片边界 → 大面积黑甚至全黑(AI 图比例天生对所以没暴露,
                //    上传场景才踩到)。pad 黑边后窗口永远落在画布内,off-aspect 图变成居中黑边。
                const isLastSceneImg = i === p.scenes.length - 1;
                const lastFreezeImg = isLastSceneImg && tailOn && freezeSec > 0;
                const vfArr = [
                    'fps=30',
                    `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=decrease`,
                    `pad=${w * 2}:${h * 2}:(ow-iw)/2:(oh-ih)/2:color=black`,
                    `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${w}x${h}:fps=30`,
                    'setsar=1',
                    'format=yuv420p',
                    `fade=t=in:st=0:d=${fadeDur}`,
                ];
                // 最后场景启用尾段时把"fade-out"换成"tpad 冻结"，让最后一帧停留 freezeSec
                if (lastFreezeImg) {
                    vfArr.push(`tpad=stop_mode=clone:stop_duration=${freezeSec.toFixed(3)}`);
                }
                else {
                    vfArr.push(`fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDur}`);
                }
                const vf = vfArr.join(',');
                args.push('-vf', vf);
            }
            // ── 音轨处理 ──────────────────────────────────────────────────────────
            // 静音输入和原音判定已在各分支（video/image）的 -vf 之前完成；这里只做 map + codec + output
            // wantsKeepAudio 与 video 分支保持一致：仅 video 且勾了 keepOriginalAudio 且源有音频 → 取 0:a
            const wantsKeepAudio = s.kind === 'video' && !!s.keepOriginalAudio && this.probeHasAudio(s.localPath);
            if (wantsKeepAudio) {
                // 保留原音：input 0 的第 1 个视频流 + input 0 的音频
                // 用 0:v:0 不用 0:v —— wuyinkeji/grok 这类源带"attached pic"封面 mjpeg 流,
                // -map 0:v 会把封面也映射进输出,mp4 容器不允许两个 h264 视频流 →
                // "Could not write header (incorrect codec parameters?)" 直接挂掉整段合成
                args.push('-map', '0:v:0', '-map', '0:a', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '2', '-t', String(dur), outPath);
                logger_1.logger.info(`[OneClick] scene ${i + 1} 保留 AI 视频原音`);
            }
            else {
                // 静音轨：input 0 的第 1 个视频流 + input 1 的 lavfi 静音(同上,只取 0:v:0)
                args.push('-map', '0:v:0', '-map', '1:a', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-t', String(dur), outPath);
            }
            const _t0 = Date.now();
            logger_1.logger.info(`[OneClick] normalize scene ${i + 1}/${p.scenes.length} 开始 (${s.kind}, dur=${dur.toFixed(2)}s, keepAudio=${wantsKeepAudio})`);
            try {
                await execFileAsync(ff, args);
            }
            catch (e) {
                const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
                logger_1.logger.error(`[OneClick] normalize scene ${i + 1} failed (${s.kind} ${s.localPath}): ${String(e)}` +
                    (stderr ? `\n--- ffmpeg stderr (tail) ---\n${stderr.slice(-1500)}` : ''));
                throw new Error(`分镜 ${i + 1} 视频流归一化失败。源: ${path_1.default.basename(s.localPath)}`);
            }
            logger_1.logger.info(`[OneClick] normalize scene ${i + 1} 完成（耗时 ${((Date.now() - _t0) / 1000).toFixed(1)}s）`);
            normalizedPaths.push(outPath);
            p.onProgress?.(`处理分镜 ${i + 1}/${p.scenes.length}（${s.kind === 'video' ? '视频' : 'Ken Burns 动画'}）`, 5 + ((i + 1) * 40) / p.scenes.length);
        }
        // ─── Phase 2.5: 数字人 overlay(只对 avatarOverlays 里有的分镜做) ───
        // 把上一步的 normalizedPaths[i] 替换成"叠了画中画"的版本
        if (p.avatarOverlays && p.avatarOverlays.length > 0 && p.avatarSettings) {
            const { overlayDigitalHuman } = require('./digital-human-gen');
            const overlayMap = new Map();
            for (const ov of p.avatarOverlays)
                overlayMap.set(ov.sceneIdx, ov.videoPath);
            for (let i = 0; i < normalizedPaths.length; i++) {
                const avatarMp4 = overlayMap.get(i);
                if (!avatarMp4)
                    continue;
                const withAvatar = normalizedPaths[i].replace(/\.mp4$/, '-with-avatar.mp4');
                try {
                    await overlayDigitalHuman({
                        scenePath: normalizedPaths[i],
                        avatarPath: avatarMp4,
                        outputPath: withAvatar,
                        size: p.avatarSettings.pipSize,
                        margin: p.avatarSettings.pipMargin,
                        shape: p.avatarSettings.shape,
                        position: p.avatarSettings.position,
                    });
                    normalizedPaths[i] = withAvatar;
                    p.onProgress?.(`叠加数字人 ${i + 1}/${p.scenes.length}`, 48 + ((i + 1) * 4) / p.scenes.length);
                }
                catch (err) {
                    // 单个 overlay 失败不阻塞主流程,保留无画中画的原 scene-N.mp4
                    logger_1.logger.warn(`[OneClick] scene ${i + 1} overlay digital human failed,降级无画中画: ${String(err).slice(0, 200)}`);
                }
            }
        }
        // Phase 3: 把所有分镜（最后一个已 tpad 冻结）concat 成一整条 ----
        //   片尾卡功能已停用（用户不要）：尾段只剩"末帧冻结 + 整体淡黑 + 配音/BGM 渐隐"
        p.onProgress?.('拼接分镜', 52);
        const sceneListFile = path_1.default.join(p.assetDir, 'scene-list.txt');
        const allClips = [...normalizedPaths];
        fs_1.default.writeFileSync(sceneListFile, allClips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
        const concatVideo = path_1.default.join(p.assetDir, 'concat.mp4');
        await execFileAsync(ff, ['-y', '-f', 'concat', '-safe', '0', '-i', sceneListFile, '-c', 'copy', concatVideo]);
        // 配音原长 narrationDur，没有开场卡偏移，所以 mergedAudio 直接用
        // 尾段的"配音渐隐 + 静音填充到 totalVidDur"由 Phase 4 filter_complex 里的 afade+apad 完成
        const finalMergedAudio = mergedAudio;
        // Phase 4: 烧字幕（ASS）+ 混音频 + 尾段渐隐 -----------------
        p.onProgress?.('烧录字幕 + 混音', 70);
        // 字幕：narrationDur 内自然结束，尾段（freeze + endcard）期间无字幕。无需偏移。
        const assEscaped = p.assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
        // 视频滤镜链：烧字幕 → 整体淡黑（仅尾段启用且 fadeBlackSec > 0）
        const videoFilters = [`ass='${assEscaped}'`];
        if (tailOn && fadeBlackSec > 0 && totalVidDur > fadeBlackSec) {
            const blackStart = (totalVidDur - fadeBlackSec).toFixed(3);
            videoFilters.push(`fade=t=out:st=${blackStart}:d=${fadeBlackSec.toFixed(3)}`);
        }
        const subtitlesFilter = videoFilters.join(',');
        const finalArgs = [
            '-y',
            '-i', concatVideo,
            '-i', finalMergedAudio,
        ];
        // ── voice 滤镜链：volume → 末尾渐隐（如启用）→ 静音填充到 totalVidDur ─────────
        //   narration-leads 模式下 mergedAudio = 紧凑口播（长度 = narrationDur），
        //   voice fade 应该在最后一句口播结束（= narrationDur）的前 voiceFadeSec 秒触发，
        //   再用 apad 把 voice 撑到 totalVidDur（多出来的部分是静音，BGM 兜着）。
        const voiceChain = ['volume=1.0'];
        if (tailOn && voiceFadeSec > 0 && narrationDur > voiceFadeSec) {
            const vfStart = (narrationDur - voiceFadeSec).toFixed(3);
            voiceChain.push(`afade=t=out:st=${vfStart}:d=${voiceFadeSec.toFixed(3)}`);
        }
        // 启用尾段：voice 必须 apad 到 totalVidDur，否则末尾会"音轨提前结束"
        if (tailOn && tailExtraSec > 0) {
            voiceChain.push(`apad=whole_dur=${totalVidDur.toFixed(3)}`);
        }
        const voiceFilter = voiceChain.join(',');
        // ── AI 视频原音（concatVideo 的 [0:a] 流）──────────────────────────
        // 任一分镜 keepOriginalAudio=true → 把 [0:a] 加到 amix
        // 音量由前端 aiVideoAudioVolume 决定（0-50%，对应 0-0.5），默认 0.3
        const anyKeepAudio = p.scenes.some((s) => s.kind === 'video' && s.keepOriginalAudio);
        const ORIG_AUDIO_VOL = Math.max(0, Math.min(0.5, typeof p.aiVideoAudioVolume === 'number' ? p.aiVideoAudioVolume : 0.3));
        if (p.bgmFilePath) {
            finalArgs.push('-i', p.bgmFilePath);
            // 视频流烧字幕，音频流 mix BGM
            // bgmVolume 0-0.5（前端 0-50%），默认 0.2
            const bgmVol = typeof p.bgmVolume === 'number' ? Math.max(0, Math.min(0.5, p.bgmVolume)) : 0.2;
            // ── BGM 动态音量：按 emotion 分镜分段调整 ──────────────────────────────
            // 情绪 → BGM 音量系数（语音始终 1.0，BGM 随情绪涨落）
            const emotionVolMult = {
                excited: 0.90, // 激情时 BGM 稍响
                cheerful: 0.85,
                humorous: 0.80,
                dramatic: 0.72,
                calm: 0.50, // 舒缓时 BGM 退后，让语音清晰
                serious: 0.45, // 严肃/知识类，BGM 最小化
            };
            // 构建分镜时间轴（不再有开场卡偏移，直接 0 起算）
            let segCumT = 0;
            const bgmSegs = [];
            for (const s of p.scenes) {
                const mult = emotionVolMult[s.emotion ?? ''] ?? 0.72;
                bgmSegs.push({ startT: segCumT, vol: bgmVol * mult });
                segCumT += s.duration;
            }
            // 构建 FFmpeg 分段 volume 表达式：if(lt(t,T2),V1,if(lt(t,T3),V2,...,Vn))
            // 如果所有段音量差 < 0.01，直接用固定值（避免生成超长 filter 字符串）
            const allSame = bgmSegs.length <= 1 ||
                bgmSegs.every(seg => Math.abs(seg.vol - bgmSegs[0].vol) < 0.01);
            let bgmVolFilter;
            if (allSame) {
                bgmVolFilter = `volume=${bgmVol.toFixed(3)}`;
            }
            else {
                // 从右往左嵌套 if
                let expr = bgmSegs[bgmSegs.length - 1].vol.toFixed(3);
                for (let bi = bgmSegs.length - 2; bi >= 0; bi--) {
                    const cutT = bgmSegs[bi + 1].startT.toFixed(2);
                    const segVol = bgmSegs[bi].vol.toFixed(3);
                    expr = `if(lt(t,${cutT}),${segVol},${expr})`;
                }
                bgmVolFilter = `volume='${expr}'`;
                logger_1.logger.info(`[OneClick] BGM 动态音量 ${bgmSegs.length} 段，表达式长度 ${expr.length} chars`);
            }
            // ──────────────────────────────────────────────────────────────────────
            // BGM 链：aloop 防止 BGM 比视频短 → 动态音量 → 末尾渐隐（如启用）
            const bgmChain = [
                'aloop=loop=-1:size=2147483647', // ≈ 不限循环（直到 -t 截断）
                bgmVolFilter,
            ];
            if (tailOn && bgmFadeSec > 0 && totalVidDur > bgmFadeSec) {
                const bgmFadeStart = (totalVidDur - bgmFadeSec).toFixed(3);
                bgmChain.push(`afade=t=out:st=${bgmFadeStart}:d=${bgmFadeSec.toFixed(3)}`);
            }
            const bgmFilter = bgmChain.join(',');
            // BGM 路径：voice + bgm (+ optional origaud) → amix
            const audioStreams = ['[voice]', '[bgm]'];
            let extraFilters = '';
            if (anyKeepAudio) {
                extraFilters += `;[0:a]volume=${ORIG_AUDIO_VOL.toFixed(2)}[origaud]`;
                audioStreams.push('[origaud]');
            }
            finalArgs.push('-filter_complex', `[0:v]${subtitlesFilter}[v];[1:a]${voiceFilter}[voice];[2:a]${bgmFilter}[bgm]${extraFilters};${audioStreams.join('')}amix=inputs=${audioStreams.length}:duration=first:dropout_transition=2[aout]`, '-map', '[v]', '-map', '[aout]');
        }
        else if (anyKeepAudio ||
            (tailOn && (voiceFadeSec > 0 || tailExtraSec > 0 || fadeBlackSec > 0))) {
            // 无 BGM 但启用了尾段 / 启用了"原音保留" → 仍走 filter_complex
            if (anyKeepAudio) {
                // voice + origaud 混合
                finalArgs.push('-filter_complex', `[0:v]${subtitlesFilter}[v];[1:a]${voiceFilter}[voice];[0:a]volume=${ORIG_AUDIO_VOL.toFixed(2)}[origaud];[voice][origaud]amix=inputs=2:duration=first:dropout_transition=2[aout]`, '-map', '[v]', '-map', '[aout]');
            }
            else {
                // 仅尾段：voice 单独保留
                finalArgs.push('-filter_complex', `[0:v]${subtitlesFilter}[v];[1:a]${voiceFilter}[voice]`, '-map', '[v]', '-map', '[voice]');
            }
        }
        else {
            // 完全的"老路径"：无 BGM 且无尾段 + 没人要原音 → 简单 -vf 烧字幕
            // 0:v:0 跟 normalize 一致 — 防止上游某些 mp4 自带 attached pic 封面流被一并 map
            finalArgs.push('-vf', subtitlesFilter);
            finalArgs.push('-map', '0:v:0', '-map', '1:a');
        }
        finalArgs.push('-c:v', 'libx264', '-preset', finalEnc.preset, '-crf', finalEnc.crf, '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', finalEnc.ab, 
        // 尾段启用时用 -t 显式控时长（apad 已让 voice 撑到 totalVidDur）
        // 否则保留旧的 -shortest 行为
        ...(tailOn ? ['-t', totalVidDur.toFixed(3)] : ['-shortest']), '-movflags', '+faststart', p.outputPath);
        // 兜底：确保输出目录存在（ffmpeg 不会自动创建父目录）
        fs_1.default.mkdirSync(path_1.default.dirname(p.outputPath), { recursive: true });
        try {
            await execFileAsync(ff, finalArgs);
            p.onProgress?.('完成', 100);
        }
        catch (e) {
            // execFileAsync 失败时 stderr 在 e.stderr 上，把真实原因抠出来
            const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
            // 取 stderr 里最有信号的一行（"Error ..." / "No such file" / "Invalid ..."）
            const errLines = stderr.split(/\r?\n/).filter((l) => /Error|No such|Invalid|Permission/i.test(l));
            const realCause = errLines.length > 0 ? errLines[errLines.length - 1].trim() : '';
            logger_1.logger.error('[OneClick] final compose failed: ' + String(e?.message || e) +
                (stderr ? '\n--- ffmpeg stderr (tail) ---\n' + stderr.slice(-1500) : ''));
            const check = (0, binaries_1.checkBinary)('ffmpeg');
            if (!check.ok) {
                throw new Error('ffmpeg 不可用：软件内置了 ffmpeg 但无法启动。打开"设置 → 系统体检"查看详情');
            }
            throw new Error(realCause
                ? `最终合成失败：${realCause}`
                : `最终合成失败：${String(e?.message || e).split('\n')[0]}。常见原因：字幕路径含特殊字符 / 磁盘空间不足`);
        }
    }
    /**
     * 渲染开场/结尾卡片视频：渐变色背景 + drawtext 大字。
     * 字体用 Windows 系统自带的微软雅黑（msyh.ttc）；找不到就不写 drawtext。
     * @param durOverride 可选，覆盖默认时长（开场 1.5s / 结尾 1.0s）。尾段卡片传 2.5 之类
     */
    async renderCardVideo(ff, outPath, w, h, text, kind, durOverride) {
        const dur = typeof durOverride === 'number' && durOverride > 0
            ? durOverride
            : kind === 'opening' ? 1.5 : 1.0;
        // 系统字体路径（Windows 默认）
        const fontCandidates = [
            'C:/Windows/Fonts/msyh.ttc',
            'C:/Windows/Fonts/msyh.ttf',
            'C:/Windows/Fonts/simhei.ttf',
            'C:/Windows/Fonts/simsun.ttc',
        ];
        const fontFile = fontCandidates.find((f) => fs_1.default.existsSync(f));
        // 渐变背景色
        const bgColor = kind === 'opening' ? '0x1a1a2e' : '0x2e1a2e';
        // 文本截短：超过 10 字折行，避免溢出
        const trimmed = text.length > 20 ? text.slice(0, 20) : text;
        const lines = trimmed.match(/.{1,10}/g) || [trimmed];
        const wrapped = lines.join('\n');
        // ffmpeg drawtext 里的特殊字符：反斜杠、冒号、单引号、百分号
        const escaped = wrapped
            .replace(/\\/g, '\\\\')
            .replace(/:/g, '\\:')
            .replace(/'/g, "\u2019") // 用全角右单引号替代，彻底避免 ffmpeg 解析问题
            .replace(/%/g, '\\%');
        // fontsize 只能是固定数字；动画效果改用 alpha 淡入
        const fontSize = Math.round(w * 0.08);
        const drawtext = fontFile
            ? [
                `drawtext=fontfile='${fontFile.replace(/\\/g, '/').replace(/:/g, '\\:')}'`,
                `text='${escaped}'`,
                `fontcolor=white`,
                `fontsize=${fontSize}`,
                `line_spacing=20`,
                `x=(w-text_w)/2`,
                `y=(h-text_h)/2`,
                `box=0`,
                // 前 0.3s 淡入 + 后 0.3s 淡出
                `alpha='if(lt(t,0.3),t/0.3,if(gt(t,${(dur - 0.3).toFixed(2)}),(${dur}-t)/0.3,1))'`,
            ].join(':')
            : '';
        const args = [
            '-y',
            '-f', 'lavfi', '-i', `color=${bgColor}:size=${w}x${h}:rate=30:duration=${dur}`,
            '-vf', drawtext || 'null',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-r', '30',
            '-t', String(dur),
            outPath,
        ];
        await execFileAsync(ff, args);
    }
    /** 读取音频/视频时长（秒），失败返 0
     *  ─ 优先 `stream=duration`（流层精确时长）；不准时退 `format=duration`（容器层估算）
     *  ─ 视频/音频通用；MP3 加速后容器 metadata 偶尔失真，stream 层更接近实际播放长度
     */
    probeDuration(file) {
        const tryProbe = (entries, streamSelect) => {
            try {
                const { execFileSync } = require('child_process');
                const args = ['-v', 'error'];
                if (streamSelect)
                    args.push('-select_streams', streamSelect);
                args.push('-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', file);
                const out = execFileSync((0, binaries_1.getFfprobePath)(), args, { encoding: 'utf8' }).trim();
                const n = parseFloat(out);
                return Number.isFinite(n) && n > 0 ? n : 0;
            }
            catch {
                return 0;
            }
        };
        // 1) 流层 duration（音频流） —— 最准
        const streamDur = tryProbe('stream=duration', 'a:0');
        if (streamDur > 0)
            return streamDur;
        // 2) 流层 duration（视频流）—— 视频文件
        const videoDur = tryProbe('stream=duration', 'v:0');
        if (videoDur > 0)
            return videoDur;
        // 3) 容器层 duration —— 兜底
        return tryProbe('format=duration');
    }
    /** 探测视频文件是否带音频流（用于"保留 AI 视频原音"功能） */
    probeHasAudio(file) {
        try {
            const { execFileSync } = require('child_process');
            const out = execFileSync((0, binaries_1.getFfprobePath)(), [
                '-v', 'error',
                '-select_streams', 'a',
                '-show_entries', 'stream=codec_type',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                file,
            ], { encoding: 'utf8' }).trim();
            return out.includes('audio');
        }
        catch {
            return false;
        }
    }
    /** 用每段 TTS 时长生成 SRT（按 15 字切行） */
    writeSrt(destPath, segments) {
        let cur = 0;
        const blocks = [];
        let idx = 1;
        for (const seg of segments) {
            const lines = splitCaption(seg.text, 15);
            // 把本段时长均分给各小行
            const per = seg.duration / Math.max(1, lines.length);
            for (const line of lines) {
                const start = cur;
                const end = cur + per;
                blocks.push(`${idx}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${line}\n`);
                cur += per;
                idx++;
            }
        }
        fs_1.default.writeFileSync(destPath, blocks.join('\n'), 'utf8');
    }
    // ─── CRUD ───
    async list(page = 1, pageSize = 20) {
        const [items, totalRow] = await Promise.all([
            db_1.db
                .select()
                .from(schema_1.slideshowVideos)
                .orderBy((0, drizzle_orm_1.desc)(schema_1.slideshowVideos.id))
                .limit(pageSize)
                .offset((page - 1) * pageSize),
            db_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)`.mapWith(Number) }).from(schema_1.slideshowVideos),
        ]);
        return {
            items: items.map((r) => ({
                ...r,
                images: this.safeParseJson(r.images),
                scenes: this.safeParseJson(r.scenes),
            })),
            page,
            pageSize,
            total: totalRow[0]?.n ?? 0,
        };
    }
    async get(id) {
        const [row] = await db_1.db.select().from(schema_1.slideshowVideos).where((0, drizzle_orm_1.eq)(schema_1.slideshowVideos.id, id));
        if (!row)
            return null;
        return {
            ...row,
            images: this.safeParseJson(row.images),
            scenes: this.safeParseJson(row.scenes),
        };
    }
    async remove(id) {
        await db_1.db.delete(schema_1.slideshowVideos).where((0, drizzle_orm_1.eq)(schema_1.slideshowVideos.id, id));
        return { removed: true };
    }
    /** 批量删除 */
    async removeMany(ids) {
        let n = 0;
        for (const id of ids) {
            try {
                await this.remove(id);
                n++;
            }
            catch (err) {
                logger_1.logger.warn(`[OneClick] remove #${id} failed: ${err}`);
            }
        }
        return { removed: n };
    }
    /**
     * 导出草稿包：把生成过程中的所有素材打包成 zip，用户拿去剪映等工具里替换画面。
     *
     * 包结构：
     *   audio.mp3              合成好的完整 TTS
     *   subtitles.srt          字幕（剪映能直接导入）
     *   subtitles.ass          高级字幕
     *   scenes/scene-1.mp4     每个分镜下载的原视频（或图片）
     *   shot-list.csv          分镜清单（时长/关键词/文案）
     *   README.md              使用说明
     */
    async exportDraft(id) {
        const archiver = require('archiver');
        const [row] = await db_1.db.select().from(schema_1.slideshowVideos).where((0, drizzle_orm_1.eq)(schema_1.slideshowVideos.id, id));
        if (!row)
            throw new Error('作品不存在');
        const assetDir = (0, paths_1.dataDir)('one-click-cache', `v${id}`);
        if (!fs_1.default.existsSync(assetDir)) {
            throw new Error('素材缓存已被清理，无法导出草稿包。请重新生成一次');
        }
        // 输出 zip 到 data/drafts/oneclick-<id>-draft.zip
        const draftDir = ensureDataDir('drafts');
        const zipPath = path_1.default.join(draftDir, `oneclick-${id}-draft.zip`);
        const scenes = this.safeParseJson(row.scenes) || [];
        const shotList = [
            ['index', 'duration_s', 'text', 'keywords', 'source', 'credit'].join(','),
            ...scenes.map((s) => [
                s.index,
                s.duration,
                JSON.stringify(s.text || ''),
                JSON.stringify((s.keywords || []).join('; ')),
                s.videoUrl ? 'video' : s.imageUrl ? 'image' : s.imagePath ? 'upload' : '?',
                JSON.stringify(s.imageCredit || ''),
            ].join(',')),
        ].join('\n');
        const readme = `# 一键成片草稿包 #${id}

本包为 AI 生成的素材 + 音频 + 字幕合集，用于你在剪映/PR/Final Cut 里自行精修。

## 文件说明

- **audio.mp3**：完整 TTS 配音（CosyVoice2 ${row.voiceId || 'dashscope-longanhuan'}）
- **subtitles.srt**：字幕文件，剪映/PR 直接导入
- **subtitles.ass**：带样式的高级字幕（支持关键词高亮，仅部分软件兼容）
- **scenes/**：每个分镜的原始素材（视频/图片）
  - 命名 \`scene-N.mp4\` 或 \`scene-N.jpg\`，N 按顺序
- **shot-list.csv**：分镜清单表格，含时长、关键词、文案内容
- **preview.mp4**：AI 自动合成的预览视频（就是你在千山 AI 里看到的那版）

## 推荐工作流（剪映专业版）

1. 打开剪映 → 新建项目
2. 拖入 \`audio.mp3\` 到音频轨
3. 拖入 \`subtitles.srt\` 到字幕轨
4. 按 \`shot-list.csv\` 的时间顺序，把 \`scenes/\` 里的原视频放到视频轨
5. **重点**：把不满意的 AI 素材替换成你自己拍的或下载的素材
6. 加自己想要的转场、特效、BGM
7. 导出

## 为什么需要这个

AI 能帮你做到：拆分镜 + 搜通用素材 + TTS 配音 + 生成字幕。
AI 做不到：理解文案深层情感、匹配你账号风格、提供真人出镜素材。

草稿包让你"60% 的体力活让 AI 干，40% 的创意活你来"。

生成时间：${new Date().toISOString()}
分镜数：${scenes.length}
总时长：${row.duration || '?'} 秒
分辨率：${row.resolution || '?'}
`;
        return new Promise((resolve, reject) => {
            const output = fs_1.default.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', () => resolve(zipPath));
            output.on('error', reject);
            archive.on('error', reject);
            archive.pipe(output);
            // 1. 音频：优先 merged.mp3（copy concat，无重编码漂移），回落到 audio/seg-*.mp3
            const merged = path_1.default.join(assetDir, 'merged.mp3');
            if (fs_1.default.existsSync(merged)) {
                archive.file(merged, { name: 'audio.mp3' });
            }
            // 也附一份 TTS 分段（方便用户单独替换某段）
            const audioSegDir = path_1.default.join(assetDir, 'audio');
            if (fs_1.default.existsSync(audioSegDir)) {
                archive.directory(audioSegDir, 'audio-segments');
            }
            // 2. 字幕
            if (row.srtPath && fs_1.default.existsSync(row.srtPath)) {
                archive.file(row.srtPath, { name: 'subtitles.srt' });
            }
            const assPath = path_1.default.join(assetDir, 'subtitles.ass');
            if (fs_1.default.existsSync(assPath))
                archive.file(assPath, { name: 'subtitles.ass' });
            // 3. 原始分镜素材（图/视频）
            // 缓存目录里的 vid-xxx.mp4 / img-xxx.jpg 按 scene 顺序改名
            for (let i = 0; i < scenes.length; i++) {
                const s = scenes[i];
                // 用户上传的本地文件
                if (s.imagePath && fs_1.default.existsSync(s.imagePath)) {
                    const ext = path_1.default.extname(s.imagePath);
                    archive.file(s.imagePath, { name: `scenes/scene-${s.index}${ext}` });
                    continue;
                }
                // 缓存里的文件：videoUrl 下载的 vid-xxx.mp4 / imageUrl 下载的 img-xxx.jpg
                // 我们没记下载后的路径映射；只能按 index 匹配 normalized/scene-N.mp4
                const normalized = path_1.default.join(assetDir, 'normalized', `scene-${i + 1}.mp4`);
                if (fs_1.default.existsSync(normalized)) {
                    archive.file(normalized, { name: `scenes/scene-${s.index}.mp4` });
                }
            }
            // 4. 分镜清单
            archive.append(shotList, { name: 'shot-list.csv' });
            // 5. README
            archive.append(readme, { name: 'README.md' });
            // 6. 预览视频
            if (row.outputPath && fs_1.default.existsSync(row.outputPath)) {
                archive.file(row.outputPath, { name: 'preview.mp4' });
            }
            archive.finalize();
        });
    }
    safeParseJson(raw) {
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /**
     * 列音色 — **按云端 voice 默认配置的 modelName 过滤**:
     *   - 云端 modelName 以 'MiniMax/' 开头 → 只返 MiniMax 音色(走 multimodal-generation/generation 端点)
     *   - 否则(cosyvoice / 空 / 其他)→ 只返百炼 cosyvoice 音色 + 用户克隆
     *   - 云端完全没配 → 返全部(给用户先看到东西)
     *
     * 这样用户在 qianshanai 切默认 voice 配置的 modelName → 30s 后桌面端音色下拉自动跟着变。
     * (MiniMax 也走百炼 sk-xxx 鉴权,所以 providerCode 都是 aliyun_dashscope,只能看 modelName 区分。)
     */
    async listVoices() {
        // 走档位系统:Settings 档位下拉切了哪条 cloud config,这里就跟着切
        let cloudModelName;
        let hasCloudConfig = false;
        try {
            const r = await llm_tier_config_1.llmTierConfig.resolveCategory('voice');
            if (r?.cloudId) {
                hasCloudConfig = true;
                cloudModelName = r.model;
                logger_1.logger.info(`[listVoices] 档位 voice cloudId=${r.cloudId} provider=${r.providerCode} modelName=${cloudModelName}`);
            }
            else {
                logger_1.logger.info(`[listVoices] 档位未解析到 voice 配置`);
            }
        }
        catch (err) {
            logger_1.logger.warn(`[listVoices] 档位解析异常: ${String(err)}`);
        }
        const isMiniMax = !!cloudModelName && cloudModelName.startsWith('MiniMax/');
        const presets = exports.VOICES
            .filter((v) => {
            if (!hasCloudConfig)
                return true; // 云端没配 → 全部显示
            if (isMiniMax)
                return !!v.minimaxVoice; // MiniMax 模式:只显示带 minimaxVoice 的
            return !v.minimaxVoice; // cosyvoice 模式:只显示不带 minimaxVoice 的
        })
            .map((v) => ({
            id: v.id,
            label: v.label,
            gender: v.gender,
            category: v.category || 'other',
            provider: v.provider,
        }));
        // 拼上用户克隆的自定义音色(category='custom' 让前端能在下拉里单独分组)
        // 按 targetModel 区分:MiniMax 模式只列 'MiniMax/*' 克隆;cosyvoice 模式只列 'cosyvoice-*' 克隆
        const allCustom = db_1.db
            .select()
            .from(schema_1.customVoices)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.customVoices.createdAt))
            .all();
        const custom = allCustom
            .filter((r) => {
            const isMiniMaxClone = (r.targetModel || '').startsWith('MiniMax/');
            if (!hasCloudConfig)
                return true; // 云端没配:全部显示
            return isMiniMax ? isMiniMaxClone : !isMiniMaxClone;
        })
            .map((r) => ({
            id: r.voiceId,
            label: `${r.name} · 我的克隆音色`,
            gender: 'unknown',
            category: 'custom',
            provider: 'dashscope',
        }));
        return [...presets, ...custom];
    }
    /** 生成指定音色的试听音频（5 秒，磁盘缓存） */
    async previewVoice(voiceId, rate, pitch) {
        const voice = voiceById(voiceId);
        if (!voice)
            throw new Error(`音色 ${voiceId} 不存在`);
        const previewText = '大家好，今天给大家分享一个很有意思的故事，请耐心听完。';
        const cacheDir = (0, paths_1.dataDir)('tts-preview');
        const key = `${voiceId}-${rate || 'r0'}-${pitch || 'p0'}`.replace(/[^a-z0-9\-]/gi, '_');
        const outPath = path_1.default.join(cacheDir, `preview-${key}.mp3`);
        if (fs_1.default.existsSync(outPath))
            return outPath;
        if (config_1.USE_MOCK) {
            fs_1.default.writeFileSync(outPath, `# Mock preview ${voiceId}`);
            return outPath;
        }
        await dispatchTTS(voice, previewText, outPath, rate, pitch);
        return outPath;
    }
    /**
     * 声音克隆 — 按云端当前 voice 配置的 modelName 分发:
     *   - modelName 以 'MiniMax/' 开头 → 走 MiniMax voice_clone(同一百炼 sk-xxx,不同端点 schema)
     *     • 目标 model = 用户云端选的(如 MiniMax/speech-2.8-hd)
     *     • voice_id 由我们自己生成提交,API 不返回新 id
     *   - 否则 → 走 cosyvoice 复刻(原逻辑不变)
     *     • 目标 model = cosyvoice-v3.5-plus
     *     • voice_id 由百炼生成返回
     *
     * 返回新音色的 voice_id(前端可立刻在音色下拉里选用)。
     * 注意:克隆完成后克隆音色出现在哪个下拉里,由 listVoices 按 modelName 过滤决定 —
     * MiniMax 模式下只看到 MiniMax 克隆 + MiniMax 预设,cosyvoice 模式下反之。
     */
    async cloneCustomVoice(input) {
        if (!fs_1.default.existsSync(input.audioPath)) {
            throw new Error(`音频文件不存在: ${input.audioPath}`);
        }
        // prefix:用音色名做前缀(拼到 voice_id 里方便识别),百炼/MiniMax 都要小写字母+数字
        const prefix = input.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'voice';
        // 1) 上传音频 → 拿百炼内部 oss:// URL(cosyvoice 和 MiniMax 都走百炼平台,oss:// 都吃)
        const ossUrl = await (0, dashscope_file_upload_1.uploadFileToDashscope)(input.audioPath, 'voice-enrollment');
        // 2) 看档位系统选的 voice cloud config 的 modelName 决定走哪条
        //    (用户在 Settings/视频工坊档位下拉切 cloud:{id} 后,这里跟着切)
        let cloudModelName = '';
        let cloudApiKey = '';
        const resolved = await getVoiceCloudResolved();
        if (resolved.ok) {
            cloudModelName = resolved.modelName || '';
            cloudApiKey = resolved.apiKey;
        }
        let voiceId;
        let targetModel;
        if (cloudModelName.startsWith('MiniMax/')) {
            // ─── MiniMax 克隆路径 ───
            if (!cloudApiKey) {
                throw new Error('未配置百炼 voice key,请到 qianshanai.cn 配置');
            }
            voiceId = await (0, tts_minimax_clone_1.createMiniMaxCloneVoice)({
                audioUrl: ossUrl,
                prefix,
                refText: input.refText,
                apiKey: cloudApiKey,
                model: cloudModelName,
            });
            targetModel = cloudModelName; // 'MiniMax/speech-2.8-hd' 等
            logger_1.logger.info(`[OneClick] MiniMax cloned: ${input.name} → ${voiceId} model=${targetModel}`);
        }
        else {
            // ─── cosyvoice 克隆路径(原逻辑)───
            voiceId = await (0, tts_clone_1.createCloneVoice)(ossUrl, prefix);
            targetModel = tts_clone_1.CLONE_TARGET_MODEL; // 'cosyvoice-v3.5-plus'
            logger_1.logger.info(`[OneClick] cosyvoice cloned: ${input.name} → ${voiceId} model=${targetModel}`);
        }
        // 3) 入库 — targetModel 字段是后续分发的关键(voiceById 看这个判断走 MiniMax 还是 cosyvoice 端点)
        const [row] = await db_1.db
            .insert(schema_1.customVoices)
            .values({
            name: input.name,
            voiceId,
            targetModel,
            refText: input.refText,
            audioPath: input.audioPath,
            uploadUrl: ossUrl,
        })
            .returning();
        return { id: String(row.id), voiceId, name: input.name };
    }
    /** 列出 DB 里所有自定义音色（前端"自定义音色"区域 + 下拉合并展示） */
    listCustomVoices() {
        const rows = db_1.db
            .select()
            .from(schema_1.customVoices)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.customVoices.createdAt))
            .all();
        // 字段名贴合老前端约定（id / name / uri / sampleText / createdAt）
        // - uri 直接给 voice_id（前端选中后传回 /one-click/generate 时也用这个）
        return rows.map((r) => ({
            id: r.voiceId, // 用 voice_id 当 id，方便前端"已选音色"和 voiceById 对齐
            name: r.name,
            uri: r.voiceId,
            sampleText: r.refText || '',
            createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
        }));
    }
    /** 删除自定义音色:DB 删 + 同步通知百炼/MiniMax 端删除(远端失败不阻塞本地删除)*/
    async removeCustomVoice(id) {
        // id 可能是 DB 主键数字,也可能是 voice_id 字符串(前端两种用法都见过)
        const numId = Number(id);
        const [row] = Number.isFinite(numId)
            ? db_1.db.select().from(schema_1.customVoices).where((0, drizzle_orm_1.eq)(schema_1.customVoices.id, numId)).all()
            : db_1.db.select().from(schema_1.customVoices).where((0, drizzle_orm_1.eq)(schema_1.customVoices.voiceId, id)).all();
        if (!row)
            return { ok: true }; // 已经不在了,幂等
        const isMiniMaxClone = (row.targetModel || '').startsWith('MiniMax/');
        try {
            if (isMiniMaxClone) {
                // MiniMax 克隆 → 走 multimodal-generation/generation 端点的 delete_voice action
                // 用档位系统当前 voice 配置的 key(跟创建时同一把)
                const resolved = await getVoiceCloudResolved();
                if (resolved.ok && resolved.apiKey) {
                    await (0, tts_minimax_clone_1.deleteMiniMaxCloneVoice)({
                        voiceId: row.voiceId,
                        apiKey: resolved.apiKey,
                        model: row.targetModel,
                    });
                }
            }
            else {
                // cosyvoice 克隆 → 原 customization 端点
                await (0, tts_clone_1.deleteCloneVoice)(row.voiceId);
            }
        }
        catch (err) {
            logger_1.logger.warn(`[OneClick] remote delete_voice 失败但本地删除继续: ${String(err)}`);
        }
        db_1.db.delete(schema_1.customVoices).where((0, drizzle_orm_1.eq)(schema_1.customVoices.id, row.id)).run();
        return { ok: true };
    }
    listSubtitleStyles() {
        return exports.SUBTITLE_STYLES.map((s) => ({ id: s.id, label: s.label }));
    }
    /**
     * 语音就绪预检 —— 前端在点"生成视频"前调用。
     *
     * 解析当前 voice 档位 + 解密 key,跟 dispatchTTS 的判定逻辑完全同源:
     * 这里返回 ready=false 就意味着合成时必然降级 Edge 机械音。
     * 前端据此当场拦截提示(去配置 / 仍用免费音色),而不是让用户
     * 等几分钟拿到一条机械音成片才发现配置有问题。
     *
     * 只读缓存解析,不实际调 TTS 端点 —— 零计费、毫秒级返回。
     */
    /**
     * 语音就绪预检 — 不只查"key 拿得到",还用当前音色**真实合成 4 个字**做探活:
     * key 改错 / model 名不存在 / MiniMax 未开通 / 克隆音色失效…全在这一步暴露,
     * 不会等用户合成完整片才发现是机械音。
     * 成本:4 字 ≈ ¥0.0001(cosyvoice)/ ¥0.0014(MiniMax);探活成功缓存 5 分钟不重复扣费。
     * @param voiceId 前端当前选中的音色 id — 探活用跟真实合成完全相同的 voice+model 组合
     */
    async checkVoiceReadiness(voiceId) {
        if (config_1.USE_MOCK) {
            return { ready: true, engine: 'cosyvoice', model: 'mock' };
        }
        const resolved = await getVoiceCloudResolved();
        if (!resolved.ok) {
            return { ready: false, engine: 'edge', reason: resolved.reason, message: resolved.message };
        }
        const voice = voiceById(voiceId || exports.VOICES[0].id);
        // 跟 dispatchTTS 同款的 model 优先级:克隆音色自带 model > 云端配的 modelName
        const effectiveModel = voice.model || resolved.modelName || '';
        const engine = effectiveModel.startsWith('MiniMax/')
            ? 'minimax'
            : 'cosyvoice';
        const modelLabel = effectiveModel || 'cosyvoice-v3-flash(默认)';
        // 探活成功缓存:同一 (cloud配置 + model + 音色) 5 分钟内成功过就不重复合成
        const cacheKey = `${resolved.cloudId}|${effectiveModel}|${voice.id}`;
        if (voiceProbeOkCache &&
            voiceProbeOkCache.key === cacheKey &&
            Date.now() - voiceProbeOkCache.at < 5 * 60_000) {
            return { ready: true, engine, model: modelLabel };
        }
        const probeDir = ensureDataDir('one-click-cache', 'voice-probe');
        const probePath = path_1.default.join(probeDir, `probe-${Date.now()}.mp3`);
        try {
            if (engine === 'minimax') {
                const minimaxVoiceId = voice.minimaxVoice;
                if (!minimaxVoiceId) {
                    return {
                        ready: false,
                        engine: 'edge',
                        reason: 'probe-failed',
                        model: modelLabel,
                        message: `当前音色「${voice.label}」不支持 MiniMax 模式(云端 model=${effectiveModel}),请换一个支持的音色`,
                    };
                }
                await (0, tts_minimax_1.synthesizeMiniMaxToMp3)({
                    voice: minimaxVoiceId,
                    text: '语音测试',
                    outPath: probePath,
                    speed: 1,
                    pitch: 0,
                    apiKey: resolved.apiKey,
                    model: effectiveModel,
                    baseUrl: resolved.baseUrl,
                });
            }
            else {
                await (0, tts_dashscope_1.synthesizeDashScopeToMp3)({
                    voice: voice.dashscopeVoice,
                    text: '语音测试',
                    outPath: probePath,
                    speed: 1,
                    pitch: 1,
                    apiKey: resolved.apiKey,
                    ...(effectiveModel ? { model: effectiveModel } : {}),
                });
            }
            voiceProbeOkCache = { key: cacheKey, at: Date.now() };
            return { ready: true, engine, model: modelLabel };
        }
        catch (err) {
            const raw = String(err?.message || err).slice(0, 200);
            logger_1.logger.warn(`[Voice] 预检探活失败(${engine} ${modelLabel}): ${raw}`);
            // 作废缓存的明文 key:用户多半正在网页端改 key,不作废的话改对了
            // 也要等 5 分钟缓存过期(或重启)才生效 —— 作废后下次点合成立刻回源拉新 key
            (0, cloud_llm_config_1.invalidateDecryptedKey)(resolved.cloudId);
            return {
                ready: false,
                engine: 'edge',
                reason: 'probe-failed',
                model: modelLabel,
                message: `云端语音实际调用失败:${raw}`,
            };
        }
        finally {
            try {
                if (fs_1.default.existsSync(probePath))
                    fs_1.default.unlinkSync(probePath);
            }
            catch {
                /* noop */
            }
        }
    }
}
exports.OneClickService = OneClickService;
exports.oneClick = new OneClickService();
//# sourceMappingURL=one-click.js.map