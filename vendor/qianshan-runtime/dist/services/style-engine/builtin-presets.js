"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_PRESETS = void 0;
exports.BUILTIN_PRESETS = [
    // ── 文案风格 ──
    {
        name: '轻松口语',
        description: '像朋友聊天一样自然，适合日常分享类内容',
        module: 'copywriting',
        config: {
            tone: '轻松活泼',
            audience: '年轻人',
            wordStyle: '口语化、多用短句',
            pacing: '快',
            hooks: '疑问式开头',
        },
    },
    {
        name: '专业知识',
        description: '有深度有干货，适合教程和知识分享',
        module: 'copywriting',
        config: {
            tone: '专业但不晦涩',
            audience: '学习型用户',
            wordStyle: '书面语与口语混合',
            pacing: '中',
            hooks: '数据引入',
        },
    },
    {
        name: '幽默搞笑',
        description: '趣味性强，适合娱乐向内容',
        module: 'copywriting',
        config: {
            tone: '幽默诙谐',
            audience: '泛娱乐受众',
            wordStyle: '调侃语气、多用比喻',
            pacing: '快',
            hooks: '反转式开头',
        },
    },
    {
        name: '种草推荐',
        description: '真诚推荐风，适合产品测评',
        module: 'copywriting',
        config: {
            tone: '真诚热情',
            audience: '消费者',
            wordStyle: '感受描述、多用形容词',
            pacing: '中',
            hooks: '痛点引入',
        },
    },
    // ── 视频风格 ──
    {
        name: '产品广告',
        description: '简洁有力的广告风格',
        module: 'video',
        config: { tone: '简洁有力', pacing: '快节奏', visual: '特写+全景交替' },
    },
    {
        name: '故事叙述',
        description: '娓娓道来型叙事',
        module: 'video',
        config: { tone: '温暖治愈', pacing: '中速', visual: '镜头平稳过渡' },
    },
    // ── 封面风格 ──
    {
        name: '字大醒目',
        description: '报刊式大字标题，抓眼球',
        module: 'cover',
        config: { layout: 'big-text-center', fontSize: 'xl', colorScheme: 'contrast' },
    },
    {
        name: '精致图文',
        description: '精美背景+巧妙排版',
        module: 'cover',
        config: { layout: 'image-with-overlay', fontSize: 'md', colorScheme: 'warm' },
    },
    // ── 视觉风格（画面风格模板，用于 AI 图片/视频生成） ──
    {
        name: '电影写实',
        description: '电影感写实摄影，自然光，高质感。保留现有风格，适合知识/观点/故事类',
        module: 'visual',
        config: {
            baseStyle: '电影感写实摄影，自然光',
            emotionVariants: {
                excited: '，电影感写实摄影，自然光，暖色调高对比，动态构图，极致细节，无文字，无屏幕',
                serious: '，电影感写实摄影，自然光，冷色调低饱和，沉稳构图，极致细节，无文字，无屏幕',
                cheerful: '，电影感写实摄影，自然光，暖黄色调中等饱和，轻盈构图，极致细节，无文字，无屏幕',
                dramatic: '，电影感写实摄影，自然光，强明暗对比，紧张构图，极致细节，无文字，无屏幕',
                calm: '，电影感写实摄影，自然光，莫兰迪色调低对比，平稳构图，极致细节，无文字，无屏幕',
                humorous: '，电影感写实摄影，自然光，明亮饱和色调，明快构图，极致细节，无文字，无屏幕',
            },
            negativePrompt: 'low quality, blurry, deformed, extra fingers, bad hands, bad anatomy, watermark, ' +
                '(glowing brain:1.5), (matrix code rain:1.5), (floating money:1.4), (neon glow:1.3), ' +
                '(cartoon:1.4), (3d render:1.3), (plastic texture:1.3), (distorted text:1.5), ' +
                'screen UI, phone screen, computer screen, oversaturated, rainbow color',
            llmStyleRule: '所有画面：电影感写实摄影，自然光，无文字，无屏幕界面。' +
                '描述画面时优先描述物体材质（皮革、玻璃、皮肤、混凝土），而非光影特效。',
            fixedSuffix: '，极致细节，无文字，无屏幕',
        },
    },
    {
        name: '日系清新',
        description: '柔光胶片质感，淡雅色调，治愈系氛围。适合生活/旅行/美食/情感类',
        module: 'visual',
        config: {
            baseStyle: '日系清新胶片摄影，柔光',
            emotionVariants: {
                excited: '，日系清新胶片，柔光，暖色调适中饱和，轻快构图，胶片颗粒感，无文字，无屏幕',
                serious: '，日系清新胶片，柔光，低饱和冷灰调，安静构图，胶片颗粒感，无文字，无屏幕',
                cheerful: '，日系清新胶片，柔光，暖黄绿色调清新饱和，空灵构图，胶片颗粒感，无文字，无屏幕',
                dramatic: '，日系清新胶片，侧光，青蓝色调低饱和，留白构图，胶片颗粒感，无文字，无屏幕',
                calm: '，日系清新胶片，柔光，莫兰迪色系低饱和，平稳构图，胶片颗粒感，无文字，无屏幕',
                humorous: '，日系清新胶片，柔光，明亮粉黄色调，俏皮构图，胶片颗粒感，无文字，无屏幕',
            },
            negativePrompt: 'low quality, blurry, deformed, extra fingers, bad anatomy, watermark, ' +
                '(dark shadows:1.3), (high contrast:1.3), (neon:1.4), (dramatic lighting:1.3), ' +
                'harsh light, oversaturated, horror, gore',
            llmStyleRule: '所有画面：日系清新胶片风格，柔和自然光，淡雅低饱和色调，胶片颗粒质感。' +
                '优先描述环境氛围（光线、空气感、植物、天空），人物姿态自然放松。' +
                '避免强对比、霓虹灯、黑暗场景。',
            fixedSuffix: '，胶片颗粒感，无文字，无屏幕',
        },
    },
    {
        name: '商业简约',
        description: '纯净背景，专业三点打光，产品质感。适合产品展示/电商带货/品牌宣传',
        module: 'visual',
        config: {
            baseStyle: '商业产品摄影，专业打光',
            emotionVariants: {
                excited: '，商业产品摄影，专业打光，明亮暖色调，动感构图，纯净背景，无文字，无屏幕',
                serious: '，商业产品摄影，专业打光，中性冷色调，稳重构图，纯净背景，无文字，无屏幕',
                cheerful: '，商业产品摄影，专业打光，明快暖黄色调，轻盈构图，纯净背景，无文字，无屏幕',
                dramatic: '，商业产品摄影，专业打光，强明暗对比，戏剧构图，纯净背景，无文字，无屏幕',
                calm: '，商业产品摄影，柔和打光，低饱和中性色调，极简构图，纯净背景，无文字，无屏幕',
                humorous: '，商业产品摄影，专业打光，明亮活泼色调，创意构图，纯净背景，无文字，无屏幕',
            },
            negativePrompt: 'low quality, blurry, deformed, watermark, cluttered background, messy, dirty, ' +
                '(cartoon:1.3), (anime:1.3), noise, grain, text overlay, ' +
                '(natural outdoor:1.2), forest, beach',
            llmStyleRule: '所有画面：商业级产品摄影风格，纯净背景（白/浅灰/渐变），专业三点打光。' +
                '优先描述产品材质细节（金属光泽、玻璃折射、织物纹理），构图简洁有序。' +
                '避免杂乱背景、过多装饰元素。',
            fixedSuffix: '，纯净背景，极致细节，无文字，无屏幕',
        },
    },
    {
        name: '赛博朋克',
        description: '霓虹灯光+暗色基底，未来科技感。适合科技/游戏/潮流/AI话题',
        module: 'visual',
        config: {
            baseStyle: '赛博朋克风格，霓虹灯光',
            emotionVariants: {
                excited: '，赛博朋克风格，霓虹灯光，高饱和暖霓虹色，动态构图，暗色基底，无文字，无屏幕',
                serious: '，赛博朋克风格，冷蓝霓虹，低饱和暗色调，沉稳构图，暗色基底，无文字，无屏幕',
                cheerful: '，赛博朋克风格，粉紫霓虹，中等饱和，活泼构图，暗色基底，无文字，无屏幕',
                dramatic: '，赛博朋克风格，红蓝霓虹交错，强对比明暗，紧张构图，暗色基底，无文字，无屏幕',
                calm: '，赛博朋克风格，柔和蓝紫霓虹，低对比，平稳构图，暗色基底，无文字，无屏幕',
                humorous: '，赛博朋克风格，多彩霓虹闪烁，明快构图，暗色基底，无文字，无屏幕',
            },
            negativePrompt: 'low quality, blurry, deformed, extra fingers, bad anatomy, watermark, ' +
                '(natural sunlight:1.3), (pastoral:1.3), (countryside:1.3), ' +
                'bright daylight, washed out, (watercolor:1.3)',
            llmStyleRule: '所有画面：赛博朋克风格，霓虹灯光+暗色基底，未来科技感。' +
                '优先描述光线效果（霓虹反射、全息投影、LED 灯带），场景倾向夜晚都市、科技空间。' +
                '人物可穿搭潮流/科技感服饰。避免田园、日光、古典风格。',
            fixedSuffix: '，暗色基底霓虹灯光，无文字，无屏幕',
        },
    },
    {
        name: '可爱插画',
        description: '动漫插画风格，明亮柔和色彩，Q版人物。适合萌宠/亲子/少女/轻松话题',
        module: 'visual',
        config: {
            baseStyle: '可爱插画风格，明亮色彩',
            emotionVariants: {
                excited: '，可爱插画风格，明亮色彩，高饱和暖色调，活泼构图，柔和阴影，无文字',
                serious: '，可爱插画风格，柔和色彩，低饱和冷色调，安静构图，柔和阴影，无文字',
                cheerful: '，可爱插画风格，明亮色彩，高饱和暖黄粉色调，轻松构图，柔和阴影，无文字',
                dramatic: '，可爱插画风格，对比色彩，中等饱和，夸张构图，柔和阴影，无文字',
                calm: '，可爱插画风格，柔和粉彩，低饱和莫兰迪色调，平稳构图，柔和阴影，无文字',
                humorous: '，可爱插画风格，鲜艳色彩，高饱和明快色调，夸张俏皮构图，柔和阴影，无文字',
            },
            negativePrompt: 'low quality, blurry, deformed, watermark, ' +
                '(realistic photo:1.5), (photography:1.4), harsh shadows, ' +
                'dark atmosphere, horror, gore, scary, blood',
            llmStyleRule: '所有画面：可爱插画/动漫风格，明亮柔和色彩，圆润线条。' +
                '人物造型 Q 版可爱，大眼睛、圆脸。场景色彩鲜明、元素简洁。' +
                '避免写实摄影、黑暗氛围、恐怖元素。可以使用小动物、星星、爱心等可爱装饰元素。',
            fixedSuffix: '，可爱插画风格，柔和阴影，无文字',
        },
    },
    {
        name: '手工微缩模型',
        description: '粘土/软陶定格动画质感，1:24 微缩比例。适合科普/解说/萌系叙事',
        module: 'visual',
        config: {
            baseStyle: '超写实微缩模型实拍质感，粘土/软陶手工模型纹理，电影级光影，定格动画风格',
            emotionVariants: {
                excited: '，超写实微缩模型实拍质感，粘土纹理，1:24微缩比例，暖色调高对比，定格动画运镜，8K超清，无卡通二次元',
                serious: '，超写实微缩模型实拍质感，粘土纹理，1:24微缩比例，冷色调低饱和，沉稳定格构图，8K超清，无卡通二次元',
                cheerful: '，超写实微缩模型实拍质感，软陶手工纹理，1:24微缩比例，暖黄色调中等饱和，轻盈定格构图，8K超清，无卡通二次元',
                dramatic: '，超写实微缩模型实拍质感，粘土纹理，侧逆光软质阴影，强对比电影色调，紧张定格构图，8K超清，无卡通二次元',
                calm: '，超写实微缩模型实拍质感，软陶纹理，1:24微缩比例，莫兰迪色调低对比，平稳定格构图，8K超清，无卡通二次元',
                humorous: '，超写实微缩模型实拍质感，粘土手工模型，1:24微缩比例，明亮饱和色调，俏皮定格构图，8K超清，无卡通二次元',
            },
            negativePrompt: 'low quality, blurry, deformed, watermark, (cartoon:1.5), (anime:1.5), ' +
                '(2d:1.4), (flat:1.3), digital painting, vector art, smooth plastic, ' +
                'oversaturated, neon glow',
            llmStyleRule: '所有画面：超写实微缩模型实拍质感，粘土/软陶手工模型纹理，1:24 微缩比例。' +
                '电影级光影：侧逆光、软质阴影、漫反射光影、电影级色彩分级。' +
                '场景：手工搭建场景、定格动画运镜（推拉/环绕）。' +
                '描述画面时优先描述手工模型的材质（哑光粘土、软陶毛边、微缩颗粒感）。' +
                '严禁卡通/二次元/数字绘画风格。',
            fixedSuffix: '，1:24微缩模型质感，定格动画运镜，8K超清，无卡通二次元',
        },
    },
    {
        name: '暗黑写实',
        description: 'ARRI Alexa 65 电影质感，暗调极简，全息数据面板。适合 AI/科技/严肃科普',
        module: 'visual',
        config: {
            baseStyle: '超仿真人实拍级暗色写实风，电影级 ARRI Alexa 65 画质，暗调极简密闭科技实验室',
            emotionVariants: {
                excited: '，电影级ARRI Alexa 65画质，暗调密闭科技实验室，全息AI数据面板悬浮，冷蓝数据流粒子环绕，侧逆光柔阴影，高对比暗调电影调色，缓慢环绕运镜，8K超清，无卡通二次元',
                serious: '，电影级ARRI Alexa 65画质，暗调极简实验室，悬浮神经网络结构图，低饱和冷调，侧逆光柔阴影，沉稳环绕运镜，克制高级科技氛围，8K超清，无卡通二次元',
                cheerful: '，电影级ARRI Alexa 65画质，暗调科技空间，淡蓝全息数据流，柔和侧光，中等对比电影调色，平稳运镜，8K超清，无卡通二次元',
                dramatic: '，电影级ARRI Alexa 65画质，暗调密闭空间，全息AI面板高亮发光，强明暗对比电影调色，紧张运镜，8K超清，无卡通二次元',
                calm: '，电影级ARRI Alexa 65画质，暗调极简实验室，半透明全息面板缓慢漂浮，低对比冷调，稳定运镜，克制氛围，8K超清，无卡通二次元',
                humorous: '，电影级ARRI Alexa 65画质，暗调科技空间，明快流动数据流粒子，中等饱和冷调，灵动运镜，8K超清，无卡通二次元',
            },
            negativePrompt: 'low quality, blurry, deformed, watermark, (cartoon:1.5), (anime:1.5), ' +
                '(bright daylight:1.3), (warm pastoral:1.3), oversaturated, harsh sun, ' +
                'distorted text, (matrix code rain:1.5), (glowing brain:1.5), neon graffiti',
            llmStyleRule: '所有画面：电影级 ARRI Alexa 65 暗色写实风，暗调极简密闭科技实验室场景。' +
                '中央可悬浮透明全息 AI 数据面板（神经网络结构图/流动代码流光），周围低饱和冷调数据流粒子。' +
                '光影：真实物理反射，侧逆光柔和阴影，高对比暗调电影调色。' +
                '运镜：稳定 + 缓慢环绕全息面板。' +
                '严禁卡通二次元、主播出镜、廉价 AI 意象（发光大脑/代码雨/金币）。',
            fixedSuffix: '，电影级ARRI Alexa 65暗调写实，全息数据面板，8K超清，无卡通二次元',
        },
    },
    {
        name: '全息科技商务',
        description: '冷蓝科技光效 + 浅景深散景。适合 AI 科技商务、知识科普、金融科技',
        module: 'visual',
        config: {
            baseStyle: '电影级 ARRI Alexa 65 写实质感，暗调未来科技风，全息数据元素，冷蓝色光效，浅景深',
            emotionVariants: {
                excited: '，电影级ARRI Alexa 65写实，暗调科技空间，冷蓝全息数据动态流动，浅景深散景，自然动态运镜，8K超清，无卡通二次元',
                serious: '，电影级ARRI Alexa 65写实，暗调未来科技风，冷蓝色光效柔和，浅景深散景，稳定运镜，商务科技氛围，8K超清，无卡通二次元',
                cheerful: '，电影级ARRI Alexa 65写实，暗调科技空间，明亮冷蓝光效，浅景深散景，灵动运镜，8K超清，无卡通二次元',
                dramatic: '，电影级ARRI Alexa 65写实，暗调密闭空间，强对比冷蓝光效，浅景深散景，紧张运镜，8K超清，无卡通二次元',
                calm: '，电影级ARRI Alexa 65写实，暗调极简科技空间，柔和冷蓝光效，浅景深散景，缓慢稳定运镜，8K超清，无卡通二次元',
                humorous: '，电影级ARRI Alexa 65写实，暗调科技空间，活泼冷蓝光效粒子，浅景深散景，灵动运镜，8K超清，无卡通二次元',
            },
            negativePrompt: 'low quality, blurry, deformed, watermark, (cartoon:1.5), (anime:1.5), ' +
                '(warm pastoral:1.3), (saturated:1.3), oversaturated, harsh sun, ' +
                '(matrix code rain:1.5), (glowing brain:1.4), neon graffiti',
            llmStyleRule: '所有画面：电影级 ARRI Alexa 65 写实质感，暗调未来科技风。' +
                '元素：全息数据、冷蓝色光效、浅景深虚化背景的散景。' +
                '运镜：稳定 + 自然动态过渡。' +
                '描述画面时优先描述材质（透明全息层、半透明数据流、玻璃反射、冷调金属）。' +
                '严禁卡通二次元、廉价 AI 意象、暖色田园、霓虹涂鸦。',
            fixedSuffix: '，冷蓝全息科技，浅景深散景，8K超清，无卡通二次元',
        },
    },
    {
        name: '极简高级科技',
        description: '冷灰主色 + 桌面悬浮淡蓝数据流，柔和自然光。适合 AI 干货 / 教程 / 通用科普',
        module: 'visual',
        config: {
            baseStyle: '极简高级科技写实风，未来科技办公空镜实景，冷灰高级主色调',
            emotionVariants: {
                excited: '，极简高级科技写实风，未来办公空镜，冷灰主色，桌面悬浮淡蓝数据流活跃，柔和自然光侧打，金属/玻璃反光，浅景深虚化，灵动推进运镜，8K超清，无卡通二次元',
                serious: '，极简高级科技写实风，未来办公空镜，冷灰高级主色，桌面悬浮淡蓝几何科技线条，柔和自然光侧光，金属/玻璃反光，浅景深虚化，稳定推进运镜，8K超清，无卡通二次元',
                cheerful: '，极简高级科技写实风，未来办公空镜，冷灰主色淡蓝点缀，桌面流光数据流，柔和自然光，金属/玻璃反光，浅景深虚化，缓慢推进运镜，8K超清，无卡通二次元',
                dramatic: '，极简高级科技写实风，未来办公空镜，冷灰主色，桌面悬浮淡蓝数据流强对比，柔和自然光低角度侧光，金属/玻璃强反光，浅景深虚化，紧凑推进运镜，8K超清，无卡通二次元',
                calm: '，极简高级科技写实风，未来办公空镜，冷灰主色，桌面静态几何科技线条，柔和散射自然光，金属/玻璃柔和反光，浅景深虚化，极缓推进运镜，8K超清，无卡通二次元',
                humorous: '，极简高级科技写实风，未来办公空镜，冷灰主色淡蓝点缀，桌面活泼数据流粒子，柔和自然光，金属/玻璃反光，浅景深虚化，俏皮推进运镜，8K超清，无卡通二次元',
            },
            negativePrompt: 'low quality, blurry, deformed, watermark, (cartoon:1.5), (anime:1.5), ' +
                '(warm pastoral:1.3), (cluttered:1.3), oversaturated, harsh sun, ' +
                'people, person, character, human face',
            llmStyleRule: '所有画面：极简高级科技写实风，未来科技办公空镜实景，冷灰高级主色调。' +
                '元素：桌面悬浮淡蓝色微光数据流 / 几何科技线条。' +
                '光影：柔和自然光侧打光，真实金属/玻璃材质反光，浅景深虚化背景。' +
                '运镜：缓慢推进，干净克制商务科技感。' +
                '严禁卡通二次元、人物出镜（专注空镜）、田园温暖色、杂乱元素。',
            fixedSuffix: '，极简高级科技空镜，冷灰主色，浅景深，8K超清，无卡通二次元',
        },
    },
];
//# sourceMappingURL=builtin-presets.js.map