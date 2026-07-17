# 运营虾

运营虾是一套本地优先的 AI 自媒体桌面工作台，目标是复刻并延续原千山自媒体的核心体验，把选题、文案、提示词模板、视频处理、平台数据和更新授权集中到一个 Windows 客户端中。

当前商业版最新版本：`0.1.24`

远端仓库：<https://github.com/YacgoSomaz/qianshanzimeiti>

## 核心能力

- 选题雷达：聚合公开热点和创作者选题入口，支持收藏、筛选和 AI 角度生成。
- 文案工坊：生成标题、正文、短视频口播稿、平台适配稿和风格化改写。
- 提示词模板：迁移原千山内置模板和风格预设，避免下拉菜单空缺。
- 视频工坊：复用原千山运行时中的一键生成、视频生成和媒体处理能力。
- 平台数据：允许可信第三方平台的公开数据和登录态数据接入，不做绝对离线。
- 商业账号：使用手机号短信登录，登录后可进入界面查看功能；普通用户默认无会员权益，点击高价值功能时会提示开通会员，本地仅缓存账号会话并每 60 秒刷新远端权益。
- 受签名更新：客户端固定使用 `operation_shrimp`，运行中监听 SSE 发布通知并重新请求签名更新载荷；只接受 `update-v1` Ed25519 签名载荷中的 HTTPS 安装包地址，并在下载后核验 SHA-256。

## 商业账号系统

商业版启动时先连接账号服务：

```text
https://anyq.site
```

账号流程：

- `POST /api/auth/send-code`：发送手机号短信验证码。
- `POST /api/auth/login`：验证码登录，服务端写入 HttpOnly Session Cookie。
- `GET /api/auth/me`：读取当前账号、签名 `account_license`、产品权益和到期时间。
- `GET /api/pay/plans`：读取充值套餐。
- `POST /api/auth/logout`：退出登录并清理本地账号缓存。
- 官网充值入口：客户端打开远端网页完成续费，支付和权益发放由服务端处理。

权限规则：

- 新手机号登录后自动创建普通用户。
- 普通用户默认无会员权益，可以进入主界面，但不能执行需要 `operation_course` 的高价值功能。
- 支付成功后服务端按 `operation_shrimp` 独立写入产品权益和到期时间。
- 客户端只信 Ed25519 签名的 `account_license.payload`，根节点 `products`、旧会员字段和余额不得解锁功能。
- 启动时必须请求远端 `/api/auth/me`；运行中每 60 秒刷新一次账号权益。
- 网络失败时可以暂时保留已签名缓存；服务端明确返回未授权、过期、停用或禁用时立即清除本地权益，并阻止付费功能。

## 项目结构

```text
electron/                         Electron 主进程、账号登录、完整性校验、更新器
electron/account-service.ts        手机号登录、签名 account_license 验权、60 秒刷新、缓存清理
electron/account-window.ts         登录/充值续费窗口
electron/integrity-policy.ts       商业包完整性白名单，只保护启动/授权/更新关键文件
electron/release-monitor.ts        SSE 实时更新通知和 60 秒兜底检查
electron/update-service.ts         update-v1 签名更新、下载进度、SHA-256 校验和安装启动
src/                              React 本地壳，用于开发态 UI
vendor/qianshan-runtime/          复用原千山运行时、后端服务和渲染器构建产物
resources/bin/                    ffmpeg、ffprobe、yt-dlp 等媒体二进制
packaging/build/                  商业包构建、asar 打包、完整性清单签名
packaging/installer/              Inno Setup 安装器脚本、中文语言包和覆盖安装策略
scripts/                          Playwright/Electron 自动测试和提示词抓取工具
tests/                            Vitest 单元/构建/账号/更新测试
release/operation-shrimp/<ver>/    运营虾版本化安装包目录，exe 使用 Git LFS
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

文案工坊真实生成需要可用的 OpenAI 兼容 LLM Key。优先在客户端“设置/AI 模型”里的“运营虾本地模型配置”填写：

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
- 注入账号服务地址、更新验签公钥和完整性清单公钥
- 清理源码、测试、`.map`、`.env`、数据库、密钥、C/C++ 源码和 `src/` 目录
- 生成并签名 `integrity_manifest.json`
- 完整性清单仅保护明确列出的启动、登录、会员验签、更新验签、本地付费拦截文件与 `package.json`；用户素材、导出、缓存、数据库、本地模型配置、前端页面和普通运行时文件不纳入清单
- 打包 `app.asar`
- 生成 Inno Setup 安装包

构建命令示例：

```powershell
pwsh -File packaging\build\build_yunyingxia_release.ps1 `
  -Version 0.1.24 `
  -Commercial `
  -AccountServerUrl "https://anyq.site" `
  -ProductCode "operation_shrimp" `
  -UpdatePublicKey "<update-v1 Ed25519 public key>" `
  -IntegrityPrivateKeyPath "C:\Users\q2414\.wanshan\wanshan-integrity-private.pem"
