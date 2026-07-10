"use strict";
/**
 * 文案语境检测：判断内容是否属于中国语境，用于决定素材检索时是否追加 "chinese" 修饰词。
 *
 * 纯规则匹配，命中任一类关键词即认为是中国语境。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLocale = detectLocale;
exports.describeLocale = describeLocale;
// ─── 词表（按类别组织，命中 >= 2 条即可判定） ───
// 中国平台/APP/品牌
const CN_PLATFORMS = [
    '抖音', '快手', '小红书', '微博', '微信', 'B站', 'b站', '哔哩哔哩', '知乎',
    '视频号', '公众号', '朋友圈', '美团', '饿了么', '滴滴', '支付宝', '淘宝', '天猫',
    '京东', '拼多多', '闲鱼', '得物', '网易云', 'QQ音乐', '喜马拉雅',
];
// 中国城市 / 地标（高频）
const CN_CITIES = [
    '北京', '上海', '广州', '深圳', '成都', '重庆', '杭州', '武汉', '西安', '南京',
    '苏州', '天津', '长沙', '青岛', '厦门', '大连', '沈阳', '哈尔滨', '郑州', '济南',
    '合肥', '福州', '昆明', '贵阳', '兰州', '长春', '石家庄', '乌鲁木齐',
    '外滩', '长城', '故宫', '天安门', '颐和园', '西湖', '黄山', '泰山', '九寨沟',
    '东方明珠', '陆家嘴', '中关村', '国贸', '三里屯', '后海', '南锣鼓巷',
];
// 中国饮食/文化/节日
const CN_CULTURE = [
    '春节', '春晚', '国庆', '中秋', '端午', '元宵', '清明', '重阳',
    '双十一', '618', '双11', '双12', '年会', '红包',
    '火锅', '麻辣烫', '煎饼', '包子', '饺子', '小笼包', '烧烤', '串串',
    '米粉', '炒饭', '炒面', '豆浆', '油条', '馒头', '粥',
    '奶茶', '瑞幸', '喜茶', '茶颜悦色', '霸王茶姬', '古茗',
    '汉服', '旗袍', '书法', '国画', '京剧', '相声',
    '高考', '考研', '双一流', '985', '211',
];
// 中国特色职业/场景
const CN_LIFE = [
    '外卖小哥', '外卖员', '快递小哥', '网红', '主播', '带货', '直播间', '博主',
    '程序员', '码农', '大厂', '打工人', '小镇做题家', '二本', '打工',
    '鸡娃', '双减', '内卷', '躺平', '佛系', '社畜',
    '地铁', '高铁', '动车', '绿皮火车', '春运', '抢票',
    '菜市场', '胡同', '弄堂', '城中村', '出租屋', '筒子楼', '小区',
];
// 国外典型地标/品牌（反向特征，命中则倾向于 international）
const INTL_MARKERS = [
    '埃菲尔铁塔', '纽约', '洛杉矶', '旧金山', '硅谷', '华尔街', '伦敦', '巴黎',
    '东京', '大阪', '首尔', '悉尼', '迪拜', '莫斯科', '柏林', '罗马',
    '好莱坞', '白宫', '自由女神', '大本钟', '富士山', '秋叶原',
    // 国外品牌/公司
    '苹果', 'Apple', 'Google', 'Facebook', 'Meta', 'Twitter', 'Netflix', 'Tesla',
    '马斯克', '贝索斯', '扎克伯格', '乔布斯', 'McDonald', '麦当劳', 'Starbucks', '星巴克',
];
function countHits(text, words) {
    let n = 0;
    for (const w of words) {
        if (text.includes(w))
            n += 1;
    }
    return n;
}
/**
 * 检测文本语境。
 *
 * 阈值策略（避免噪声误判）：
 *   - 中文命中 >= 2，或单独命中强信号（抖音/春晚/微信等）即判 chinese
 *   - 国际命中比中文命中多 1 条以上判 international
 *   - 否则 unknown（调用方可自行决定默认）
 */
function detectLocale(text) {
    if (!text || text.trim().length < 5)
        return 'unknown';
    const cnPlat = countHits(text, CN_PLATFORMS);
    const cnCity = countHits(text, CN_CITIES);
    const cnCult = countHits(text, CN_CULTURE);
    const cnLife = countHits(text, CN_LIFE);
    const cnTotal = cnPlat + cnCity + cnCult + cnLife;
    const intl = countHits(text, INTL_MARKERS);
    // 强信号：只要出现中国平台就基本是 chinese 语境
    if (cnPlat >= 1 && intl < 2)
        return 'chinese';
    // 聚合判断
    if (cnTotal >= 2 && cnTotal >= intl)
        return 'chinese';
    if (intl >= 2 && intl > cnTotal)
        return 'international';
    if (cnTotal >= 1 && intl === 0)
        return 'chinese';
    return 'unknown';
}
/** 供 LLM prompt 拼接用：给出人类可读的语境描述 */
function describeLocale(loc) {
    switch (loc) {
        case 'chinese':
            return '中国语境（人物、场景、元素均应为中式）';
        case 'international':
            return '国际语境（欧美/日韩场景）';
        default:
            return '通用语境（按内容判断）';
    }
}
//# sourceMappingURL=locale-detect.js.map