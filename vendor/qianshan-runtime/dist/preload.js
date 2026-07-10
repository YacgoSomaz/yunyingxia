"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 文件选择对话框
    selectFile: (options) => electron_1.ipcRenderer.invoke('dialog:selectFile', options),
    // 多文件选择
    selectFiles: (options) => electron_1.ipcRenderer.invoke('dialog:selectFiles', options),
    // 文件夹选择（可选 defaultPath / title）
    selectFolder: (options) => electron_1.ipcRenderer.invoke('dialog:selectFolder', options),
    // 探测剪映/CapCut 本地素材缓存路径
    detectJianyingAudioDir: () => electron_1.ipcRenderer.invoke('jianying:detectAudioDir'),
    // 保存文件对话框
    saveFile: (options) => electron_1.ipcRenderer.invoke('dialog:saveFile', options),
    // 获取应用信息
    getAppInfo: () => electron_1.ipcRenderer.invoke('app:info'),
    // 在系统默认程序打开（主进程有 URL 白名单校验）
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:openExternal', url),
    // 在资源管理器/访达里定位到某个本地文件（仅限应用数据目录）
    showItemInFolder: (filePath) => electron_1.ipcRenderer.invoke('shell:showItemInFolder', filePath),
    // 扫码登录：打开对应平台扫码窗，等用户完成
    publisherLogin: (accountId) => electron_1.ipcRenderer.invoke('publisher:login', accountId),
    // 授权:启动校验 / 登出
    auth: {
        getCachedPhone: () => electron_1.ipcRenderer.invoke('auth:getCachedPhone'),
        login: (phone) => electron_1.ipcRenderer.invoke('auth:login', phone),
        logout: () => electron_1.ipcRenderer.invoke('auth:logout'),
        getMemberInfo: () => electron_1.ipcRenderer.invoke('auth:getMemberInfo'),
    },
    // 自动更新：订阅事件 + 主动检查 + 立即安装
    update: {
        checkNow: () => electron_1.ipcRenderer.invoke('update:check'),
        installNow: () => electron_1.ipcRenderer.invoke('update:install'),
        onChecking: (cb) => {
            const h = () => cb();
            electron_1.ipcRenderer.on('update:checking', h);
            return () => electron_1.ipcRenderer.off('update:checking', h);
        },
        onAvailable: (cb) => {
            const h = (_e, info) => cb(info);
            electron_1.ipcRenderer.on('update:available', h);
            return () => electron_1.ipcRenderer.off('update:available', h);
        },
        onNotAvailable: (cb) => {
            const h = (_e, info) => cb(info);
            electron_1.ipcRenderer.on('update:not-available', h);
            return () => electron_1.ipcRenderer.off('update:not-available', h);
        },
        onProgress: (cb) => {
            const h = (_e, p) => cb(p);
            electron_1.ipcRenderer.on('update:progress', h);
            return () => electron_1.ipcRenderer.off('update:progress', h);
        },
        onDownloaded: (cb) => {
            const h = (_e, info) => cb(info);
            electron_1.ipcRenderer.on('update:downloaded', h);
            return () => electron_1.ipcRenderer.off('update:downloaded', h);
        },
        onError: (cb) => {
            const h = (_e, info) => cb(info);
            electron_1.ipcRenderer.on('update:error', h);
            return () => electron_1.ipcRenderer.off('update:error', h);
        },
    },
});
//# sourceMappingURL=preload.js.map