# AI 接手说明

这个文档给后续 Fork、AI 接手或二次开发使用。目标是让下一位开发者不用翻完整聊天记录，也能立刻判断项目边界、授权链路和发布流程。

## 当前目标

万山自媒体要尽量复刻原千山自媒体的前端效果和功能，同时加入商业授权、更新器、安装包加固和本地数据安全策略。

当前最新版本：`0.1.8`

当前主分支：`main`

远端仓库：<https://github.com/YacgoSomaz/qianshanzimeiti>

## 必须保留的产品隔离

| 软件 | product_code | 卡密前缀 |
| --- | --- | --- |
| 万山自媒体 | `wanshan_zimeiti` | `WSZ-` |
| 万山漫剧 | `wanshan_media` | `WSM-` |
| 直播复盘侠 | `live_replay_xia` | `LRX-` |

不要把万山自媒体改回 `wanshan_media`。`wanshan_media` 已经被万山漫剧占用。

授权公钥：

```text
YYHkNVmcsiWjoYweNOa7CEBP3WGRyBbB6Cf3_qvQchc
```

这是公钥，不是私钥。可以进入客户端和文档。服务端私钥、管理员 token、服务器密码不能写入仓库。

## 远端服务信息

公开地址：

```text
https://license.runmo.art
https://license.runmo.art/admin
https://license.runmo.art/wanshan-media/updates/latest.json
```

授权服务能力：

- 创建卡密
- 激活卡密
- 设备绑定
- 刷新授权
- 冻结/解绑设备
- 到期校验
- Ed25519 签名授权包
- 静态更新清单和安装包下载

注意：不要在文档或代码中提交 SSH 密码、管理员 token、签名私钥、完整性签名私钥。

## 本地关键文件

```text
electron/commercial-config.ts        商业配置默认值，当前 productCode 必须是 wanshan_zimeiti
electron/license-service.ts          激活、刷新、缓存清理、10 分钟授权刷新
electron/license-crypto.ts           Ed25519 授权包验签
electron/integrity-verifier.ts       安装目录完整性校验
electron/update-service.ts           更新检查、下载和校验
electron/main.ts                     启动流程、授权窗口、后台刷新、运行时启动
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
  -Version 0.1.8 `
  -Commercial `
  -LicenseServerUrl "https://license.runmo.art" `
  -ProductCode "wanshan_zimeiti" `
  -UpdateFeedUrl "https://license.runmo.art/wanshan-media/updates/latest.json" `
  -UpdateAssetBaseUrl "" `
  -IntegrityPrivateKeyPath "C:\Users\q2414\.wanshan\wanshan-integrity-private.pem" `
  -LicensePublicKey "YYHkNVmcsiWjoYweNOa7CEBP3WGRyBbB6Cf3_qvQchc"
```

## 发布验收清单

每次发布前至少验证：

- `npm test`
- `npm run build`
- 商业构建脚本完整跑完
- `release/WanshanMediaSetup_<version>.exe` 生成
- `release/latest.json` 和 `release/latest.yml` 指向新版本
- asar 内 `commercial-config.json` 的 `productCode` 是 `wanshan_zimeiti`
- asar 内没有 `.py/.ts/.tsx/.map/.env/.pem/.key/.db/.sqlite/.md`
- asar 内没有 `src/`、`test/`、`tests/`、`__tests__/`
- asar 内所有依赖 `package.json` 的 `main/module` 入口都真实存在，不能再出现指向已删除 `src/...` 的入口
- `integrity_manifest.json` 有签名
- 授权后台创建 `wanshan_zimeiti` 卡密后，激活 payload 里 product_code 是 `wanshan_zimeiti`
- 用 `wanshan_zimeiti` 卡密激活 `wanshan_media` 应该失败
- 线上 `latest.json` 可访问
- 安装包下载支持 Range
- 覆盖安装后启动，用 Playwright/Electron 至少跑一遍主界面冒烟测试；如果当前 Codex 进程没有管理员权限，必须记录 UAC/目录权限限制并从 `release/stage` 做替代启动验证

## 授权行为边界

客户端应该这样处理授权：

- 启动时刷新授权。
- 运行中约 10 分钟刷新一次。
- 服务器返回 401/403/404/409/410 时，视为明确拒绝，清除本地授权缓存。
- 只有网络临时错误才允许使用签名包内的离线宽限。
- 显式过期卡密到点即过期，不额外加宽限。

## 不能做的事

- 不能把服务端私钥放进客户端。
- 不能把管理员 token、SSH 密码、`.env` 提交到 Git。
- 不能让万山自媒体继续使用 `wanshan_media`。
- 不能把安装目录当用户数据目录。
- 不能在发布包里留下源码、测试文件、源码映射、数据库、日志、密钥。
- 不能把 GitHub 当中国用户主要下载源。

## 当前已知待办

- 安装包目前仍在授权服务器下载，适合测试，不适合大规模分发。
- 正式发布前建议迁移安装包到 COS/OSS/CDN，再设置 `-UpdateAssetBaseUrl`。
- 管理后台前端目前是轻量静态页面，后续如继续多产品扩展，建议抽象产品配置，避免手写 HTML 字符串难维护。
- 需要继续用 Playwright 扫描原千山前端功能差异，目标是效果和功能尽量一致。
