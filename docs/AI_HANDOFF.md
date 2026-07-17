# AI 接手说明

这个文档给后续 Fork、AI 接手或二次开发使用。目标是让下一位开发者不用翻完整聊天记录，也能立刻判断项目边界、账号链路和发布流程。

## 当前目标

运营虾要尽量复刻原千山自媒体的前端效果和功能，同时加入手机号账号登录、充值会员、更新器、安装包加固和本地数据安全策略。

当前最新版本：`0.1.24`

当前主分支：`main`

远端仓库：<https://github.com/YacgoSomaz/qianshanzimeiti>

## 当前账号体系

商业启动链路已经从卡密切换为手机号账号：

- 默认新手机号登录后是普通用户。
- 普通用户无会员权益，但登录后可以进入主界面查看功能。
- 高价值功能调用前必须重新验权；没有 `operation_shrimp` / `operation_course` 时提示开通会员，不允许执行。
- 微信支付充值成功后，服务端按 `product_id=operation_shrimp` 独立写入产品权益和到期时间。
- 客户端只信 Ed25519 签名的 `account_license.payload`；根节点 `products`、旧会员字段和余额不得解锁功能。
- 启动时必须请求远端 `/api/auth/me`；运行中约 60 秒刷新一次账号权限。
- 网络失败时可以短暂使用已签名缓存；服务端明确返回未授权、过期、停用或禁用时必须立即清除本地权益并阻止付费功能。

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
electron/account-service.ts          手机号登录、签名 account_license 验权、会话缓存、60 秒权限刷新
electron/account-window.ts           登录/充值续费窗口，登录成功后不再因窗口关闭触发 app 退出
electron/license-crypto.ts           Ed25519 验签工具，仍被完整性清单校验复用
electron/integrity-policy.ts         完整性精确文件白名单：只保护启动、授权和更新边界
electron/integrity-verifier.ts       安装目录完整性校验
electron/release-monitor.ts          SSE 长连接、60 秒兜底、自动重连和生命周期清理
electron/update-service.ts           签名更新检查、下载进度、文件校验和强制更新阻断
electron/update-window.ts            中文更新窗口、普通更新/强制更新状态与进度展示
electron/main.ts                     启动流程、账号窗口、后台权限刷新、运行时启动、单实例唤醒
packaging/build/build_release.ps1    商业版构建和发布清理
packaging/installer/WanshanMedia.iss Inno Setup 安装脚本、覆盖安装、中文语言包、强制关闭运行中进程
packaging/installer/languages/        Inno 中文语言文件
vendor/qianshan-runtime/dist/        复用原千山运行时核心后端
vendor/qianshan-runtime/dist/paid-action-auth.js 运行时付费功能拦截
scripts/audit-ui-flows.cjs           Playwright/Electron UI 流程检查
scripts/capture-prompts.cjs          抓取提示词相关数据
scripts/export-forbidden-dictionary.cjs 导出本地违禁词库
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
  -Version 0.1.24 `
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
- `release/operation-shrimp/<version>/YunyingxiaSetup_<version>.exe` 生成，exe 使用 Git LFS
- asar 内 `commercial-config.json` 的 `accountServerUrl` 是 `https://anyq.site`
- asar 内 `commercial-config.json` 的 `version` 和 `package.json.version` 与安装包版本一致
- asar 内 `commercial-config.json` 的 `productCode` 固定为 `operation_shrimp`
- `main.js` 不得重复注册 `ipcMain.handle('app:info')`；版本通过商业配置覆盖 `app.getVersion()` 给原千山运行时读取
- asar 内 `commercial-config.json` 包含仅用于验签的 `updatePublicKey`，不包含更新私钥
- asar 内没有 `.py/.ts/.tsx/.map/.env/.pem/.key/.db/.sqlite/.md`
- asar 内没有 `src/`、`test/`、`tests/`、`__tests__/`
- asar 内所有依赖 `package.json` 的 `main/module` 入口都真实存在，不能再出现指向已删除 `src/...` 的入口
- `integrity_manifest.json` 有签名
- 完整性清单只覆盖 `electron/integrity-policy.ts` 明确列出的启动、授权、更新与本地付费拦截文件及 `package.json`；不得把目录、前端页面、普通运行时文件、用户数据、素材、导出、缓存或本地配置加入清单
- `https://anyq.site/api/health` 显示短信和微信支付配置正常
- `https://anyq.site/api/pay/plans` 返回套餐列表
- 新手机号登录后可以进入主界面，但点击高价值功能必须提示开通会员
- 支付成功后必须由签名 `account_license.payload` 中的 `operation_shrimp` / `operation_course` 解锁，不能靠根节点 `products`、旧会员字段或余额解锁
- 后台停用、过期或禁用账号后，下一次 60 秒刷新或付费操作必须清除本地权益并阻止功能
- `GET https://anyq.site/api/v1/releases/latest?product_id=operation_shrimp` 返回 `update_release` 签名信封
- 运行中连接 `GET https://anyq.site/api/v1/releases/events?product_id=operation_shrimp`，只把 `release` 事件作为重新请求签名载荷的信号；事件 data 绝不能用于更新决定
- SSE 中断后会自动重连，且每 60 秒必须重新检查一次已签名更新；窗口销毁和应用退出时必须关闭长连接、清理定时器
- 将根字段篡改、修改 `payload`、替换为 HTTP URL 或伪造 SHA-256 时，客户端必须拒绝更新
- 签名载荷下载地址必须是无 query/hash 的 `https://download.anyq.site/*.exe`，文件大小与 SHA-256 一致
- 已签名 `mandatory=true` 或本地版本低于 `min_supported_version` 时，主窗口不得创建
- 运行中出现已签名强制更新时，主业务窗口必须禁用；下载、签名、大小、SHA-256 或安装失败时只能重试，不能绕过继续使用
- 手动重复打开安装器应启动已安装程序；只有客户端更新器传入 `/UPDATE` 才继续覆盖安装
- 覆盖安装前安装器应自动强制关闭 `Yunyingxia.exe` 和旧名 `WanshanMedia.exe`；不再依赖 Inno 默认关闭应用询问页
- 覆盖安装必须显示安装路径并复用历史安装目录，避免快捷方式仍指向旧目录
- 覆盖安装后启动，用 Playwright/Electron 至少跑一遍主界面冒烟测试；如果当前 Codex 进程没有管理员权限，必须记录 UAC/目录权限限制并从 `release/stage` 做替代启动验证

