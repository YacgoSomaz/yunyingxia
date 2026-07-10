"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ══════════════════════════════════════════════════════════════════════
//  /api/llm/* —— 完全云端化版本
//
//  本地 llm_keys 表已彻底废弃,所有 key/baseUrl 都走云端 user_llm_config。
//  下面 routes 只保留三类:
//    ① 基础对话 / 信息(/chat, /chat-stream, /info)
//    ② 场景路由 + 档位(/routing*, /scene-labels, /tier/*)
//    ③ 云端配置同步(/cloud-refresh, /cloud-status)
//
//  老的 /providers /key /test /ollama/status 等本地凭据相关端点全部删了。
//  调试用的 probe-raw / dry-run / test-* 也删了(灵芽侧本来就有 playground)。
// ══════════════════════════════════════════════════════════════════════
const express_1 = require("express");
const llm_1 = require("../services/llm");
const llm_config_1 = require("../services/llm-config");
const llm_tier_config_1 = require("../services/llm-tier-config");
const llm_tiers_1 = require("../services/llm-tiers");
const sse_manager_1 = require("../services/sse-manager");
const cloud_llm_config_1 = require("../services/cloud-llm-config");
const license_1 = require("../services/license");
const router = (0, express_1.Router)();
const ok = (data) => ({ success: true, data });
const fail = (err) => ({ success: false, error: String(err?.message || err) });
// ─────────────────────────────────────────────────────────
// 基础对话
// ─────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    try {
        const { systemPrompt, userPrompt } = req.body;
        const text = await llm_1.llm.complete(systemPrompt || 'You are a helpful assistant.', userPrompt);
        res.json(ok({ text }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/chat-stream', async (req, res) => {
    const sse = new sse_manager_1.SSEManager(res);
    try {
        const { systemPrompt, userPrompt } = req.body;
        const full = await llm_1.llm.chatStream({
            messages: [
                { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: userPrompt },
            ],
        }, (chunk) => sse.sendChunk(chunk.content));
        sse.sendDone({ text: full });
    }
    catch (err) {
        sse.sendError(String(err));
    }
});
/** 给前端 Header badge 用 */
router.get('/info', (_req, res) => {
    try {
        res.json(ok(llm_1.llm.infoSummary()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─────────────────────────────────────────────────────────
// 场景路由(给档位/Settings 用)
// ─────────────────────────────────────────────────────────
router.get('/routing', async (_req, res) => {
    try {
        res.json(ok(await llm_config_1.llmConfig.listRouting()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/routing', async (req, res) => {
    try {
        const entries = Array.isArray(req.body) ? req.body : req.body?.entries || [];
        await llm_config_1.llmConfig.setRouting(entries);
        res.json(ok({ updated: entries.length }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/routing/reset', async (_req, res) => {
    try {
        await llm_config_1.llmConfig.resetRoutingToDefaults();
        res.json(ok({ reset: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/scene-labels', (_req, res) => {
    res.json(ok(llm_config_1.SCENE_LABELS));
});
// ─────────────────────────────────────────────────────────
// 档位系统
// ─────────────────────────────────────────────────────────
router.get('/tier/config', async (_req, res) => {
    try {
        res.json(ok(await llm_tier_config_1.llmTierConfig.getFullConfigForUI()));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/tier/set', async (req, res) => {
    try {
        const { category, tier } = req.body;
        if (!category || !tier)
            throw new Error('category/tier required');
        await llm_tier_config_1.llmTierConfig.setTier(category, tier);
        res.json(ok({ updated: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/tier/reset', async (_req, res) => {
    try {
        await llm_tier_config_1.llmTierConfig.resetToDefaults();
        res.json(ok({ reset: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/tier/slots', async (req, res) => {
    try {
        const cat = req.query.category;
        res.json(ok(await llm_tier_config_1.llmTierConfig.listCustomSlots(cat)));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.post('/tier/slots', async (req, res) => {
    try {
        const { category, provider, label, modelId } = req.body;
        if (!category || !provider || !label || !modelId)
            throw new Error('缺少字段');
        const slot = await llm_tier_config_1.llmTierConfig.createCustomSlot({ category, provider, label, modelId });
        res.json(ok(slot));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.delete('/tier/slots/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await llm_tier_config_1.llmTierConfig.deleteCustomSlot(id);
        res.json(ok({ removed: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
router.get('/tier/meta', (_req, res) => {
    res.json(ok({ categoryLabels: llm_tiers_1.CATEGORY_LABELS, tierLabels: llm_tiers_1.TIER_LABELS }));
});
/** 语音 (cosyvoice) 探针 */
async function probeVoiceModel() {
    try {
        const cloud = await (0, cloud_llm_config_1.getCloudDefault)('voice', 'aliyun_dashscope');
        if (!cloud?.apiKey) {
            return { listed: false, probe: 'skip', error: '云端未配置 voice 类百炼 key' };
        }
        const { synthesizeDashScopeToMp3 } = require('../services/tts-dashscope');
        const path = require('path');
        const os = require('os');
        const fs = require('fs');
        const tmpDir = path.join(os.tmpdir(), 'qianshan-voice-probe');
        fs.mkdirSync(tmpDir, { recursive: true });
        const out = path.join(tmpDir, `probe-${Date.now()}.mp3`);
        // 用 cosyvoice-v3-flash + longanhuan(底层默认),保证 model/voice 兼容
        await synthesizeDashScopeToMp3({ voice: 'longanhuan', text: '你好', outPath: out, apiKey: cloud.apiKey });
        try {
            fs.unlinkSync(out);
        }
        catch { /* swallow */ }
        return { listed: true, probe: 'ok' };
    }
    catch (err) {
        return { listed: null, probe: 'fail', error: String(err?.message || err).slice(0, 200) };
    }
}
/** 通用探针:针对一个 (category, model) 查云端某条配置能不能跑通 */
async function probeOneModel(category, model) {
    if (category === 'voice')
        return await probeVoiceModel();
    // 拿对应 type 的默认云端配置
    const cloudType = category === 'image' ? 'image' : category === 'video' ? 'video' : 'llm';
    const cloud = await (0, cloud_llm_config_1.getCloudDefault)(cloudType);
    if (!cloud?.apiKey) {
        return { listed: false, probe: 'skip', error: `云端未配置 ${cloudType} 类 key` };
    }
    const baseUrl = cloud.baseUrl || '';
    const apiKey = cloud.apiKey;
    const providerCode = cloud.providerCode;
    // 视频:成本太高,实测探针都跳过(用户实际生成时再验证)
    if (category === 'video') {
        return {
            listed: null,
            probe: 'skip',
            error: '视频探针成本较高,已跳过(实际生成时即知)',
            providerCode,
            baseUrl,
        };
    }
    // 图片探针 — 必须按 providerCode 分协议(各家 endpoint / 协议都不一样)
    if (category === 'image') {
        const trimmed = (baseUrl || '').replace(/\/+$/, '');
        try {
            // ── 速创(wuyinkeji):POST /api/async/image_gpt 提交,看是否拿到 task_id 即可 ──
            // 这一探针会在速创那边真起一个任务(成本大概 ¥0.x),但不轮询/不下载,任务自己跑完没人收。
            if (providerCode === 'wuyinkeji') {
                const r = await fetch(`${trimmed}/api/async/image_gpt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: apiKey }, // 不带 Bearer
                    body: JSON.stringify({ prompt: 'a white dot', size: '1:1' }),
                    signal: AbortSignal.timeout(30000),
                });
                if (!r.ok) {
                    return { listed: null, probe: 'fail', error: `HTTP ${r.status}`, providerCode, baseUrl };
                }
                const text = await r.text();
                let json;
                try {
                    json = JSON.parse(text);
                }
                catch {
                    return { listed: null, probe: 'fail', error: '响应非 JSON', providerCode, baseUrl };
                }
                const code = json?.code;
                if (code !== 0 && code !== 200) {
                    return { listed: null, probe: 'fail', error: `code=${code} msg=${json?.msg}`, providerCode, baseUrl };
                }
                const tid = json?.data?.id || json?.data?.task_id || json?.task_id || json?.id;
                if (!tid) {
                    return { listed: null, probe: 'fail', error: '未返回 task_id', providerCode, baseUrl };
                }
                return { listed: null, probe: 'ok', providerCode, baseUrl };
            }
            // ── 柏拉图(bltcy):POST /v1/images/generations?async=true 提交看 task_id ──
            if (providerCode === 'bltcy') {
                const cleanBase = trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
                const r = await fetch(`${cleanBase}/v1/images/generations?async=true`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify({ model, prompt: 'a white dot', size: '1024x1024', n: 1 }),
                    signal: AbortSignal.timeout(30000),
                });
                if (!r.ok) {
                    return { listed: null, probe: 'fail', error: `HTTP ${r.status}`, providerCode, baseUrl };
                }
                const text = await r.text();
                let json;
                try {
                    json = JSON.parse(text);
                }
                catch {
                    return { listed: null, probe: 'fail', error: '响应非 JSON', providerCode, baseUrl };
                }
                const tid = json?.task_id || json?.data?.task_id;
                if (!tid) {
                    return { listed: null, probe: 'fail', error: '未返回 task_id', providerCode, baseUrl };
                }
                return { listed: null, probe: 'ok', providerCode, baseUrl };
            }
            // ── Cool(coolapis):POST /v1/cool/generate 提交看 task_id ──
            if (providerCode === 'cool') {
                const cleanBase = trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
                const r = await fetch(`${cleanBase}/v1/cool/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify({ prompt: 'a white dot', model, ratio: '1:1' }),
                    signal: AbortSignal.timeout(30000),
                });
                if (!r.ok) {
                    return { listed: null, probe: 'fail', error: `HTTP ${r.status}`, providerCode, baseUrl };
                }
                const text = await r.text();
                let json;
                try {
                    json = JSON.parse(text);
                }
                catch {
                    return { listed: null, probe: 'fail', error: '响应非 JSON', providerCode, baseUrl };
                }
                const tid = json?.task_id || json?.data?.task_id;
                if (!tid) {
                    return { listed: null, probe: 'fail', error: '未返回 task_id', providerCode, baseUrl };
                }
                return { listed: null, probe: 'ok', providerCode, baseUrl };
            }
            // ── 阿里云百炼(aliyun_dashscope):成本太高,跳过 ──
            if (providerCode === 'aliyun_dashscope') {
                return { listed: null, probe: 'skip', error: '百炼图像异步任务成本较高,已跳过实测探针', providerCode, baseUrl };
            }
            // ── 默认 OpenAI-compat (lingya / geek 等):/v1/images/generations ──
            // baseUrl 末尾若没 /v1,补一下
            const compatBase = /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
            const r = await fetch(`${compatBase}/images/generations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({ model, prompt: 'a white dot', n: 1, size: '1024x1024' }),
                signal: AbortSignal.timeout(30000),
            });
            if (r.ok)
                return { listed: null, probe: 'ok', providerCode, baseUrl };
            const body = await r.text();
            let msg = `HTTP ${r.status}`;
            try {
                msg = JSON.parse(body).error?.message || msg;
            }
            catch { /* keep msg */ }
            return { listed: null, probe: 'fail', error: msg, providerCode, baseUrl };
        }
        catch (e) {
            return { listed: null, probe: 'fail', error: e.message || String(e), providerCode, baseUrl };
        }
    }
    // 其它(text-fast / text-long):chat/completions 探一次 — 同样按需补 /v1
    const trimmedBase = (baseUrl || '').replace(/\/+$/, '');
    const compatBase = /\/v\d+$/.test(trimmedBase) ? trimmedBase : `${trimmedBase}/v1`;
    try {
        const r = await fetch(`${compatBase}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 }),
            signal: AbortSignal.timeout(15000),
        });
        if (r.ok)
            return { listed: null, probe: 'ok', providerCode, baseUrl };
        const body = await r.text();
        let msg = `HTTP ${r.status}`;
        try {
            msg = JSON.parse(body).error?.message || msg;
        }
        catch { /* keep msg */ }
        return { listed: null, probe: 'fail', error: msg, providerCode, baseUrl };
    }
    catch (e) {
        return { listed: null, probe: 'fail', error: e.message || String(e), providerCode, baseUrl };
    }
}
/** 一次性测所有 category 的当前选中模型 */
router.post('/tier/probe-connectivity', async (_req, res) => {
    try {
        const uiConfig = await llm_tier_config_1.llmTierConfig.getFullConfigForUI();
        const results = [];
        for (const cat of uiConfig.categories) {
            const opt = cat.tierOptions.find((o) => o.value === cat.currentTier);
            if (!opt?.modelId)
                continue;
            const outcome = await probeOneModel(cat.category, opt.modelId);
            results.push({ category: cat.category, model: opt.modelId, tier: cat.currentTier, ...outcome });
        }
        res.json(ok({ results }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** 单测一个 model(切档位之后立即测) */
router.post('/tier/probe-one', async (req, res) => {
    try {
        const category = String(req.body?.category || '').trim();
        const model = String(req.body?.model || '').trim();
        if (!category || !model) {
            return res.status(400).json(fail(new Error('category/model required')));
        }
        const t0 = Date.now();
        const outcome = await probeOneModel(category, model);
        res.json(ok({ category, model, elapsedMs: Date.now() - t0, ...outcome }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
// ─────────────────────────────────────────────────────────
// 云端配置同步
// ─────────────────────────────────────────────────────────
/** 强制重拉云端 + 重灌 routing(用户在网页改完不想等 30s 缓存过期) */
router.post('/cloud-refresh', async (_req, res) => {
    try {
        (0, cloud_llm_config_1.clearCloudCache)();
        await llm_tier_config_1.llmTierConfig.syncRoutingTable();
        res.json(ok({ ok: true }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
/** Settings banner 用:看下用户云端配了几条 */
router.get('/cloud-status', async (_req, res) => {
    try {
        const m = (0, license_1.getMemberInfo)();
        const hasToken = !!m?.accessToken;
        if (!hasToken) {
            return res.json(ok({ hasToken: false, configs: {}, manageUrl: 'https://qianshanai.cn/user/llm-configs' }));
        }
        const [llmList, imgList, vidList, voiceList] = await Promise.all([
            (0, cloud_llm_config_1.getCloudConfigs)('llm').catch(() => null),
            (0, cloud_llm_config_1.getCloudConfigs)('image').catch(() => null),
            (0, cloud_llm_config_1.getCloudConfigs)('video').catch(() => null),
            (0, cloud_llm_config_1.getCloudConfigs)('voice').catch(() => null),
        ]);
        res.json(ok({
            hasToken: true,
            configs: {
                llm: llmList?.configs.length || 0,
                image: imgList?.configs.length || 0,
                video: vidList?.configs.length || 0,
                voice: voiceList?.configs.length || 0,
            },
            manageUrl: 'https://qianshanai.cn/user/llm-configs',
        }));
    }
    catch (err) {
        res.status(500).json(fail(err));
    }
});
exports.default = router;
//# sourceMappingURL=llm.js.map