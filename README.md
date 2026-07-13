# 万山自媒体

万山自媒体是一套本地优先的 AI 自媒体桌面工作台，目标是复刻并延续原千山自媒体的核心体验，把选题、文案、提示词模板、视频处理、平台数据和更新授权集中到一个 Windows 客户端中。

当前商业版最新版本：`0.1.9`

远端仓库：<https://github.com/YacgoSomaz/qianshanzimeiti>

## 核心能力

- 选题雷达：聚合公开热点和创作者选题入口，支持收藏、筛选和 AI 角度生成。
- 文案工坊：生成标题、正文、短视频口播稿、平台适配稿和风格化改写。
- 提示词模板：迁移原千山内置模板和风格预设，避免下拉菜单空缺。
- 视频工坊：复用原千山运行时中的一键生成、视频生成和媒体处理能力。
- 平台数据：允许可信第三方平台的公开数据和登录态数据接入，不做绝对离线。
- 商业授权：使用远端卡密、设备绑定、Ed25519 签名授权包、本地安全缓存和 10 分钟授权刷新。
- 国内更新：客户端读取 `latest.json`，安装包支持 HTTPS 下载和 SHA512 校验。

## 关键产品码

远端授权后台同时服务多个软件，产品码必须严格隔离：

| 软件 | product_code | 卡密前缀 | 策略 |
| --- | --- | --- | --- |
| 万山自媒体 | `wanshan_zimeiti` | `WSZ-` | 空策略 `{}` |
| 万山漫剧 | `wanshan_media` | `WSM-` | 空策略 `{}` |
| 直播复盘侠 | `live_replay_xia` | `LRX-` | 直播监听/水印策略 |

万山自媒体客户端只接受 `product_code=wanshan_zimeiti` 的授权包。不能再使用 `wanshan_media`，否则会和万山漫剧卡密互通。

授权公钥：

```text
YYHkNVmcsiWjoYweNOa7CEBP3WGRyBbB6Cf3_qvQchc
```

公钥可以公开，只用于客户端验签；服务端私钥不能进入仓库、安装包或客户端。

## 项目结构

```text
electron/                         Electron 主进程、授权、完整性校验、更新器
src/                              React 本地壳，用于开发态 UI
vendor/qianshan-runtime/          复用原千山运行时、后端服务和渲染器构建产物
resources/bin/                    ffmpeg、ffprobe、yt-dlp 等媒体二进制
packaging/build/                  商业包构建、asar 打包、完整性清单签名
packaging/installer/              Inno Setup 安装器脚本
scripts/                          Playwright/Electron 自动测试和提示词抓取工具
tests/                            Vitest 单元/构建/授权/更新测试
release/                          安装包和更新清单，exe 使用 Git LFS
docs/AI_HANDOFF.md                给后续 AI/Fork 的快速接手说明
CHANGELOG.md                      版本变更记录
```

## 本地开发

```powershell
npm install
npm install --prefix .runtime-electron electron@30.5.1
npm run build
npm start
```

测试：

```powershell
npm test
```

仅本地演示时启用 Mock：

```powershell
$env:WANSHAN_USE_MOCK = '1'
npm start
```

默认不启用 Mock，真实数据模式会访问公开热点、可信平台接口、用户主动登录的平台数据和用户配置的 AI 服务。

文案工坊真实生成需要可用的 OpenAI 兼容 LLM Key。优先在客户端“设置/环境体检”里的“万山本地模型配置”填写：

```text
Provider: local_deepseek
Base URL: https://api.deepseek.com/v1
Model: deepseek-v4-flash
API Key: 用户自己的 DeepSeek 或 OpenAI 兼容 Key
```

本地模型配置保存到用户数据目录，API Key 使用 Electron `safeStorage` 加密保存，界面只显示脱敏状态。保存后文案工坊会优先使用本地模型；未配置本地模型时才兼容千山云端配置和环境变量。

中转站适配：客户需要使用中转站时，选择“自定义中转站”，填写中转站给出的 Base URL、模型/接入点 ID 和对应 API Key。这里不做厂商白名单限制，也不强制 HTTPS，按客户实际中转站配置走。

开发时也支持从环境变量临时注入：

```powershell
$env:LLM_API_KEY = "<你的 key>"
$env:LLM_BASE_URL = "https://api.example.com/v1"
$env:LLM_MODEL = "gpt-4o-mini"
npm start
```

也可使用 `OPENAI_API_KEY`、`DASHSCOPE_API_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY`、`ARK_API_KEY`。未配置真实 Key 且 `WANSHAN_USE_MOCK` 不是 `1` 时，文案工坊会明确报错，不再返回离线示例文案。

