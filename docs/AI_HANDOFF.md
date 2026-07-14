# AI 接手说明

这个文档给后续 Fork、AI 接手或二次开发使用。目标是让下一位开发者不用翻完整聊天记录，也能立刻判断项目边界、账号链路和发布流程。

## 当前目标

运营虾要尽量复刻原千山自媒体的前端效果和功能，同时加入手机号账号登录、充值会员、更新器、安装包加固和本地数据安全策略。

当前最新版本：`0.1.10`

当前主分支：`main`

远端仓库：<https://github.com/YacgoSomaz/qianshanzimeiti>

## 当前账号体系

商业启动链路已经从卡密切换为手机号账号：

- 默认新手机号登录后是普通用户。
- 普通用户无功能权限，不能进入商业功能。
- 微信支付充值成功后，服务端写入 `energy_balance`、`membership_expires_at`、`membership_plan`。
- 客户端只在会员未过期且 `energy_balance > 0` 时进入主软件。
- 运行中约 10 分钟刷新一次账号权限；会话失效、会员过期或余额不足时退出。

## 远端服务信息

公开地址：

```text
https://anyq.site
```

账号/支付服务能力：

- `POST /api/auth/send-code` 发送短信验证码
- `POST /api/auth/login` 手机号验证码登录
- `GET /api/auth/me` 查询账号和会员状态
- `POST /api/auth/logout` 退出登录
- `GET /api/pay/plans` 查询套餐
- `POST /api/pay/wechat/create` 创建微信 Native 支付二维码
- `GET /api/pay/wechat/status/:orderNo` 查询支付订单状态
- `POST /api/pay/wechat/notify` 微信支付回调

注意：不要在文档或代码中提交 SSH 密码、短信 AccessKey、微信商户私钥、API v3 Key、管理员 token、完整性签名私钥。

## 本地关键文件

```text
electron/commercial-config.ts        商业配置默认值，包含 accountServerUrl 和更新验签公钥
electron/account-service.ts          手机号登录、会话缓存、会员权限刷新、微信支付接口
electron/account-window.ts           登录/充值窗口
electron/license-crypto.ts           Ed25519 验签工具，仍被完整性清单校验复用
electron/integrity-verifier.ts       安装目录完整性校验
electron/update-service.ts           更新检查、下载和校验
electron/main.ts                     启动流程、账号窗口、后台权限刷新、运行时启动
packaging/build/build_release.ps1    商业版构建和发布清理
packaging/installer/WanshanMedia.iss Inno Setup 安装脚本
vendor/qianshan-runtime/dist/        复用原千山运行时核心后端
scripts/audit-ui-flows.cjs           Playwright/Electron UI 流程检查
scripts/capture-prompts.cjs          抓取提示词相关数据
```

## 开发命令

```powershell
npm install
npm install --prefix .runtime-electron electron@30.5.1
npm test
npm run build
npm start
```

打商业包：

```powershell
pwsh -File packaging\build\build_release.ps1 `
  -Version 0.1.12 `
  -Commercial `
  -AccountServerUrl "https://anyq.site" `
  -ProductCode "operation_shrimp" `
  -UpdatePublicKey "<update-v1 Ed25519 public key>" `
  -IntegrityPrivateKeyPath "C:\Users\q2414\.wanshan\wanshan-integrity-private.pem"
```

## 发布验收清单

每次发布前至少验证：

- `npm test`
- `npm run build`
- 商业构建脚本完整跑完
- `release/YunyingxiaSetup_<version>.exe` 生成
- asar 内 `commercial-config.json` 的 `accountServerUrl` 是 `https://anyq.site`
- asar 内 `commercial-config.json` 包含仅用于验签的 `updatePublicKey`，不包含更新私钥
- asar 内没有 `.py/.ts/.tsx/.map/.env/.pem/.key/.db/.sqlite/.md`
- asar 内没有 `src/`、`test/`、`tests/`、`__tests__/`
- asar 内所有依赖 `package.json` 的 `main/module` 入口都真实存在，不能再出现指向已删除 `src/...` 的入口
- `integrity_manifest.json` 有签名
- `https://anyq.site/api/health` 显示短信和微信支付配置正常
- `https://anyq.site/api/pay/plans` 返回套餐列表
- 新手机号登录后未充值不能进入主软件
- 支付成功后会员未过期且余额大于 0 才能进入主软件
- `GET https://anyq.site/api/v1/releases/latest?product_id=operation_shrimp` 返回 `update_release` 签名信封
- 将根字段篡改、修改 `payload`、替换为 HTTP URL 或伪造 SHA-256 时，客户端必须拒绝更新
- 签名载荷下载地址必须是无 query/hash 的 `https://download.anyq.site/*.exe`，文件大小与 SHA-256 一致
- 已签名 `mandatory=true` 或本地版本低于 `min_supported_version` 时，主窗口不得创建
- 手动重复打开安装器应启动已安装程序；只有客户端更新器传入 `/UPDATE` 才继续覆盖安装
- 覆盖安装后启动，用 Playwright/Electron 至少跑一遍主界面冒烟测试；如果当前 Codex 进程没有管理员权限，必须记录 UAC/目录权限限制并从 `release/stage` 做替代启动验证

## 账号行为边界

客户端应该这样处理账号权限：

- 启动时读取账号会话并刷新 `/api/auth/me`。
- 运行中约 10 分钟刷新一次。
- 普通用户默认无功能权限。
- 会员过期、余额不足或会话失效时退出软件。
- 客户端不能保存短信 AccessKey、微信支付密钥、后台管理员 token 或服务端私钥。
- 充值套餐以后应继续由服务端 `/api/pay/plans` 控制，不要写死在客户端。

## 不能做的事

- 不能把服务端私钥放进客户端。
- 不能把管理员 token、SSH 密码、`.env` 提交到 Git。
- 不能把短信 AccessKey、微信商户私钥或 API v3 Key 放进客户端。
- 不能把安装目录当用户数据目录。
- 不能在发布包里留下源码、测试文件、源码映射、数据库、日志、密钥。
- 不能把 GitHub 当中国用户主要下载源。
- 不能用 OSS/COS 文件列表、`latest.json`、`latest.yml` 或未签名根字段判断是否有新版本。
- 不能把 `download.anyq.site` 之外的下载域名、带 query/hash 的 URL 或非 `.exe` 文件作为更新包。

## 当前已知待办

- 生成商业包前必须取得 `update-v1` 对应的 Ed25519 公钥；该公钥只用于客户端验签，不能用账号签名公钥猜测或替代。
- 正式发布时必须提供真实代码签名工具：主启动 EXE 使用 `-CodeSignTool` / `-CodeSignArgument`，Inno 安装器和卸载器使用 `-InnoSignToolCommand`；两个步骤要么同时配置，要么都不配置，开发包不得冒充已签名。
- 管理后台前端目前是轻量静态页面，后续如继续多产品扩展，建议抽象产品配置，避免手写 HTML 字符串难维护。
- 需要继续用 Playwright 扫描原千山前端功能差异，目标是效果和功能尽量一致。
