"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockLLMClient = void 0;
const base_client_1 = require("./base-client");
/**
 * MockLLMClient — 离线/演示模式使用，完全不发真实网络请求。
 *
 * 根据 user prompt 中的关键词（模板 key、"JSON"、字段名）启发式地返回
 * 合理的 mock 响应，保证上层业务代码无需分支即可跑通全流程。
 */
class MockLLMClient extends base_client_1.BaseLLMClient {
    constructor() {
        super({
            provider: 'mock',
            apiKey: '',
            model: 'mock-v1',
            baseUrl: 'mock://local',
        });
    }
    async chat(options) {
        const userMsg = options.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
        const sysMsg = options.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const content = this.buildMockContent(userMsg, sysMsg);
        // 模拟少量延迟
        await new Promise((r) => setTimeout(r, 200));
        return {
            content,
            usage: { promptTokens: 100, completionTokens: content.length, totalTokens: 100 + content.length },
            model: this.config.model,
            finishReason: 'stop',
        };
    }
    async chatStream(options, onChunk) {
        const userMsg = options.messages
            .filter((m) => m.role === 'user')
            .map((m) => m.content)
            .join('\n');
        const sysMsg = options.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n');
        const content = this.buildMockContent(userMsg, sysMsg);
        // 模拟流式输出：按字切分，每 30ms 推一个字
        let full = '';
        for (const ch of content) {
            full += ch;
            onChunk({ content: ch, isFinished: false });
            await new Promise((r) => setTimeout(r, 15));
        }
        onChunk({ content: '', isFinished: true });
        return full;
    }
    // ─── 根据输入提示返回合理的 mock 内容 ───
    buildMockContent(userMsg, sysMsg) {
        const txt = (userMsg + '\n' + sysMsg).toLowerCase();
        // 选题分析 JSON
        if (userMsg.includes('角度') && userMsg.includes('JSON')) {
            return JSON.stringify({
                angles: [
                    { title: '热点深度剖析', description: '从行业背景切入，讲清楚来龙去脉', difficulty: 'medium' },
                    { title: '亲历者故事', description: '采访/分享真实体验，易引起共鸣', difficulty: 'easy' },
                    { title: '反差对比', description: '与常见认知形成反差，制造记忆点', difficulty: 'medium' },
                    { title: '实操教学', description: '变成工具型内容，用户可直接上手', difficulty: 'hard' },
                ],
                target_audience: '18-35岁对该话题有关注度的泛人群',
                competition_level: 'medium',
                score: 78,
            });
        }
        // 大纲 JSON
        if (userMsg.includes('大纲') && (userMsg.includes('JSON') || userMsg.includes('scene_id'))) {
            return JSON.stringify([
                { scene_id: 1, title: '开场钩子', duration_hint: '3-5s', key_points: ['一个反常识观点', '提出悬念'] },
                { scene_id: 2, title: '核心内容', duration_hint: '20-30s', key_points: ['要点 1', '要点 2', '要点 3'] },
                { scene_id: 3, title: '案例佐证', duration_hint: '15-20s', key_points: ['真实案例', '数据支撑'] },
                { scene_id: 4, title: '结尾引导', duration_hint: '5-8s', key_points: ['总结', '号召互动'] },
            ]);
        }
        // 字幕 JSON
        if (userMsg.includes('字幕') && userMsg.includes('JSON')) {
            return JSON.stringify([
                { start: 0.0, end: 3.5, text: '嗨大家好，今天我们来聊一个有趣的话题' },
                { start: 3.5, end: 8.0, text: '你知道吗，90% 的人其实都忽略了这件事' },
                { start: 8.0, end: 13.0, text: '接下来我会用三个要点帮你快速理解' },
                { start: 13.0, end: 18.0, text: '看完记得点赞收藏哦' },
            ]);
        }
        // 标题候选 JSON
        if (userMsg.includes('备选标题') || (userMsg.includes('标题') && userMsg.includes('JSON'))) {
            return JSON.stringify([
                { title: '震惊！原来 90% 的人都搞错了', style: 'suspense' },
                { title: '3 分钟看懂：7 个关键点一次讲透', style: 'number' },
                { title: '你真的了解它吗？一文讲清全部真相', style: 'question' },
                { title: '我花了 5 年才明白的事', style: 'story' },
                { title: '他做到了，你为什么还没开始？', style: 'contrast' },
                { title: '专家推荐的 5 个核心方法', style: 'authority' },
                { title: '✨ 干货 | 新手必看的核心指南 🚀', style: 'emoji' },
                { title: '最近爆火的话题，一起来看看', style: 'trending' },
            ]);
        }
        // 视频场景扩写 JSON
        if (userMsg.includes('画面描述') && userMsg.includes('JSON')) {
            return JSON.stringify([
                { scene: 1, description: '特写镜头：产品缓慢旋转展示细节，暖色灯光', duration: 3 },
                { scene: 2, description: '中景：用户正在使用产品，表情愉悦', duration: 5 },
                { scene: 3, description: '全景：产品放在典型使用场景中，环境氛围感强', duration: 4 },
            ]);
        }
        // 发布时间建议 JSON
        if (userMsg.includes('发布时间') && userMsg.includes('JSON')) {
            return JSON.stringify([
                { time: '12:00', day: 'weekday', reason: '午休流量高峰', confidence: 0.82 },
                { time: '19:30', day: 'daily', reason: '晚间黄金时段', confidence: 0.91 },
                { time: '22:00', day: 'weekend', reason: '周末深夜活跃用户多', confidence: 0.75 },
            ]);
        }
        // 图文成片口播
        if (userMsg.includes('图片描述') && userMsg.includes('JSON')) {
            return JSON.stringify([
                { image_index: 0, narration: '第一张图片，展示了整体的氛围与主题', duration: 4 },
                { image_index: 1, narration: '第二张图片，聚焦在核心细节上', duration: 4 },
                { image_index: 2, narration: '最后一张，给你一个完整的故事闭环', duration: 5 },
            ]);
        }
        // 英文翻译
        if (sysMsg.toLowerCase().includes('translator') || txt.includes('output english')) {
            return 'A cinematic close-up of the product slowly rotating under warm lighting, highlighting its elegant details with a smooth depth-of-field shift.';
        }
        // 平台适配：直接返回一段平台感强的文本
        if (userMsg.includes('适配到') || userMsg.includes('目标平台')) {
            return '【平台适配版】\n· 钩子前置：一句话点题，留住用户前 3 秒\n· 核心内容：要点清晰、节奏紧凑、贴合平台语感\n· 互动引导：结尾抛出一个小问题邀请评论\n#干货 #日常分享 #一起来看';
        }
        // 视频洗稿
        if (userMsg.includes('洗稿') || userMsg.includes('改写')) {
            return '开头先抛一个反直觉观点，让观众好奇。接着用三个层次递进讲清楚核心观点，中间穿插真实的生活化例子。结尾落在"其实你也可以做到"这类自我激励式的总结，顺势引导互动。';
        }
        // 场景扩写（纯文本）
        if (userMsg.includes('口播文案') || userMsg.includes('场景')) {
            return '你有没有发现，最近这件事简直刷屏了？别急，我用 30 秒告诉你它到底在说什么。核心就三点：第一，背景其实不简单；第二，真正值得注意的是这个细节；第三，最关键的结论留到最后。';
        }
        // 润色
        if (userMsg.includes('润色')) {
            return '（润色版）语言更自然、节奏更顺畅，保留原意的同时让整体表达更像日常口语，便于拍摄时朗读。';
        }
        // 测试连通
        if (userMsg.includes('正常工作')) {
            return 'Mock LLM 运行正常，可用于离线演示和开发。';
        }
        // 默认回复
        return '这是 Mock LLM 的默认回复，开启 USE_MOCK=1 时所有 LLM 调用都由本地模拟返回，便于无 Key 环境下跑通全流程。';
    }
}
exports.MockLLMClient = MockLLMClient;
//# sourceMappingURL=mock-client.js.map