```

也可以直接双击项目根目录的 `build_yunyingxia_release.bat`，输入版本号后开始商业版构建。该入口会固定使用运营虾的产品码、账号服务和更新验签公钥，并检查完整性私钥是否存在。Windows 代码签名仍需在证书工具配置完成后，通过 PowerShell 构建参数启用。

需要重新创建桌面快捷方式时运行：

```powershell
pwsh -NoProfile -File scripts\create-yunyingxia-build-shortcut.ps1
```

当前发布产物：

```text
release/operation-shrimp/0.1.24/YunyingxiaSetup_0.1.24.exe
SHA256: 148a2fbdd630c2a7e15eeb27e33f5d20cc21f5b595819bdc8c73e7fa44ad848a
Size: 184,665,542 bytes
Authenticode: NotSigned
```

更新协议：

- 客户端只请求 `GET /api/v1/releases/latest?product_id=operation_shrimp`，不会读取 OSS/COS 文件列表、`latest.json` 或未签名根字段。
- 运行中的商业客户端只监听 `GET /api/v1/releases/events?product_id=operation_shrimp`；SSE 的 `release` 事件只表示“重新检查”，事件内版本号、地址和强制更新字段一律不使用。
- SSE 断线会自动重连，并且客户端每 60 秒仍会执行一次签名更新检查，防止代理缓存、断线或漏事件导致错过发布。
- 服务端返回的 `update_release` 必须是 `key_id=update-v1` 的 Ed25519 签名信封；客户端只内置对应公钥，绝不包含私钥。
- 客户端验签后校验版本、产品受众、签发方、签名有效期、文件大小、SHA-256，以及无 query/hash 的 `https://download.anyq.site/*.exe` 下载地址；不符合即拒绝更新。
- 签名载荷的 `mandatory=true`，或本地版本低于 `min_supported_version` 时，客户端会在创建主窗口前阻止启动；其余更新只提示，允许用户稍后安装。
- 运行中收到重新校验后的强制更新时，主业务窗口会被禁用；下载、签名、大小、SHA-256 或安装失败会显示错误并只提供重试，不能关闭提示后继续使用。
- 每个发布包使用 `release/operation-shrimp/<version>/YunyingxiaSetup_<version>.exe` 独立目录；只发布完整、最终代码签名后的安装包。
- 手动重复点击安装包时会启动已安装的运营虾；客户端发起的已签名更新使用 `/UPDATE` 参数继续覆盖升级。
- 安装器不再使用 Inno 默认“询问关闭应用”页；覆盖安装前会用管理员权限强制关闭 `Yunyingxia.exe` 和旧名 `WanshanMedia.exe`，多次重试后仍失败才提示用户到任务管理器结束进程。
- 安装器使用永久 AppId，并启用 `UsePreviousAppDir=yes` 和安装路径确认页，避免用户改过路径后覆盖安装到错误目录。
- 旧安装包没有 SSE 实时监听和 60 秒兜底能力；必须重新打包、覆盖安装新版本后才会启用该能力。

## 账号安全要点

- 短信 AccessKey、微信支付商户私钥、API v3 Key 只保存在账号服务端 `.env` 和服务器密钥目录。
- 客户端不保存短信密钥、微信支付密钥、后台管理员 token 或服务端私钥。
- 客户端只保存账号会话 Cookie，使用 Electron `safeStorage` 加密本地缓存。
- 普通用户默认无权限；真正的功能开关由服务端余额、会员到期时间和后续套餐策略控制。
- 客户端启动时主动查询 `/api/auth/me`，运行中约 60 秒刷新一次。
- 会话失效、会员过期、产品停用或无 `operation_course` 权益时，客户端清除本地权益并阻止付费功能。
- `asar` 不是加密，只是打包；核心安全依靠服务端权限、完整性校验和发布目录清理。

## 数据与隐私

- 用户数据、第三方平台 Cookie、数据库、日志和账号会话缓存放在 `%LOCALAPPDATA%\Yunyingxia\data`，不放安装目录；首次启动会自动迁移旧 `%LOCALAPPDATA%\WanshanMedia` 数据。
- 安装包不应包含 `.env`、私钥、开发文档、测试文件、源码映射、数据库、日志或用户数据。
- 对外网络访问主要包括账号服务、更新源、公开热点/平台数据、用户主动配置的 AI API。
- LLM Key 不进入仓库、安装包、README、更新日志或完整性清单，只存在用户本机数据目录。
- 自定义中转站会接收用户提示词和生成内容，销售/交付时按客户自己的中转站配置说明交付。
- 第三方平台网页登录态由用户自己控制，不由运营虾托管。

## 交接入口

后续 AI 或开发者接手前，优先阅读：

1. `docs/AI_HANDOFF.md`
2. `CHANGELOG.md`
3. `electron/account-service.ts`
4. `electron/commercial-config.ts`
5. `packaging/build/build_release.ps1`
6. `vendor/qianshan-runtime/dist/routes/one-click.js`
7. `vendor/qianshan-runtime/dist/services/one-click.js`