图片搜索同样不再在真实模式下伪造 mock 结果；需要配置 `PEXELS_API_KEY` 或 `UNSPLASH_ACCESS_KEY`，否则会提示缺少图源 Key。

数字人供应商在客户端“设置/AI 模型”里的“数字人供应商配置”中设置：

- 阿里万相 `wan2.2-s2v`：填写本地阿里百炼 API Key。
- 百度曦灵照片数字人：填写本地 AppID/AppKey，可选择 `turbo_v2` 或 `quality_v2`。

数字人 Key 只保存在用户本机数据目录，使用 Electron `safeStorage` 加密；未配置对应供应商 Key 时，一键成片会跳过或报出明确配置错误。

## 商业版构建

商业版会：

- 写入 `commercial-config.json`
- 注入授权服务器、公钥、产品码和更新源
- 清理源码、测试、`.map`、`.env`、数据库、密钥、C/C++ 源码和 `src/` 目录
- 生成并签名 `integrity_manifest.json`
- 打包 `app.asar`
- 生成 Inno Setup 安装包
- 生成 `latest.json` 和 `latest.yml`

构建命令示例：

```powershell
pwsh -File packaging\build\build_release.ps1 `
  -Version 0.1.9 `
  -Commercial `
  -LicenseServerUrl "https://license.runmo.art" `
  -ProductCode "wanshan_zimeiti" `
  -UpdateFeedUrl "https://license.runmo.art/wanshan-media/updates/latest.json" `
  -UpdateAssetBaseUrl "" `
  -IntegrityPrivateKeyPath "C:\Users\q2414\.wanshan\wanshan-integrity-private.pem" `
  -LicensePublicKey "YYHkNVmcsiWjoYweNOa7CEBP3WGRyBbB6Cf3_qvQchc"
```

当前发布产物：

```text
release/WanshanMediaSetup_0.1.9.exe
SHA256: 07B4106C7E2C5ABD493C3DA4E3DD648E6E46E0E283F2EBE1AA095D96576F9F19
Size: 173,038,533 bytes
```

线上更新源：

```text
https://license.runmo.art/wanshan-media/updates/latest.json
https://license.runmo.art/wanshan-media/updates/WanshanMediaSetup_0.1.9.exe
```

当前安装包暂时托管在授权服务器。正式大量分发建议将安装包迁移到腾讯云 COS、阿里云 OSS 或国内 CDN，再用 `-UpdateAssetBaseUrl` 写入正式下载地址，避免 3M VPS 承载大文件下载。

## 授权安全要点

- 服务端返回 `license.payload + license.signature` 的 Ed25519 签名信封。
- 客户端只内置公钥，不内置私钥。
- 客户端验签后校验 `product_code`、设备哈希、到期时间、功能权限和策略。
- 显式过期卡密到期即失效，不额外加离线宽限。
- 客户端启动时主动刷新授权，运行中约 10 分钟刷新一次。
- 后台冻结、过期、解绑或禁用后，客户端收到明确拒绝会清除本地授权缓存。
- 网络临时失败才允许在签名宽限期内继续使用。
- `safeStorage` 只保护本地缓存门槛，不保存后台管理员 token、服务端私钥或 API Key。
- `asar` 不是加密，只是打包；核心安全依靠服务端授权、签名验签、完整性校验和发布目录清理。

## 数据与隐私

- 用户数据、Cookie、数据库、日志和授权缓存放在 `%LOCALAPPDATA%\WanshanMedia\data`，不放安装目录。
- 安装包不应包含 `.env`、私钥、开发文档、测试文件、源码映射、数据库、日志或用户数据。
- 对外网络访问主要包括授权服务器、更新源、公开热点/平台数据、用户主动配置的 AI API。
- LLM Key 不进入仓库、安装包、README、更新日志或完整性清单，只存在用户本机数据目录。
- 自定义中转站会接收用户提示词和生成内容，销售/交付时按客户自己的中转站配置说明交付。
- 第三方平台网页登录态由用户自己控制，不由万山自媒体托管。

## 交接入口

后续 AI 或开发者接手前，优先阅读：

1. `docs/AI_HANDOFF.md`
2. `CHANGELOG.md`
3. `electron/license-service.ts`
4. `electron/commercial-config.ts`
5. `packaging/build/build_release.ps1`
6. `vendor/qianshan-runtime/dist/routes/one-click.js`
7. `vendor/qianshan-runtime/dist/services/one-click.js`
