# 万山自媒体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建本地优先的“万山自媒体”Electron 桌面应用，提供可编辑提示词库和文案工作台。

**Architecture:** Electron 主进程持有本地 JSON 数据、DPAPI 加密和严格 IPC；React 渲染进程通过 preload API 调用本地服务。所有外部请求由用户在界面点击后且仅向其自行配置的 OpenAI 兼容端点发出。

**Tech Stack:** Electron 28、React 18、Vite、TypeScript、Vitest、Playwright。

## Global Constraints

- 产品名称必须是“万山自媒体”。
- 不实现登录、授权、激活、统计、自动更新、后台网络访问或云端密钥同步。
- API Key 不写入本地数据文件明文，必须用 Electron safeStorage 加密。
- Electron 必须启用 `contextIsolation: true` 与 `nodeIntegration: false`。
- 仅把用户主动配置的 Base URL 作为网络目标。

---

### Task 1: 建立安全的 Electron 工程骨架

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `window.wanshan`，由 preload 白名单暴露的本地 API。

- [ ] 编写配置断言，验证产品名、安全 WebPreferences 与无自动更新依赖。
- [ ] 运行 `npm test -- tests/config.test.ts`，预期在工程尚未创建时失败。
- [ ] 创建 Electron/Vite 工程，主窗口标题为“万山自媒体”，preload 启用 context isolation。
- [ ] 运行同一测试，预期通过。

### Task 2: 建立本地数据与提示词模板库

**Files:**
- Create: `electron/db.ts`
- Create: `electron/templates.ts`
- Create: `electron/template-service.ts`
- Create: `shared/contracts.ts`
- Test: `tests/template-service.test.ts`

**Interfaces:**
- Produces: `TemplateService.list()`, `get(id)`, `save(template)`, `reset(id)`, `render(id, variables)`。
- Consumes: `TemplateDefinition { id, name, description, variables, content }`。

- [ ] 写模板插值、用户编辑和恢复默认的失败测试。
- [ ] 创建 JSON 数据文件与 11 个万山内置模板定义。
- [ ] 实现仅允许已声明变量插值的 `render`，缺失变量置空。
- [ ] 运行 `npm test -- tests/template-service.test.ts`，预期通过。

### Task 3: 实现本地模型设置与安全密钥存储

**Files:**
- Create: `electron/credential-service.ts`
- Create: `electron/llm-client.ts`
- Modify: `electron/preload.ts`
- Test: `tests/credential-service.test.ts`
- Test: `tests/llm-client.test.ts`

**Interfaces:**
- Produces: `CredentialService.save({ baseUrl, apiKey, model })`, `load()`, `clear()`。
- Produces: `LlmClient.testConnection()` 和 `complete(messages)`。

- [ ] 为 Base URL 验证、加密/解密适配和缺少设置的调用错误写失败测试。
- [ ] 用 safeStorage 对 API Key 加密，设置表只存密文与非敏感模型配置。
- [ ] 实现 OpenAI Chat Completions 调用，限制 URL 为 HTTPS 或 `http://localhost`。
- [ ] 运行两组服务测试，预期通过。

### Task 4: 实现文案工作流与历史记录

**Files:**
- Create: `electron/workflow-service.ts`
- Create: `electron/workspace-service.ts`
- Modify: `electron/db.ts`
- Modify: `electron/preload.ts`
- Test: `tests/workflow-service.test.ts`

**Interfaces:**
- Produces: `WorkflowService.generate(input, onProgress)`，返回 `WorkspaceRecord`。
- Produces: `WorkspaceService.list(query)`, `get(id)`, `remove(id)`。

- [ ] 为“未配置模型不调用网络”、模板渲染顺序和本地保存写失败测试。
- [ ] 实现大纲、扩写、润色、标题和字幕五步工作流，逐步汇报进度。
- [ ] 将生成输入、输出和元数据写入本地 JSON 数据文件。
- [ ] 运行 `npm test -- tests/workflow-service.test.ts`，预期通过。

### Task 5: 构建文案工作台界面

**Files:**
- Create: `src/features/workspace/WorkspacePage.tsx`
- Create: `src/features/prompts/PromptLibraryPage.tsx`
- Create: `src/features/settings/SettingsPage.tsx`
- Create: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/features/workspace/WorkspacePage.test.tsx`

**Interfaces:**
- Consumes: `window.wanshan.templates`, `window.wanshan.settings`, `window.wanshan.workspace`。
- Produces: 三个本地页面和无登录入口的应用首屏。

- [ ] 写渲染测试，验证首屏为工作台、模板可编辑和未配置设置的状态。
- [ ] 实现紧凑的桌面侧栏、生成表单、进度区、结果编辑区、模板编辑和模型设置。
- [ ] 运行前端测试，预期通过。

### Task 6: 补齐 IPC 验证、构建与端到端验证

**Files:**
- Create: `electron/ipc.ts`
- Create: `playwright.config.ts`
- Create: `e2e/app.spec.ts`
- Modify: `electron/main.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: 经 schema 验证的 IPC 注册函数 `registerIpcHandlers()`。

- [ ] 为非法 IPC 参数和 preload 白名单写失败测试。
- [ ] 实现 Zod 参数验证，注册模板、设置和工作区 API。
- [ ] 用 Playwright 启动实际 Electron 应用，验证不显示登录、无自动更新按钮、可打开提示词库。
- [ ] 运行 `npm test`、`npm run test:e2e`、`npm run build`，预期全部通过。
