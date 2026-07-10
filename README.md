# 万山自媒体

万山自媒体是一个 Windows Electron 自媒体工作台，复用原项目的前端运行时，并保留本地 API、文案工坊、视频工坊、分发中心、选题雷达和数据看板等功能。

## 快速开始

要求：Windows、Node.js 20+。

```powershell
npm install

# 首次运行时准备与 better-sqlite3 匹配的 Electron 30.5.1
npm install --prefix .runtime-electron electron@30.5.1

npm run build
npm start
```

应用启动后会打开 Electron 窗口，内部本地 API 默认监听 `127.0.0.1:19832`。

## 测试与构建

```powershell
npm test
npm run build
```

## 数据模式

默认是真实数据模式：

- 百度、微博、知乎、B 站使用公开数据源。
- 抖音、快手、视频号需要在“分发中心”登录对应创作者账号后抓取登录态数据。
- 小红书 PC 热点入口受平台限制；没有可用 LLM 配置时不会伪造离线数据。
- 数据源不可用时，界面会显示具体原因，不会把离线示例当成实时数据。

仅在本地演示时显式启用 Mock：

```powershell
$env:WANSHAN_USE_MOCK = '1'
npm start
```

正常使用时不要设置 `WANSHAN_USE_MOCK=1`。

## 项目结构

```text
electron/                       Electron 主进程、IPC、凭据与工作流服务
src/                            项目自有 React 壳层
shared/                         前后端共享类型
tests/                          Vitest 测试
vendor/qianshan-runtime/dist/   复用的后端编译运行时
vendor/qianshan-runtime/renderer/ 复用的原始前端编译产物
vendor/qianshan-runtime/drizzle/   数据库迁移
docs/                           设计、规格与实施记录
```

## 安全说明

本仓库不提交 `node_modules`、Electron 本地运行时、构建产物、截图、`.env`、证书和本地数据库。API Key、平台登录态和账号数据应只保存在本机配置或运行时用户目录中，不要写入 Git。

## 当前状态

- GitHub：<https://github.com/YacgoSomaz/qianshanzimeiti>
- 分支：`main`
- 真实模式默认开启
- 登录鉴权和自动更新桥接未暴露到当前 Electron 前端