## 账号行为边界

客户端应该这样处理账号权限：

- 启动时读取账号会话并刷新 `/api/auth/me`。
- 运行中约 60 秒刷新一次。
- 普通用户默认无功能权限。
- 会员过期、账号停用、产品停用、权益缺失或会话失效时清除本地权益并阻止付费功能。
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
- 运营虾的产品受众固定为 `operation_shrimp`；漫剧虾客户端固定为 `comic_shrimp`。两者都不能从网页、配置文件或用户输入切换产品 ID。
- SSE 发布事件不是授权或更新元数据，不能信任其中的版本、下载地址、`mandatory` 或任何 data 字段；必须重新请求并验签 `update_release`。

## 当前已知待办

- 生成商业包前必须取得 `update-v1` 对应的 Ed25519 公钥；该公钥只用于客户端验签，不能用账号签名公钥猜测或替代。
- 正式发布时必须提供真实代码签名工具：主启动 EXE 使用 `-CodeSignTool` / `-CodeSignArgument`，Inno 安装器和卸载器使用 `-InnoSignToolCommand`；两个步骤要么同时配置，要么都不配置，开发包不得冒充已签名。
- 管理后台前端目前是轻量静态页面，后续如继续多产品扩展，建议抽象产品配置，避免手写 HTML 字符串难维护。
- 需要继续用 Playwright 扫描原千山前端功能差异，目标是效果和功能尽量一致。
- 旧安装包没有实时更新监听。发布此能力必须重新打包，用户覆盖安装新版后才会连接 SSE 和启用 60 秒兜底检查。
- 当前 0.1.24 安装包：`release/operation-shrimp/0.1.24/YunyingxiaSetup_0.1.24.exe`，SHA256 `148a2fbdd630c2a7e15eeb27e33f5d20cc21f5b595819bdc8c73e7fa44ad848a`，大小 `184,665,542` 字节，Authenticode 状态 `NotSigned`。
