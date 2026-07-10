"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const topic_1 = __importDefault(require("./topic"));
const copywriting_1 = __importDefault(require("./copywriting"));
const video_1 = __importDefault(require("./video"));
const one_click_1 = __importDefault(require("./one-click"));
const distribute_1 = __importDefault(require("./distribute"));
const llm_1 = __importDefault(require("./llm"));
const style_1 = __importDefault(require("./style"));
const scheduler_1 = __importDefault(require("./scheduler"));
const analytics_1 = __importDefault(require("./analytics"));
const system_1 = __importDefault(require("./system"));
const audit_1 = __importDefault(require("./audit"));
const video_rewrite_1 = __importDefault(require("./video-rewrite"));
const dashboard_1 = __importDefault(require("./dashboard"));
const avatar_1 = __importDefault(require("./avatar"));
const digital_human_1 = __importDefault(require("./digital-human"));
function registerRoutes(app) {
    app.use('/api/topic', topic_1.default);
    app.use('/api/copywriting', copywriting_1.default);
    app.use('/api/video', video_1.default);
    app.use('/api/one-click', one_click_1.default);
    app.use('/api/distribute', distribute_1.default);
    app.use('/api/llm', llm_1.default);
    app.use('/api/style', style_1.default);
    app.use('/api/scheduler', scheduler_1.default);
    app.use('/api/analytics', analytics_1.default);
    app.use('/api/system', system_1.default);
    app.use('/api/audit', audit_1.default);
    app.use('/api/video-rewrite', video_rewrite_1.default);
    app.use('/api/dashboard', dashboard_1.default);
    app.use('/api/avatar', avatar_1.default);
    app.use('/api/digital-human', digital_human_1.default);
}
//# sourceMappingURL=index.js.map