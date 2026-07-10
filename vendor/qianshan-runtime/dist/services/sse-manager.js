"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSEManager = void 0;
exports.createSSE = createSSE;
class SSEManager {
    res;
    closed = false;
    constructor(res) {
        this.res = res;
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        // 处理客户端主动断开
        res.on('close', () => {
            this.closed = true;
        });
    }
    /** 发送进度事件 */
    sendProgress(step, progress) {
        this.send({ type: 'progress', step, progress });
    }
    /** 发送流式文本块 */
    sendChunk(content) {
        this.send({ type: 'chunk', content });
    }
    /** 发送完成事件 */
    sendDone(data) {
        this.send({ type: 'done', data });
        if (!this.closed)
            this.res.end();
    }
    /** 发送错误事件 */
    sendError(error) {
        this.send({ type: 'error', error });
        if (!this.closed)
            this.res.end();
    }
    send(data) {
        if (this.closed)
            return;
        this.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}
exports.SSEManager = SSEManager;
function createSSE(res) {
    return new SSEManager(res);
}
//# sourceMappingURL=sse-manager.js.map