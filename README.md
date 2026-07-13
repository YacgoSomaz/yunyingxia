# 万山自媒体

万山自媒体是一套本地优先的 AI 自媒体桌面工作台，目标是复刻并延续原千山自媒体的核心体验，把选题、文案、提示词模板、视频处理、平台数据和更新授权集中到一个 Windows 客户端中。

当前商业版最新版本：`0.1.8`

远端仓库：<https://github.com/YacgoSomaz/qianshanzimeiti>

## 核心能力

- 选题雷达：聚合公开热点和创作者选题入口，支持收藏、筛选和 AI 角度生成。
- 文案工坊：生成标题、正文、短视频口播稿、平台适配稿和风格化改写。
- 提示词模板：迁移原千山内置模板和风格预设，避免下拉菜单空缺。
- 视频工坊：复用原千山运行时中的一键生成、视频生成和媒体处理能力。
- 平台数据：允许可信第三方平台的公开数据和登录态数据接入，不做绝对离线。
- 商业授权：使用远端卡密、设备绑定、Ed25519 签名授权包、本地安全缓存和 60 秒授权刷新。
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
  -Version 0.1.8 `
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
release/WanshanMediaSetup_0.1.8.exe
SHA256: 24629D909C429B91B675E22F0C2091F45610B1BA6FF72083D0F22F0E6A851763
Size: 173,035,100 bytes
```

线上更新源：

```text
https://license.runmo.art/wanshan-media/updates/latest.json
https://license.runmo.art/wanshan-media/updates/WanshanMediaSetup_0.1.8.exe
```

当前安装包暂时托管在授权服务器。正式大量分发建议将安装包迁移到腾讯云 COS、阿里云 OSS 或国内 CDN，再用 `-UpdateAssetBaseUrl` 写入正式下载地址，避免 3M VPS 承载大文件下载。

## 授权安全要点

- 服务端返回 `license.payload + license.signature` 的 Ed25519 签名信封。
- 客户端只内置公钥，不内置私钥。
- 客户端验签后校验 `product_code`、设备哈希、到期时间、功能权限和策略。
- 显式过期卡密到期即失效，不额外加离线宽限。
- 客户端启动时主动刷新授权，运行中约 60 秒刷新一次。
- 后台冻结、过期、解绑或禁用后，客户端收到明确拒绝会清除本地授权缓存。
- 网络临时失败才允许在签名宽限期内继续使用。
- `safeStorage` 只保护本地缓存门槛，不保存后台管理员 token、服务端私钥或 API Key。
- `asar` 不是加密，只是打包；核心安全依靠服务端授权、签名验签、完整性校验和发布目录清理。

## 数据与隐私

- 用户数据、Cookie、数据库、日志和授权缓存放在 `%LOCALAPPDATA%\WanshanMedia\data`，不放安装目录。
- 安装包不应包含 `.env`、私钥、开发文档、测试文件、源码映射、数据库、日志或用户数据。
- 对外网络访问主要包括授权服务器、更新源、公开热点/平台数据、用户主动配置的 AI API。
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
