# Legacy UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将解包应用的完整 React/Ant Design 前端原样作为万山自媒体的界面，同时移除授权与更新桥接。

**Architecture:** 原 `renderer/dist` 被复制为万山项目的静态 renderer。Electron 只加载这个 renderer，并通过最小 `electronAPI` 提供安全的文件对话框与应用信息；故意不暴露 `auth`、`update`，使原前端的授权/更新分支不执行。

**Tech Stack:** 原 React 18、React Router、Ant Design 5.29.3 renderer；Electron 28；Playwright。

## Global Constraints

- 原 renderer 的布局、路由和交互必须原样复用。
- 不暴露 `electronAPI.auth` 或 `electronAPI.update`。
- 不启动原授权、心跳或自动更新代码。
- 不在测试中访问外部域名。

---

### Task 1: 迁入静态 renderer 与无授权 preload

**Files:**
- Create: `legacy-renderer/**` from `unpacked-app/renderer/dist/**`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Test: `tests/legacy-renderer.test.ts`

- [ ] 写静态测试，断言入口、bundle 和 auth/update 缺席的 preload。
- [ ] 复制原 renderer 资产且不重写 bundle。
- [ ] 将 Electron 加载路径改为 `legacy-renderer/index.html`。
- [ ] 运行 `npm test -- tests/legacy-renderer.test.ts`。

### Task 2: 实际窗口回归

**Files:**
- Create: `e2e/legacy-renderer-smoke.cjs`

- [ ] 用 Playwright 启动 Electron。
- [ ] 断言仪表盘进入、登录表单不存在、原有路由可见。
- [ ] 保存 screenshot 到 `artifacts/legacy-renderer-smoke.png`。
