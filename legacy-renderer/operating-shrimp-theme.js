(function () {
  const STYLE_ID = 'operating-shrimp-theme';
  const MARK_CLASS = 'yx-logo-mark';
  const THEME_KEY = 'operating-shrimp-theme-mode';
  const WORKSPACE_CACHE_PREFIX = 'yx.workspace-cache:';
  const GENERATION_ACTIVE_KEY = 'yx.background-generation.active';
  const GENERATION_RESULT_KEY = 'yx.background-generation.last-result';
  const GENERATION_PANEL_SNAPSHOT_KEY = 'yx.background-generation.panel-snapshot';
  const GENERATION_SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:19832' : '';
  const TEXT_MODEL_CHOICE_KEY = 'yx.model-choice.copywriting';
  const IMAGE_MODEL_CHOICE_KEY = 'yx.model-choice.image';
  const GENERATION_KEEPALIVE_ROUTES = [
    /\/copywriting\/(?:generate-stream|text-rewrite-stream)(?:\?|$)/i,
    /\/video\/ad\/generate-stream(?:\?|$)/i,
    /\/one-click\/(?:generate-stream|analyze-v2-stream|search-for-scene)(?:\?|$)/i,
  ];
  const replacements = [
    [/万山自媒体/g, '运营虾'],
    [/万山本地模型配置/g, '运营虾本地模型配置'],
    [/万山/g, '运营虾'],
    [/千山自媒体助手/g, '运营虾'],
    [/千山AI/g, '运营虾'],
    [/千山 AI/g, '运营虾'],
    [/千山官网/g, '官网'],
    [/qianshanai\.cn\s*网页端/g, '运营虾本地配置'],
    [/www\.qianshanai\.cn/g, '运营虾'],
    [/qianshanai\.cn/g, '运营虾'],
    [/qianshanAI/g, 'yunyingxia'],
    [/Qianshan/g, 'Yunyingxia'],
    [/千山临时素材上传/g, '临时素材上传'],
    [/千山账号/g, '运营虾账号'],
  ];

  function setFavicon() {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = './icon.png';
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        color-scheme: light;
        --yx-bg: #f7f8fa;
        --yx-surface: #ffffff;
        --yx-subtle: #f1f3f5;
        --yx-line: #d8dee4;
        --yx-line-soft: #eaeef2;
        --yx-text: #111827;
        --yx-muted: #667085;
        --yx-faint: #98a2b3;
        --yx-accent: #111827;
        --yx-accent-soft: #eef2ff;
        --yx-good: #15803d;
        --yx-warn: #b45309;
        --yx-danger: #dc2626;
        --bg-base: #f7f8fa;
        --bg-container: #ffffff;
        --bg-elevated: #ffffff;
        --border-color: #d8dee4;
        --border-color-soft: #eaeef2;
        --text-primary: #111827;
        --text-secondary: #667085;
        --primary: #111827;
        --primary-soft: #eef1f5;
      }

      html,
      body,
      #root,
      .ant-app,
      .ant-layout,
      .ant-layout-has-sider,
      .ant-layout > .ant-layout,
      .ant-layout-content {
        background: var(--yx-bg) !important;
        color: var(--yx-text) !important;
      }

      .qs-page {
        background: var(--yx-bg) !important;
        color: var(--yx-text) !important;
      }

      [style*="#0D1117"],
      [style*="#0d1117"],
      [style*="#161B22"],
      [style*="#161b22"],
      [style*="#21262D"],
      [style*="#21262d"],
      [style*="rgb(13, 17, 23)"],
      [style*="rgb(22, 27, 34)"] {
        background: var(--yx-bg) !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line-soft) !important;
      }

      [style*="#E6EDF3"],
      [style*="#e6edf3"],
      [style*="#C9D1D9"],
      [style*="#c9d1d9"],
      [style*="rgb(230, 237, 243)"],
      [style*="rgb(230,237,243)"],
      [style*="rgb(201, 209, 217)"],
      [style*="rgb(201,209,217)"] {
        color: var(--yx-text) !important;
      }

      [style*="#7D8590"],
      [style*="#7d8590"],
      [style*="rgb(125, 133, 144)"],
      [style*="rgb(125,133,144)"] {
        color: var(--yx-muted) !important;
      }

      body {
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif !important;
      }

      .ant-layout-sider,
      .ant-layout-sider-children,
      aside,
      [class*="sidebar"],
      [class*="sider"] {
        background: #f4f6f8 !important;
        color: var(--yx-text) !important;
        border-right: 1px solid var(--yx-line-soft) !important;
      }

      .ant-layout-header,
      header {
        background: var(--yx-bg) !important;
        color: var(--yx-text) !important;
        border-bottom-color: var(--yx-line-soft) !important;
      }

      .ant-layout-header .ant-typography,
      .ant-layout-header span,
      .ant-layout-content .ant-typography {
        color: var(--yx-text) !important;
      }

      .ant-card,
      .qs-card,
      .qs-metric-card,
      .panel,
      [class*="card"] {
        background: var(--yx-surface) !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line-soft) !important;
        box-shadow: none !important;
      }

      .ant-card-head,
      .ant-card-body,
      .ant-drawer-content,
      .ant-modal-content,
      .ant-popover-inner,
      .ant-dropdown-menu,
      .ant-table,
      .ant-table-container,
      .ant-table-thead > tr > th,
      .ant-table-tbody > tr > td,
      .ant-table-tbody > tr.ant-table-placeholder > td,
      .ant-table-tbody > tr.ant-table-placeholder:hover > td,
      .ant-table-expanded-row-fixed,
      .ant-list-item {
        background: var(--yx-surface) !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line-soft) !important;
      }

      .ant-empty,
      .ant-empty-normal,
      .ant-empty-image,
      .ant-empty-description {
        background: transparent !important;
        color: var(--yx-muted) !important;
      }

      .ant-menu,
      .ant-menu-root,
      .ant-menu-sub,
      .ant-menu-item,
      .ant-menu-submenu-title {
        background: transparent !important;
        color: #344054 !important;
      }

      .ant-menu-item-selected,
      .ant-menu-item-active,
      .ant-menu-submenu-selected > .ant-menu-submenu-title,
      .nav.active {
        background: #e9edf3 !important;
        color: var(--yx-text) !important;
        border-radius: 8px !important;
      }

      .ant-menu-dark,
      .ant-menu-dark .ant-menu-item,
      .ant-menu-dark .ant-menu-submenu-title {
        background: transparent !important;
        color: #344054 !important;
      }

      .ant-menu-item:hover,
      .ant-menu-submenu-title:hover,
      .nav:hover {
        background: #eef1f5 !important;
        color: var(--yx-text) !important;
      }

      .ant-typography,
      .ant-form-item-label > label,
      .ant-form-item-required,
      .ant-form-item-label label,
      .ant-steps-item-title,
      .ant-steps-item-description,
      .ant-select-selection-item,
      .ant-radio-wrapper,
      .ant-checkbox-wrapper,
      .ant-table,
      .ant-tabs,
      .ant-list,
      h1, h2, h3, h4, h5, h6,
      p, span, label, strong, pre {
        color: var(--yx-text);
      }

      .ant-steps-item-wait .ant-steps-item-title,
      .ant-steps-item-wait .ant-steps-item-description,
      .ant-steps-item-process .ant-steps-item-description,
      .ant-form-item-label > label,
      .ant-select-selection-placeholder {
        color: var(--yx-muted) !important;
      }

      .ant-typography-secondary,
      .ant-form-item-extra,
      .ant-form-item-explain,
      small,
      .subtle,
      .empty,
      [class*="secondary"] {
        color: var(--yx-muted) !important;
      }

      .ant-btn {
        border-radius: 8px !important;
        border-color: var(--yx-line) !important;
        background: var(--yx-surface) !important;
        color: var(--yx-text) !important;
        box-shadow: none !important;
      }

      .ant-btn-primary,
      button[data-primary],
      .primary {
        border-color: #111827 !important;
        background: #111827 !important;
        color: #ffffff !important;
      }

      .ant-btn-primary *,
      button[data-primary] *,
      .primary *,
      [style*="background: rgb(17, 24, 39)"] *,
      [style*="background:rgb(17,24,39)"] *,
      [style*="background-color: rgb(17, 24, 39)"] *,
      [style*="background-color:rgb(17,24,39)"] * {
        color: #ffffff !important;
      }

      [style*="background: rgb(17, 24, 39)"],
      [style*="background:rgb(17,24,39)"],
      [style*="background-color: rgb(17, 24, 39)"],
      [style*="background-color:rgb(17,24,39)"] {
        color: #ffffff !important;
      }

      .ant-btn:hover {
        border-color: #98a2b3 !important;
        color: var(--yx-text) !important;
      }

      .ant-btn-primary:hover,
      button[data-primary]:hover,
      .primary:hover {
        background: #273142 !important;
        border-color: #273142 !important;
        color: #ffffff !important;
      }

      .ant-input,
      .ant-input-affix-wrapper,
      .ant-input-number,
      .ant-select-selector,
      .ant-picker,
      input,
      textarea,
      select {
        background: #ffffff !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line) !important;
        border-radius: 8px !important;
        box-shadow: none !important;
      }

      .ant-input::placeholder,
      input::placeholder,
      textarea::placeholder {
        color: var(--yx-faint) !important;
      }

      .ant-input:focus,
      .ant-input-affix-wrapper-focused,
      .ant-select-focused .ant-select-selector,
      input:focus,
      textarea:focus,
      select:focus {
        border-color: #111827 !important;
        box-shadow: 0 0 0 3px rgba(17, 24, 39, .08) !important;
      }

      .ant-checkbox-inner {
        background: #ffffff !important;
        border-color: #98a2b3 !important;
      }

      .ant-checkbox:hover .ant-checkbox-inner,
      .ant-checkbox-wrapper:hover .ant-checkbox-inner {
        border-color: #111827 !important;
      }

      .ant-checkbox-checked .ant-checkbox-inner,
      .ant-checkbox-indeterminate .ant-checkbox-inner {
        background: #111827 !important;
        border-color: #111827 !important;
      }

      .ant-tabs-nav::before {
        border-color: var(--yx-line-soft) !important;
      }

      .ant-tabs-tab {
        color: var(--yx-muted) !important;
      }

      .ant-tabs-tab-active .ant-tabs-tab-btn,
      .ant-tabs-tab:hover {
        color: var(--yx-text) !important;
      }

      .ant-tabs-ink-bar {
        background: #111827 !important;
      }

      .ant-tag {
        background: #f2f4f7 !important;
        border-color: #e4e7ec !important;
        color: #344054 !important;
        border-radius: 6px !important;
      }

      .ant-alert-info,
      .ant-alert-success,
      .ant-alert-warning,
      .ant-alert-error {
        background: #ffffff !important;
        border-color: var(--yx-line-soft) !important;
        color: var(--yx-text) !important;
      }

      .ant-progress-bg {
        background: #111827 !important;
      }

      .ant-divider,
      .ant-card-bordered,
      .ant-table-cell,
      .ant-list-split .ant-list-item {
        border-color: var(--yx-line-soft) !important;
      }

      .ant-empty-description,
      .ant-select-selection-placeholder {
        color: var(--yx-muted) !important;
      }

      .ant-statistic-title,
      .ant-statistic-title *,
      .qs-metric-card .ant-space-item,
      .ant-pagination-total-text,
      .ant-input-data-count,
      .ant-list-empty-text,
      .ant-alert-message,
      .ant-alert-description,
      .ant-list-item-meta-title {
        color: var(--yx-muted) !important;
      }

      .ant-list-item-meta-title,
      .ant-alert-message {
        color: var(--yx-text) !important;
      }

      .ant-steps-item-process .ant-steps-item-title,
      .ant-steps-item-finish .ant-steps-item-title {
        color: var(--yx-text) !important;
      }

      .ant-steps-item-wait .ant-steps-item-title,
      .ant-steps-item-wait .ant-steps-item-description,
      .ant-steps-item-process .ant-steps-item-description {
        color: var(--yx-muted) !important;
      }

      .qs-section-title,
      .qs-metric-card .value {
        color: var(--yx-text) !important;
      }

      .qs-muted,
      .qs-metric-card .label {
        color: var(--yx-muted) !important;
      }

      .qs-stream-box {
        background: #ffffff !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line-soft) !important;
      }

      .yx-scene-prompt-panel,
      .yx-scene-prompt-panel .ant-card,
      .yx-scene-prompt-panel .ant-card-body,
      .yx-scene-prompt-panel [style*="background"] {
        background: #f8fafc !important;
        color: #1f2937 !important;
        border-color: #d8dee4 !important;
      }

      .yx-scene-prompt-panel,
      .yx-scene-prompt-panel * {
        color: #1f2937 !important;
      }

      .yx-scene-prompt-panel [style*="#8B949E"],
      .yx-scene-prompt-panel [style*="#8b949e"],
      .yx-scene-prompt-panel [style*="#888"],
      .yx-scene-prompt-panel [style*="rgb(139"],
      .yx-scene-prompt-panel .ant-typography-secondary {
        color: #475467 !important;
      }

      .${MARK_CLASS} {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        border: 1px solid #d0d7de;
        border-radius: 12px;
        background: #ffffff;
        color: #111827;
        font-weight: 800;
        font-size: 22px;
        line-height: 1;
        box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
      }

      img[data-yx-hidden-logo="1"] {
        display: block !important;
      }

      .yx-app-icon {
        display: block !important;
        width: 48px !important;
        height: 48px !important;
        object-fit: cover !important;
        border-radius: 14px !important;
        border: 1px solid #d0d7de !important;
        background: #ffffff !important;
        box-shadow: 0 1px 2px rgba(16, 24, 40, .04) !important;
      }

      .yx-brand-area,
      .yx-brand-area * {
        background: transparent !important;
      }

      .yx-brand-area strong,
      .yx-brand-area [style*="font-size: 18"],
      .yx-brand-area [style*="font-size:18"],
      .yx-brand-area [style*="font-weight"] {
        color: #111827 !important;
      }

      .yx-brand-area small,
      .yx-brand-area [style*="font-size: 12"],
      .yx-brand-area [style*="font-size:12"] {
        color: #667085 !important;
      }

      #wanshan-local-llm-panel {
        background: #ffffff !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line-soft) !important;
      }

      #wanshan-local-llm-panel .ws-title::before {
        background: #111827 !important;
      }

      #wanshan-local-llm-panel input,
      #wanshan-local-llm-panel select,
      #wanshan-local-llm-panel button {
        background: #ffffff !important;
        color: var(--yx-text) !important;
        border-color: var(--yx-line) !important;
      }

      #wanshan-local-llm-panel button[data-primary] {
        background: #111827 !important;
        color: #ffffff !important;
      }

      .yx-sidebar-account {
        position: absolute;
        left: 10px;
        right: 10px;
        bottom: 58px;
        z-index: 11;
        padding: 10px;
        border: 1px solid #b7c6ff !important;
        border-radius: 8px !important;
        background: #ffffff !important;
        color: #111827 !important;
        box-shadow: 0 3px 10px rgba(16, 24, 40, .07) !important;
      }

      .yx-sidebar-account-title {
        margin: 0 0 4px;
        color: #111827 !important;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.35;
      }

      .yx-sidebar-account-status {
        min-height: 32px;
        color: #475467 !important;
        font-size: 11px;
        line-height: 1.45;
      }

      .yx-sidebar-account-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 7px;
        margin-top: 8px;
      }

      .yx-model-shortcut-row {
        margin-top: 8px;
      }

      .yx-sidebar-account button {
        min-width: 0;
        height: 30px;
        padding: 0 6px;
        border: 1px solid #111827 !important;
        border-radius: 6px !important;
        background: #111827 !important;
        color: #ffffff !important;
        font-size: 11px;
        font-weight: 750;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
      }

      .yx-sidebar-account button.yx-sidebar-logout {
        border-color: #dc2626 !important;
        background: #ffffff !important;
        color: #dc2626 !important;
      }

      .yx-sidebar-account .yx-model-shortcut {
        width: 100%;
        border-color: rgba(99, 102, 241, .45) !important;
        background: #4f46e5 !important;
        color: #ffffff !important;
      }

      .yx-inline-model-picker {
        display: grid;
        gap: 6px;
        margin: 0 0 14px;
      }

      .yx-inline-model-picker label {
        color: var(--yx-muted) !important;
        font-size: 12px;
        font-weight: 700;
      }

      .yx-inline-model-picker select {
        width: 100%;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--yx-line) !important;
        border-radius: 7px !important;
        background: var(--yx-bg) !important;
        color: var(--yx-text) !important;
        outline: none;
      }

      .yx-inline-model-picker .yx-inline-model-hint {
        color: var(--yx-muted) !important;
        font-size: 12px;
        line-height: 1.4;
      }

      .yx-sidebar-account button:disabled {
        cursor: wait;
        opacity: .65;
      }

      .yx-theme-switch {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 14px;
        width: auto;
        height: 34px;
        margin: 0;
        padding: 3px;
        border: 1px solid var(--yx-line) !important;
        border-radius: 10px !important;
        background: #eef1f5 !important;
        z-index: 10;
      }

      .yx-theme-option {
        display: inline-flex;
        flex: 1 1 0;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 26px;
        padding: 0 8px;
        border: 0 !important;
        border-radius: 7px !important;
        background: transparent !important;
        color: #111827 !important;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        line-height: 1;
      }

      .yx-theme-option:hover {
        background: rgba(17, 24, 39, .06) !important;
      }

      .yx-theme-option.is-active {
        background: #ffffff !important;
        color: #111827 !important;
        box-shadow: 0 1px 2px rgba(16, 24, 40, .08) !important;
      }

      .ant-message .ant-message-notice-content,
      .ant-notification .ant-notification-notice {
        background: #ffffff !important;
        color: #111827 !important;
        border: 1px solid #d8dee4 !important;
        box-shadow: 0 10px 28px rgba(16, 24, 40, .16) !important;
      }

      .ant-message .ant-message-notice-content *,
      .ant-notification .ant-notification-notice * {
        color: inherit !important;
      }

      .ant-message .ant-message-error .anticon,
      .ant-notification .ant-notification-notice-error .anticon {
        color: #dc2626 !important;
      }

      body[data-yx-theme="dark"] {
        color-scheme: dark;
        --yx-bg: #0d1117;
        --yx-surface: #161b22;
        --yx-subtle: #1f2937;
        --yx-line: #30363d;
        --yx-line-soft: #21262d;
        --yx-text: #e6edf3;
        --yx-muted: #7d8590;
        --yx-faint: #6e7681;
        --yx-accent: #6366f1;
        --yx-accent-soft: rgba(99, 102, 241, .18);
        --bg-base: #0d1117;
        --bg-container: #161b22;
        --bg-elevated: #1f2937;
        --border-color: #30363d;
        --border-color-soft: #21262d;
        --text-primary: #e6edf3;
        --text-secondary: #7d8590;
        --primary: #6366f1;
        --primary-soft: #a5b4fc;
      }

      body[data-yx-theme="dark"],
      body[data-yx-theme="dark"] #root,
      body[data-yx-theme="dark"] .ant-app,
      body[data-yx-theme="dark"] .ant-layout,
      body[data-yx-theme="dark"] .ant-layout-has-sider,
      body[data-yx-theme="dark"] .ant-layout > .ant-layout,
      body[data-yx-theme="dark"] .ant-layout-content,
      body[data-yx-theme="dark"] .qs-page {
        background: #0d1117 !important;
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .ant-layout-sider,
      body[data-yx-theme="dark"] .ant-layout-sider-children,
      body[data-yx-theme="dark"] aside,
      body[data-yx-theme="dark"] [class*="sidebar"],
      body[data-yx-theme="dark"] [class*="sider"] {
        background: #161b22 !important;
        color: #e6edf3 !important;
        border-right-color: #21262d !important;
      }

      body[data-yx-theme="dark"] .ant-layout-header,
      body[data-yx-theme="dark"] header {
        background: #0d1117 !important;
        color: #e6edf3 !important;
        border-bottom-color: #21262d !important;
      }

      body[data-yx-theme="dark"] .ant-card,
      body[data-yx-theme="dark"] .qs-card,
      body[data-yx-theme="dark"] .qs-metric-card,
      body[data-yx-theme="dark"] .panel,
      body[data-yx-theme="dark"] [class*="card"],
      body[data-yx-theme="dark"] .ant-card-head,
      body[data-yx-theme="dark"] .ant-card-body,
      body[data-yx-theme="dark"] .ant-drawer-content,
      body[data-yx-theme="dark"] .ant-modal-content,
      body[data-yx-theme="dark"] .ant-popover-inner,
      body[data-yx-theme="dark"] .ant-dropdown-menu,
      body[data-yx-theme="dark"] .ant-table,
      body[data-yx-theme="dark"] .ant-table-container,
      body[data-yx-theme="dark"] .ant-table-thead > tr > th,
      body[data-yx-theme="dark"] .ant-table-tbody > tr > td,
      body[data-yx-theme="dark"] .ant-table-tbody > tr.ant-table-placeholder > td,
      body[data-yx-theme="dark"] .ant-list-item {
        background: #161b22 !important;
        color: #e6edf3 !important;
        border-color: #21262d !important;
      }

      body[data-yx-theme="dark"] .ant-typography,
      body[data-yx-theme="dark"] .ant-form-item-label > label,
      body[data-yx-theme="dark"] .ant-form-item-required,
      body[data-yx-theme="dark"] .ant-steps-item-title,
      body[data-yx-theme="dark"] .ant-select-selection-item,
      body[data-yx-theme="dark"] .ant-radio-wrapper,
      body[data-yx-theme="dark"] .ant-checkbox-wrapper,
      body[data-yx-theme="dark"] .ant-table,
      body[data-yx-theme="dark"] .ant-tabs,
      body[data-yx-theme="dark"] .ant-list,
      body[data-yx-theme="dark"] h1,
      body[data-yx-theme="dark"] h2,
      body[data-yx-theme="dark"] h3,
      body[data-yx-theme="dark"] h4,
      body[data-yx-theme="dark"] h5,
      body[data-yx-theme="dark"] h6,
      body[data-yx-theme="dark"] p,
      body[data-yx-theme="dark"] span,
      body[data-yx-theme="dark"] label,
      body[data-yx-theme="dark"] strong,
      body[data-yx-theme="dark"] pre {
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .ant-typography-secondary,
      body[data-yx-theme="dark"] .ant-form-item-extra,
      body[data-yx-theme="dark"] .ant-form-item-explain,
      body[data-yx-theme="dark"] .ant-steps-item-description,
      body[data-yx-theme="dark"] .ant-steps-item-wait .ant-steps-item-title,
      body[data-yx-theme="dark"] .ant-statistic-title,
      body[data-yx-theme="dark"] .ant-pagination-total-text,
      body[data-yx-theme="dark"] .ant-input-data-count,
      body[data-yx-theme="dark"] .ant-list-empty-text,
      body[data-yx-theme="dark"] .ant-alert-description,
      body[data-yx-theme="dark"] .ant-empty-description,
      body[data-yx-theme="dark"] small,
      body[data-yx-theme="dark"] .subtle,
      body[data-yx-theme="dark"] .empty,
      body[data-yx-theme="dark"] [class*="secondary"] {
        color: #7d8590 !important;
      }

      body[data-yx-theme="dark"] .ant-menu,
      body[data-yx-theme="dark"] .ant-menu-root,
      body[data-yx-theme="dark"] .ant-menu-sub,
      body[data-yx-theme="dark"] .ant-menu-item,
      body[data-yx-theme="dark"] .ant-menu-submenu-title {
        background: transparent !important;
        color: #c9d1d9 !important;
      }

      body[data-yx-theme="dark"] .ant-menu-item-selected,
      body[data-yx-theme="dark"] .ant-menu-item-active,
      body[data-yx-theme="dark"] .ant-menu-submenu-selected > .ant-menu-submenu-title,
      body[data-yx-theme="dark"] .nav.active {
        background: rgba(99, 102, 241, .18) !important;
        color: #a5b4fc !important;
      }

      body[data-yx-theme="dark"] .ant-menu-item:hover,
      body[data-yx-theme="dark"] .ant-menu-submenu-title:hover,
      body[data-yx-theme="dark"] .nav:hover {
        background: rgba(255, 255, 255, .04) !important;
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .ant-btn {
        background: #161b22 !important;
        color: #e6edf3 !important;
        border-color: #30363d !important;
      }

      body[data-yx-theme="dark"] .ant-btn-primary,
      body[data-yx-theme="dark"] button[data-primary],
      body[data-yx-theme="dark"] .primary {
        background: #6366f1 !important;
        border-color: #6366f1 !important;
        color: #ffffff !important;
      }

      body[data-yx-theme="dark"] .ant-input,
      body[data-yx-theme="dark"] .ant-input-affix-wrapper,
      body[data-yx-theme="dark"] .ant-input-number,
      body[data-yx-theme="dark"] .ant-select-selector,
      body[data-yx-theme="dark"] .ant-picker,
      body[data-yx-theme="dark"] .qs-stream-box,
      body[data-yx-theme="dark"] input,
      body[data-yx-theme="dark"] textarea,
      body[data-yx-theme="dark"] select {
        background: #0d1117 !important;
        color: #e6edf3 !important;
        border-color: #30363d !important;
      }

      body[data-yx-theme="dark"] .ant-tabs-ink-bar,
      body[data-yx-theme="dark"] .qs-section-title:before,
      body[data-yx-theme="dark"] #wanshan-local-llm-panel .ws-title::before {
        background: #6366f1 !important;
      }

      body[data-yx-theme="dark"] .ant-tabs-tab-active .ant-tabs-tab-btn,
      body[data-yx-theme="dark"] .ant-tabs-tab:hover {
        color: #a5b4fc !important;
      }

      body[data-yx-theme="dark"] .ant-tag {
        background: #21262d !important;
        border-color: #30363d !important;
        color: #c9d1d9 !important;
      }

      body[data-yx-theme="dark"] .ant-alert-info,
      body[data-yx-theme="dark"] .ant-alert-success,
      body[data-yx-theme="dark"] .ant-alert-warning,
      body[data-yx-theme="dark"] .ant-alert-error {
        background: #161b22 !important;
        border-color: #30363d !important;
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .ant-message .ant-message-notice-content,
      body[data-yx-theme="dark"] .ant-notification .ant-notification-notice {
        background: #1f2937 !important;
        color: #f8fafc !important;
        border-color: #3b4656 !important;
        box-shadow: 0 12px 30px rgba(0, 0, 0, .38) !important;
      }

      body[data-yx-theme="dark"] .ant-message .ant-message-error .anticon,
      body[data-yx-theme="dark"] .ant-notification .ant-notification-notice-error .anticon {
        color: #fb7185 !important;
      }

      body[data-yx-theme="dark"] .ant-checkbox-inner {
        background: #0d1117 !important;
        border-color: #30363d !important;
      }

      body[data-yx-theme="dark"] .ant-checkbox-checked .ant-checkbox-inner,
      body[data-yx-theme="dark"] .ant-checkbox-indeterminate .ant-checkbox-inner {
        background: #6366f1 !important;
        border-color: #6366f1 !important;
      }

      body[data-yx-theme="dark"] .yx-app-icon {
        border-color: #30363d !important;
        background: #0d1117 !important;
      }

      body[data-yx-theme="dark"] .yx-brand-area strong,
      body[data-yx-theme="dark"] .yx-brand-area [style*="font-size: 18"],
      body[data-yx-theme="dark"] .yx-brand-area [style*="font-size:18"],
      body[data-yx-theme="dark"] .yx-brand-area [style*="font-weight"] {
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .yx-brand-area small,
      body[data-yx-theme="dark"] .yx-brand-area [style*="font-size: 12"],
      body[data-yx-theme="dark"] .yx-brand-area [style*="font-size:12"] {
        color: #7d8590 !important;
      }

      body[data-yx-theme="dark"] .yx-theme-switch {
        background: #0d1117 !important;
        border-color: #30363d !important;
      }

      body[data-yx-theme="dark"] .yx-sidebar-account {
        border-color: #30446f !important;
        background: #101b35 !important;
        color: #e6edf3 !important;
        box-shadow: none !important;
      }

      body[data-yx-theme="dark"] .yx-sidebar-account-title {
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .yx-sidebar-account-status {
        color: #a8c0df !important;
      }

      body[data-yx-theme="dark"] .yx-sidebar-account button {
        border-color: #7c8df8 !important;
        background: #6572e8 !important;
        color: #ffffff !important;
      }

      body[data-yx-theme="dark"] .yx-sidebar-account button.yx-sidebar-logout {
        border-color: #fb7185 !important;
        background: transparent !important;
        color: #fecdd3 !important;
      }

      body[data-yx-theme="dark"] .yx-theme-option {
        color: #c9d1d9 !important;
      }

      body[data-yx-theme="dark"] .yx-theme-option:hover {
        background: rgba(255, 255, 255, .05) !important;
      }

      body[data-yx-theme="dark"] .yx-theme-option.is-active {
        background: #21262d !important;
        color: #e6edf3 !important;
        box-shadow: none !important;
      }

      body[data-yx-theme="dark"] .yx-scene-prompt-panel,
      body[data-yx-theme="dark"] .yx-scene-prompt-panel .ant-card,
      body[data-yx-theme="dark"] .yx-scene-prompt-panel .ant-card-body,
      body[data-yx-theme="dark"] .yx-scene-prompt-panel [style*="background"] {
        background: #101827 !important;
        color: #e6edf3 !important;
        border-color: #30446f !important;
      }

      body[data-yx-theme="dark"] .yx-scene-prompt-panel,
      body[data-yx-theme="dark"] .yx-scene-prompt-panel * {
        color: #e6edf3 !important;
      }

      body[data-yx-theme="dark"] .yx-scene-prompt-panel [style*="#8B949E"],
      body[data-yx-theme="dark"] .yx-scene-prompt-panel [style*="#8b949e"],
      body[data-yx-theme="dark"] .yx-scene-prompt-panel [style*="#888"],
      body[data-yx-theme="dark"] .yx-scene-prompt-panel [style*="rgb(139"],
      body[data-yx-theme="dark"] .yx-scene-prompt-panel .ant-typography-secondary {
        color: #a8c0df !important;
      }

      body[data-yx-theme="dark"] #wanshan-local-llm-panel {
        background: #161b22 !important;
        color: #e6edf3 !important;
        border-color: #30363d !important;
      }

      body[data-yx-theme="dark"] #wanshan-local-llm-panel input,
      body[data-yx-theme="dark"] #wanshan-local-llm-panel select,
      body[data-yx-theme="dark"] #wanshan-local-llm-panel button {
        background: #0d1117 !important;
        color: #e6edf3 !important;
        border-color: #30363d !important;
      }

      body[data-yx-theme="dark"] [style*="background: #fff"],
      body[data-yx-theme="dark"] [style*="background:#fff"],
      body[data-yx-theme="dark"] [style*="background: #FFF"],
      body[data-yx-theme="dark"] [style*="background:#FFF"],
      body[data-yx-theme="dark"] [style*="background-color: #fff"],
      body[data-yx-theme="dark"] [style*="background-color:#fff"],
      body[data-yx-theme="dark"] [style*="background-color: #FFF"],
      body[data-yx-theme="dark"] [style*="background-color:#FFF"],
      body[data-yx-theme="dark"] [style*="background: rgb(255, 255, 255)"],
      body[data-yx-theme="dark"] [style*="background-color: rgb(255, 255, 255)"] {
        background: #0d1117 !important;
        color: #e6edf3 !important;
        border-color: #30363d !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getThemeMode() {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function setThemeMode(mode) {
    const nextMode = mode === 'dark' ? 'dark' : 'light';
    document.body.dataset.yxTheme = nextMode;
    try {
      localStorage.setItem(THEME_KEY, nextMode);
    } catch (_) {
      // Local storage may be unavailable in restricted shells; the dataset still works.
    }
    syncThemeToggle();
    normalizeBrandBlocks();
  }

  function syncThemeToggle() {
    const mode = document.body.dataset.yxTheme === 'dark' ? 'dark' : 'light';
    for (const switchEl of Array.from(document.querySelectorAll('.yx-theme-switch'))) {
      switchEl.setAttribute('aria-label', `当前为${mode === 'dark' ? '夜间' : '日间'}模式`);
    }
    for (const button of Array.from(document.querySelectorAll('.yx-theme-option'))) {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function replaceTextNode(node) {
    let text = node.nodeValue || '';
    const original = text;
    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }
    if (text !== original) node.nodeValue = text;
  }

  function replaceVisibleText(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
          return /万山|千山|qianshanAI|Qianshan|qianshanai\.cn|www\.qianshanai\.cn/.test(node.nodeValue || '')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      },
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceTextNode);
  }

  function sanitizeUserVisibleText(value) {
    const text = String(value || '');
    if (/api[\s_-]*key|Authentication Fails|invalid_request_error|unauthorized|forbidden/i.test(text)) {
      return text
        .replace(/api key[^"',，。；;:]*[:：]?\s*["']?[*A-Za-z0-9_.-]{4,}["']?/ig, 'API Key')
        .replace(/\{["']?error["']?[\s\S]{0,800}$/i, 'API Key 无效或无权限，请检查模型配置或切换官方算力')
        .replace(/OpenAI API 401:.*/i, 'OpenAI API 401: API Key 无效或无权限，请检查模型配置或切换官方算力');
    }
    return text;
  }

  function scrubSensitiveErrorText(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return /api[\s_-]*key|Authentication Fails|invalid_request_error/i.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const sanitized = sanitizeUserVisibleText(node.nodeValue || '');
      if (sanitized !== node.nodeValue) node.nodeValue = sanitized;
    });
  }

  function scrubTransientGenerationErrorToasts(root = document.body) {
    if (!root) return;
    for (const node of Array.from(root.querySelectorAll('.ant-message-notice, .ant-notification-notice, [role="alert"], [role="status"]'))) {
      const text = node.textContent || '';
      if (/TimeoutError: The operation was aborted due to timeout|operation was aborted due to timeout/i.test(text)) {
        node.remove();
      }
    }
  }

  function scrubQianshanLinks() {
    const isQianshanLink = (value) => /qianshan/i.test(String(value || ''));
    for (const link of Array.from(document.querySelectorAll('a[href], .ant-typography a[href]'))) {
      const href = link.getAttribute('href') || '';
      const label = link.textContent || '';
      if (!isQianshanLink(href) && !isQianshanLink(label)) continue;
      const span = document.createElement('span');
      span.className = 'yx-scrubbed-link';
      span.textContent = /llm|模型|配置|网页端/i.test(label + href) ? '运营虾本地配置' : '运营虾';
      link.replaceWith(span);
    }

    for (const el of Array.from(document.querySelectorAll('button, [role="link"], [onclick]'))) {
      const label = el.textContent || '';
      if (!isQianshanLink(label)) continue;
      const clean = el.cloneNode(true);
      clean.removeAttribute('onclick');
      clean.removeAttribute('role');
      clean.textContent = /llm|模型|配置|网页端/i.test(label) ? '运营虾本地配置' : '运营虾';
      clean.style.pointerEvents = 'none';
      clean.style.cursor = 'default';
      el.replaceWith(clean);
    }
  }

  function installQianshanNavigationGuard() {
    if (window.__yxQianshanNavigationGuardInstalled) return;
    window.__yxQianshanNavigationGuardInstalled = true;
    const isQianshanUrl = (value) => /qianshanai\.cn|api\.qianshanai\.cn|www\.qianshanai\.cn/i.test(String(value || ''));
    const block = (event, label = '运营虾已改为本地/官方算力配置，不再打开千山配置页') => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
      notifyBackgroundGeneration(label);
      return false;
    };
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a[href], button, [role="link"], [role="button"]');
      if (!link) return;
      const href = link.getAttribute?.('href') || link.getAttribute?.('data-url') || link.getAttribute?.('data-href') || '';
      const label = link.textContent || '';
      if (isQianshanUrl(href) || isQianshanUrl(label)) block(event);
    }, true);
    const originalOpen = window.open;
    window.open = function patchedWindowOpen(url, ...args) {
      if (isQianshanUrl(url)) return block(null);
      return originalOpen.call(window, url, ...args);
    };
    const api = window.electronAPI;
    if (api && typeof api.openExternal === 'function' && !api.__yxOpenExternalPatched) {
      const originalOpenExternal = api.openExternal.bind(api);
      api.openExternal = (url, ...args) => {
        if (isQianshanUrl(url)) return Promise.resolve(block(null));
        return originalOpenExternal(url, ...args);
      };
      api.__yxOpenExternalPatched = true;
    }
  }

  function workspaceCacheKey() {
    const route = `${location.pathname}${location.search || ''}`;
    if (/\/topic/.test(route)) return `${WORKSPACE_CACHE_PREFIX}topic`;
    if (/\/copywriting/.test(route)) return `${WORKSPACE_CACHE_PREFIX}copywriting`;
    if (/\/video/.test(route)) return `${WORKSPACE_CACHE_PREFIX}video`;
    return '';
  }

  function readWorkspaceCache() {
    const key = workspaceCacheKey();
    if (!key) return {};
    try {
      return JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function writeWorkspaceCache(patch) {
    const key = workspaceCacheKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ ...readWorkspaceCache(), ...patch, updatedAt: Date.now() }));
    } catch (_) {
      // Cache is best effort only.
    }
  }

  function isFormControl(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  }

  function isVisibleWorkspaceControl(el) {
    if (!isFormControl(el) || !el.isConnected) return false;
    if (el.closest('[hidden], [aria-hidden="true"], .ant-tabs-tabpane-hidden, .ant-select-dropdown-hidden')) return false;
    let node = el;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      node = node.parentElement;
    }
    const rects = el.getClientRects();
    return rects && rects.length > 0;
  }

  function semanticFieldLabel(el) {
    const item = el.closest('.ant-form-item');
    const label = item?.querySelector('label')?.textContent?.trim();
    if (label) return label.replace(/\s+/g, ' ').slice(0, 80);
    return '';
  }

  function coverFieldCacheName(el) {
    if (!/\/video/.test(`${location.pathname}${location.search || ''}`)) return '';
    const direct = el.getAttribute('name') || el.id || '';
    const placeholder = el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
    const label = semanticFieldLabel(el);
    const scope = el.closest('.qs-card, .ant-card, form, section, article');
    const scopeText = (scope?.textContent || '').replace(/\s+/g, ' ').slice(0, 1200);
    const looksLikeCover =
      /封面参数|生成封面|已生成封面/.test(scopeText) ||
      /主标题|副标题|背景图|封面|AI 背景/.test(`${label} ${placeholder}`) ||
      /^(title|subtitle|bgPromptCN|backgroundPath)$/.test(direct);
    if (!looksLikeCover) return '';
    const key = direct || label || placeholder;
    if (!key) return '';
    return `cover:${key.trim().slice(0, 80)}`;
  }

  function fieldCacheName(el) {
    if (!el || el.disabled || el.readOnly) return '';
    const coverName = coverFieldCacheName(el);
    if (coverName) return coverName;
    const direct = el.getAttribute('name') || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.id;
    if (direct) return direct.trim().slice(0, 80);
    const label = semanticFieldLabel(el);
    if (label) return label.slice(0, 80);
    return '';
  }

  function restoreWorkspaceCache() {
    const cache = readWorkspaceCache();
    const fields = cache.fields || {};
    for (const el of Array.from(document.querySelectorAll('input, textarea, select'))) {
      if (!isVisibleWorkspaceControl(el)) continue;
      const name = fieldCacheName(el);
      if (!name || !(name in fields)) continue;
      const value = fields[name];
      if (typeof value !== 'string' || el.value === value) continue;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter ? setter.call(el, value) : (el.value = value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function installWorkspaceCache() {
    if (window.__yxWorkspaceCacheInstalled) {
      restoreWorkspaceCache();
      return;
    }
    window.__yxWorkspaceCacheInstalled = true;
    const persist = (event) => {
      const target = event.target;
      if (!isFormControl(target)) return;
      if (!isVisibleWorkspaceControl(target)) return;
      const name = fieldCacheName(target);
      if (!name) return;
      const cache = readWorkspaceCache();
      writeWorkspaceCache({ fields: { ...(cache.fields || {}), [name]: target.value || '' } });
    };
    document.addEventListener('input', persist, true);
    document.addEventListener('change', persist, true);
    document.addEventListener('blur', persist, true);
    window.addEventListener('focus', restoreWorkspaceCache);
    window.addEventListener('popstate', restoreWorkspaceCache);
    window.addEventListener('hashchange', restoreWorkspaceCache);
    restoreWorkspaceCache();
    setTimeout(restoreWorkspaceCache, 120);
    setTimeout(restoreWorkspaceCache, 450);
    setTimeout(restoreWorkspaceCache, 1200);
  }

  function isVideoWorkbenchRoute() {
    return /\/video/.test(`${location.pathname}${location.search || ''}${location.hash || ''}`);
  }

  function isCopywritingWorkbenchRoute() {
    return /\/copywriting/.test(`${location.pathname}${location.search || ''}${location.hash || ''}`);
  }

  function isGenerationKeepaliveRequest(method, url) {
    if (String(method || 'GET').toUpperCase() !== 'POST') return false;
    const text = String(url || '');
    return GENERATION_KEEPALIVE_ROUTES.some((rule) => rule.test(text));
  }

  function shouldAllowGenerationAbort() {
    return Number(window.__yxAllowGenerationAbortUntil || 0) > Date.now();
  }

  function isBenignGenerationAbortError(error) {
    const message = String(error?.message || error?.reason || error || '');
    return /TimeoutError: The operation was aborted due to timeout|operation was aborted due to timeout|AbortError|aborted|canceled|cancelled|HTTP 0/i.test(message)
      && hasActiveGeneration();
  }

  function markGenerationCancelIntent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('button, [role="button"], .ant-btn, a[href]');
    const label = (control?.textContent || '').replace(/\s+/g, '');
    if (!label || !/停止|取消|终止|关闭生成|放弃生成/.test(label)) return;
    window.__yxAllowGenerationAbortUntil = Date.now() + 2500;
  }

  function notifyBackgroundGeneration(message) {
    const id = 'yx-background-generation-toast';
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.setAttribute('role', 'status');
      Object.assign(toast.style, {
        position: 'fixed',
        right: '24px',
        bottom: '24px',
        zIndex: '10001',
        maxWidth: '340px',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(99, 102, 241, .32)',
        background: document.body.dataset.yxTheme === 'dark' ? '#111827' : '#ffffff',
        color: document.body.dataset.yxTheme === 'dark' ? '#e6edf3' : '#111827',
        boxShadow: '0 12px 28px rgba(15, 23, 42, .22)',
        fontSize: '13px',
        lineHeight: '1.45',
      });
      document.body.appendChild(toast);
    }
    toast.textContent = sanitizeUserVisibleText(message);
    clearTimeout(window.__yxBackgroundGenerationToastTimer);
    window.__yxBackgroundGenerationToastTimer = window.setTimeout(() => toast?.remove(), 7000);
  }

  function extractGenerationText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(extractGenerationText).filter(Boolean).join('\n\n').trim();
    if (typeof value !== 'object') return '';
    const direct = [
      value.content,
      value.text,
      value.finalText,
      value.final_text,
      value.body,
      value.result,
      value.output,
      value.data,
    ];
    for (const item of direct) {
      const text = extractGenerationText(item);
      if (text) return text;
    }
    return '';
  }

  function persistGenerationResult(url, ok, error, content) {
    const record = {
      url: String(url || ''),
      kind: generationKind(url),
      ok: Boolean(ok),
      error: error ? String(error).slice(0, 240) : '',
      content: String(content || '').trim().slice(-12000),
      finishedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(GENERATION_RESULT_KEY, JSON.stringify(record));
    } catch {}
    return record;
  }

  function readGenerationResult() {
    try {
      const record = JSON.parse(localStorage.getItem(GENERATION_RESULT_KEY) || 'null');
      if (!record || Date.now() - new Date(record.finishedAt || 0).getTime() > 6 * 60 * 60 * 1000) return null;
      return record;
    } catch {
      return null;
    }
  }

  function restoreGenerationResultToPanel() {
    const record = readGenerationResult() || readGenerationPanelSnapshot();
    if (!record || !record.ok || !record.content) return;
    if (isCopywritingWorkbenchRoute() && record.kind !== '文案') return;
    if (isVideoWorkbenchRoute() && record.kind !== '视频') return;
    const panel = findGenerationPanel();
    const streamBox = panel?.querySelector('.qs-stream-box, textarea, pre');
    if (!streamBox) return;
    const shouldRestore = (text) => !String(text || '').trim() || /等待流式输出|点左侧|开始生成|当前页面的进度条可能不会恢复/.test(String(text || ''));
    if (streamBox instanceof HTMLTextAreaElement) {
      if (shouldRestore(streamBox.value)) {
        streamBox.value = record.content;
        streamBox.dispatchEvent(new Event('input', { bubbles: true }));
        streamBox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    if (shouldRestore(streamBox.textContent || '')) streamBox.textContent = record.content;
  }

  function generationPanelKindForRoute() {
    if (isCopywritingWorkbenchRoute()) return '文案';
    if (isVideoWorkbenchRoute()) return '视频';
    return '';
  }

  function readGenerationPanelSnapshot() {
    try {
      const record = JSON.parse(localStorage.getItem(GENERATION_PANEL_SNAPSHOT_KEY) || 'null');
      if (!record || Date.now() - Number(record.savedAt || 0) > 6 * 60 * 60 * 1000) return null;
      return record;
    } catch {
      return null;
    }
  }

  function persistVisibleGenerationPanelContent() {
    const kind = generationPanelKindForRoute();
    if (!kind) return;
    const panel = findGenerationPanel();
    const streamBox = panel?.querySelector('.qs-stream-box, textarea, pre');
    if (!streamBox) return;
    const content = String(streamBox instanceof HTMLTextAreaElement ? streamBox.value : streamBox.textContent || '').trim();
    if (content.length < 2 || /等待流式输出|点左侧/.test(content)) return;
    try {
      localStorage.setItem(GENERATION_PANEL_SNAPSHOT_KEY, JSON.stringify({
        kind,
        ok: true,
        content: content.slice(-12000),
        savedAt: Date.now(),
      }));
    } catch {}
  }

  function installGenerationPanelSnapshot() {
    if (window.__yxGenerationPanelSnapshotInstalled) return;
    window.__yxGenerationPanelSnapshotInstalled = true;
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = function patchedGenerationConfirm(message) {
      if (/正在生成内容|切换页面不会主动中断|会丢失当前进度显示|确定要离开吗/i.test(String(message || ''))) {
        return true;
      }
      return originalConfirm.call(globalThis, message);
    };
    window.setInterval(() => {
      persistVisibleGenerationPanelContent();
      restoreGenerationResultToPanel();
    }, 1000);
  }

  function markGenerationRequestDone(url, ok, error, content = '') {
    const benignAbort = !ok && isBenignGenerationAbortError(error);
    if (!benignAbort || String(content || '').trim()) {
      persistGenerationResult(url, ok, error, content);
    }
    removeActiveGenerationRequest(url);
    if (ok) {
      notifyBackgroundGeneration('生成已完成。结果已由本地服务处理，回到对应页面后可查看列表或继续操作。');
    } else if (error && !benignAbort) {
      notifyBackgroundGeneration(`生成失败：${String(error).slice(0, 80)}`);
    }
    mountBackgroundGenerationStatus();
    restoreGenerationResultToPanel();
  }

  function generationKind(url) {
    const text = String(url || '');
    if (/\/copywriting\//i.test(text)) return '文案';
    if (/\/video\/|\/one-click\//i.test(text)) return '视频';
    return '内容';
  }

  function readActiveGenerationRequests() {
    try {
      const raw = JSON.parse(localStorage.getItem(GENERATION_ACTIVE_KEY) || '[]').filter(Boolean);
      const currentSession = raw.filter((item) => item.sessionId === GENERATION_SESSION_ID);
      if (currentSession.length !== raw.length) writeActiveGenerationRequests(currentSession);
      return currentSession;
    } catch {
      return [];
    }
  }

  function writeActiveGenerationRequests(items) {
    try {
      const fresh = items
        .filter((item) => item.sessionId === GENERATION_SESSION_ID)
        .filter((item) => Date.now() - Number(item.startedAt || 0) < 30 * 60 * 1000);
      localStorage.setItem(GENERATION_ACTIVE_KEY, JSON.stringify(fresh));
    } catch {}
  }

  function markGenerationRequestStarted(url) {
    const key = String(url || '');
    const items = readActiveGenerationRequests().filter((item) => item.url !== key);
    items.push({ url: key, kind: generationKind(key), sessionId: GENERATION_SESSION_ID, startedAt: Date.now(), progress: 0, step: '准备生成', content: '' });
    writeActiveGenerationRequests(items);
    mountBackgroundGenerationStatus();
  }

  function updateActiveGenerationRequest(url, patch) {
    const key = String(url || '');
    const items = readActiveGenerationRequests();
    const index = items.findIndex((item) => item.url === key);
    if (index < 0) return;
    items[index] = {
      ...items[index],
      ...patch,
      updatedAt: Date.now(),
      content: String(patch.content ?? items[index].content ?? '').slice(-12000),
    };
    writeActiveGenerationRequests(items);
    mountBackgroundGenerationStatus();
  }

  function removeActiveGenerationRequest(url) {
    const key = String(url || '');
    writeActiveGenerationRequests(readActiveGenerationRequests().filter((item) => item.url !== key));
  }

  function hasActiveGeneration(kind) {
    const items = readActiveGenerationRequests();
    if (!kind) return items.length > 0;
    return items.some((item) => item.kind === kind);
  }

  function findGenerationPanel() {
    const title = Array.from(document.querySelectorAll('.qs-section-title, h1, h2, h3, h4, strong, b, div, span'))
      .find((node) => {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        return /^AI\s*实时生成$/.test(text);
      });
    if (!title) return null;

    let node = title.parentElement;
    while (node && node !== document.body) {
      if (node.id === 'yx-background-generation-status') return null;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const rect = node.getBoundingClientRect();
      const hasStreamBox = Boolean(node.querySelector('.qs-stream-box, textarea, pre'));
      const isPanel =
        (node.classList.contains('ant-card') || node.classList.contains('qs-card') || node.matches('section, article')) &&
        text.includes('AI 实时生成') &&
        text.length < 2200 &&
        (hasStreamBox || (rect.width > 240 && rect.height > 100));
      if (isPanel) return node;
      node = node.parentElement;
    }
    return null;
  }

  function mountInlineGenerationStatus(items) {
    const panel = findGenerationPanel();
    const active = items.find((item) => {
      if (isCopywritingWorkbenchRoute()) return item.kind === '文案';
      if (isVideoWorkbenchRoute()) return item.kind === '视频';
      return true;
    });
    document.querySelectorAll('.yx-inline-generation-status').forEach((node) => {
      if (!panel || !panel.contains(node)) node.remove();
    });
    if (!panel || !active) return;
    let box = panel.querySelector('.yx-inline-generation-status');
    if (!box) {
      box = document.createElement('div');
      box.className = 'yx-inline-generation-status';
      Object.assign(box.style, {
        margin: '12px 0',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(45, 212, 191, .35)',
        background: document.body.dataset.yxTheme === 'dark' ? '#0f172a' : '#f8fafc',
        color: document.body.dataset.yxTheme === 'dark' ? '#e6edf3' : '#111827',
        fontSize: '13px',
        lineHeight: '1.55',
        whiteSpace: 'pre-wrap',
      });
    }
    const anchor = Array.from(panel.children)
      .find((child) => /点左侧.*开始生成|AI 会依次/.test((child.textContent || '').replace(/\s+/g, ' ').trim()));
    const title = Array.from(panel.querySelectorAll('.qs-section-title, h1, h2, h3, h4, strong, b, div'))
      .find((child) => /^AI\s*实时生成$/.test((child.textContent || '').replace(/\s+/g, ' ').trim()));
    if (anchor && anchor.nextElementSibling !== box) anchor.after(box);
    else if (!anchor && title && title.nextElementSibling !== box) title.after(box);
    else if (!box.parentElement) panel.appendChild(box);
    const pct = Math.max(0, Math.min(100, Math.round(Number(active.progress || 0) * (Number(active.progress || 0) <= 1 ? 100 : 1))));
    const content = String(active.content || '').trim();
    box.textContent = content
      ? `后台生成中 ${pct}% · ${active.step || '生成中'}\n\n${content.slice(-3000)}`
      : `后台生成中 ${pct}% · ${active.step || '等待模型返回'}\n\n页面切回来会继续显示当前任务结果。`;
  }

  function mountBackgroundGenerationStatus() {
    const panel = document.getElementById('yx-background-generation-status');
    panel?.remove();
    const items = readActiveGenerationRequests();
    if (!items.length) {
      document.querySelectorAll('.yx-inline-generation-status').forEach((node) => node.remove());
      document.querySelectorAll('[data-yx-background-disabled="1"]').forEach((button) => {
        const wasDisabled = button.getAttribute('data-yx-prev-disabled') === '1';
        button.removeAttribute('data-yx-background-disabled');
        button.removeAttribute('data-yx-prev-disabled');
        if (!wasDisabled) button.removeAttribute('disabled');
        button.style.opacity = '';
        button.style.pointerEvents = '';
      });
      restoreGenerationResultToPanel();
      return;
    }
    mountInlineGenerationStatus(items);
    const activeTextKinds = new Set(items.map((item) => item.kind));
    for (const button of Array.from(document.querySelectorAll('button, .ant-btn, [role="button"]'))) {
      const label = (button.textContent || '').replace(/\s+/g, '');
      const isCopyButton = /生成文案|一键生成文案|素材改写|文稿加工/.test(label);
      const isVideoButton = /生成视频|一键成片|开始生成|批量生成/.test(label);
      if ((activeTextKinds.has('文案') && isCopyButton) || (activeTextKinds.has('视频') && isVideoButton)) {
        if (!button.hasAttribute('data-yx-background-disabled')) {
          button.setAttribute('data-yx-prev-disabled', button.hasAttribute('disabled') ? '1' : '0');
        }
        button.setAttribute('data-yx-background-disabled', '1');
        button.setAttribute('disabled', 'true');
        button.style.opacity = '.62';
        button.style.pointerEvents = 'none';
      }
    }
  }

  function summarizeGenerationResponse(text) {
    const body = String(text || '');
    const errorLine = body.match(/"type"\s*:\s*"error"[\s\S]{0,240}/i);
    if (errorLine) {
      const message = errorLine[0].match(/"error"\s*:\s*"([^"]+)"/i)?.[1];
      return { ok: false, error: message || '生成服务返回错误' };
    }
    if (/"success"\s*:\s*false/i.test(body)) {
      const message = body.match(/"error"\s*:\s*"([^"]+)"/i)?.[1];
      return { ok: false, error: message || '生成失败' };
    }
    return { ok: true, error: '' };
  }

  function modelApi(endpoint, options = {}, fetchImpl = window.fetch) {
    return fetchImpl.call(window, `${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    }).then((res) => res.json().catch(() => ({})));
  }

  function modelChoice(key, fallback = 'custom') {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function setModelChoice(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  function textModelChoice() {
    return modelChoice(TEXT_MODEL_CHOICE_KEY, 'official');
  }

  function imageModelChoice() {
    return modelChoice(IMAGE_MODEL_CHOICE_KEY, 'official');
  }

  function syncTextModelChoice(fetchImpl = window.fetch) {
    const aiSource = textModelChoice() === 'official' ? 'official' : 'custom';
    return modelApi('/api/llm/ai-source', {
      method: 'POST',
      body: JSON.stringify({ aiSource }),
    }, fetchImpl).catch(() => undefined);
  }

  function syncImageModelChoice(fetchImpl = window.fetch) {
    const imageSource = imageModelChoice() === 'official' ? 'official' : 'custom';
    return modelApi('/api/llm/local-image-source', {
      method: 'POST',
      body: JSON.stringify({ imageSource }),
    }, fetchImpl).catch(() => undefined);
  }

  function inlineModelCard(regex) {
    const candidates = Array.from(document.querySelectorAll('.ant-card, section, article, form, div'));
    return candidates.find((node) => {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      return regex.test(text) && text.length < 2600;
    });
  }

  function insertBeforeActionButton(card, picker, buttonRegex) {
    const buttons = Array.from(card.querySelectorAll('button, .ant-btn, [role="button"]'));
    const action = buttons.find((button) => buttonRegex.test((button.textContent || '').replace(/\s+/g, '')));
    if (action) {
      const wrapper = action.closest('.ant-form-item, div') || action;
      wrapper.insertAdjacentElement('beforebegin', picker);
    } else {
      card.appendChild(picker);
    }
  }

  async function mountCopywritingModelPicker() {
    if (!isCopywritingWorkbenchRoute()) {
      document.querySelectorAll('[data-yx-model-picker="copywriting"]').forEach((node) => node.remove());
      return;
    }
    const card = inlineModelCard(/创作参数|选题|一键生成文案/);
    if (!card || card.querySelector('[data-yx-model-picker="copywriting"]')) return;
    const picker = document.createElement('div');
    picker.className = 'yx-inline-model-picker';
    picker.dataset.yxModelPicker = 'copywriting';
    picker.innerHTML = `
      <label>文案模型</label>
      <select data-yx-model-select="copywriting">
        <option value="official">官方文案模型（积分）</option>
        <option value="custom">本地自定义模型</option>
      </select>
      <div class="yx-inline-model-hint">选择官方模型会消耗账号算力积分；选择本地模型则使用你保存的 API Key。</div>`;
    const select = picker.querySelector('select');
    select.value = textModelChoice();
    select.addEventListener('change', () => {
      setModelChoice(TEXT_MODEL_CHOICE_KEY, select.value);
      void syncTextModelChoice();
    });
    insertBeforeActionButton(card, picker, /一键生成文案|开始生成|生成文案/);
    void modelApi('/api/llm/local-config')
      .then((res) => {
        const cfg = res.data || res;
        const local = String(cfg.model || '').trim();
        if (local) select.querySelector('option[value="custom"]').textContent = `${local}（本地）`;
      })
      .catch(() => undefined);
    void syncTextModelChoice();
  }

  async function mountImageModelPicker() {
    if (!isVideoWorkbenchRoute()) {
      document.querySelectorAll('[data-yx-model-picker="image"]').forEach((node) => node.remove());
      return;
    }
    const card = inlineModelCard(/封面参数|生成封面|已生成封面|封面生成/);
    if (!card || card.querySelector('[data-yx-model-picker="image"]')) return;
    const picker = document.createElement('div');
    picker.className = 'yx-inline-model-picker';
    picker.dataset.yxModelPicker = 'image';
    picker.innerHTML = `
      <label>图片模型</label>
      <select data-yx-model-select="image">
        <option value="official">image-2（官方）</option>
        <option value="custom">本地自定义图片模型</option>
      </select>
      <div class="yx-inline-model-hint">选择官方图片模型会消耗账号算力积分；选择本地模型则使用你保存的图片 API Key。</div>`;
    const select = picker.querySelector('select');
    select.value = imageModelChoice();
    select.addEventListener('change', () => {
      setModelChoice(IMAGE_MODEL_CHOICE_KEY, select.value);
      void syncImageModelChoice();
    });
    insertBeforeActionButton(card, picker, /生成封面|批量生成封面|开始生成|生成图片/);
    void modelApi('/api/llm/local-image-config')
      .then((res) => {
        const cfg = res.data || res;
        const local = String(cfg.model || '').trim();
        if (local) select.querySelector('option[value="custom"]').textContent = `${local}（本地）`;
      })
      .catch(() => undefined);
    void syncImageModelChoice();
  }

  function mountInlineModelPickers() {
    void mountCopywritingModelPicker();
    void mountImageModelPicker();
  }

  function isImageGenerationRequest(method, url) {
    return String(method || '').toUpperCase() === 'POST'
      && /\/video\/cover\/generate(?:-set)?(?:\?|$)/i.test(String(url || ''));
  }

  async function monitorGenerationResponse(url, response) {
    try {
      const clone = response.clone();
      const contentType = clone.headers.get('content-type') || '';
      if (!clone.body || !/text\/event-stream|text\/plain|application\/x-ndjson/i.test(contentType)) {
        const text = await clone.text();
        const summary = summarizeGenerationResponse(text);
        markGenerationRequestDone(url, summary.ok, summary.error, extractGenerationText(text));
        return;
      }
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const block of parts) {
          const line = block.split('\n').find((item) => item.startsWith('data: '));
          if (!line) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === 'progress') {
              updateActiveGenerationRequest(url, { step: event.step || '生成中', progress: Number(event.progress || 0) });
            } else if (event.type === 'chunk') {
              content += String(event.content || '');
              updateActiveGenerationRequest(url, { step: '模型输出中', progress: 0.65, content });
            } else if (event.type === 'done') {
              content = extractGenerationText(event.data) || content;
              updateActiveGenerationRequest(url, { step: '保存完成', progress: 1, content });
            } else if (event.type === 'error') {
              markGenerationRequestDone(url, false, event.error || '生成失败');
              return;
            }
          } catch {}
        }
      }
      markGenerationRequestDone(url, true, '', content);
    } catch (error) {
      markGenerationRequestDone(url, false, error?.message || error, content);
    }
  }

  function installGenerationRequestKeepalive() {
    if (window.__yxGenerationRequestKeepaliveInstalled) return;
    window.__yxGenerationRequestKeepaliveInstalled = true;
    document.addEventListener('click', markGenerationCancelIntent, true);

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function yxGenerationFetch(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (init && init.method) || (input && input.method) || 'GET';
        if (isImageGenerationRequest(method, url)) {
          return syncImageModelChoice(originalFetch).then(() => originalFetch.apply(this, arguments));
        }
        if (!isGenerationKeepaliveRequest(method, url) || shouldAllowGenerationAbort()) {
          return originalFetch.apply(this, arguments);
        }
        const nextInit = init ? { ...init, signal: undefined } : { signal: undefined };
        const request = typeof Request !== 'undefined' && input instanceof Request
          ? new Request(input, { signal: undefined })
          : input;
        markGenerationRequestStarted(url);
        return syncTextModelChoice(originalFetch)
          .then(() => originalFetch.call(this, request, nextInit))
          .then((response) => {
            if (!response.ok) {
              markGenerationRequestDone(url, false, `HTTP ${response.status}`);
              return response;
            }
            try {
              monitorGenerationResponse(url, response);
            } catch {}
            return response;
          })
          .catch((error) => {
            markGenerationRequestDone(url, false, error?.message || error);
            if (isBenignGenerationAbortError(error)) {
              return new Response('', { status: 204 });
            }
            throw error;
          });
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;
      const originalAbort = XHR.prototype.abort;
      XHR.prototype.open = function yxGenerationXhrOpen(method, url) {
        this.__yxGenerationKeepalive = isGenerationKeepaliveRequest(method, url);
        this.__yxGenerationUrl = url;
        return originalOpen.apply(this, arguments);
      };
      XHR.prototype.send = function yxGenerationXhrSend() {
        if (this.__yxGenerationKeepalive) {
          markGenerationRequestStarted(this.__yxGenerationUrl);
          const done = () => {
            if (this.__yxGenerationDone) return;
            this.__yxGenerationDone = true;
            markGenerationRequestDone(this.__yxGenerationUrl, this.status >= 200 && this.status < 300, this.status ? `HTTP ${this.status}` : '');
          };
          this.addEventListener('loadend', done, { once: true });
          this.addEventListener('error', () => markGenerationRequestDone(this.__yxGenerationUrl, false, '网络错误'), { once: true });
        }
        return originalSend.apply(this, arguments);
      };
      XHR.prototype.abort = function yxGenerationXhrAbort() {
        if (this.__yxGenerationKeepalive && !shouldAllowGenerationAbort()) {
          notifyBackgroundGeneration('生成仍在继续。切换页面只会隐藏进度，不会主动中断本次生成。');
          return;
        }
        return originalAbort.apply(this, arguments);
      };
    }
  }

  function markScenePromptPanels() {
    const labels = ['AI 视频 prompt', 'AI 画面 prompt', 'AI 图片 prompt', '视频 prompt', '画面 prompt'];
    for (const node of Array.from(document.querySelectorAll('div, section, article, .ant-card, .ant-list-item'))) {
      if (node.classList?.contains('yx-scene-prompt-panel')) continue;
      const text = (node.textContent || '').trim();
      if (!labels.some((label) => text.includes(label))) continue;
      if (text.length > 1600) continue;
      node.classList?.add('yx-scene-prompt-panel');
      for (const child of Array.from(node.querySelectorAll('[style]'))) {
        const childText = (child.textContent || '').trim();
        if (childText && childText.length > 8) child.classList.add('yx-scene-prompt-text');
      }
    }
  }

  function enhanceLogoImages() {
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const src = img.getAttribute('src') || '';
      const rect = img.getBoundingClientRect();
      const isLogoSized = rect.width <= 96 && rect.height <= 96;
      if (!/icon\.png|logo/i.test(src) || !isLogoSized) continue;
      if (img.dataset.yxProcessedLogo) continue;
      img.dataset.yxProcessedLogo = '1';
      img.removeAttribute('data-yx-hidden-logo');
      img.classList.add('yx-app-icon');
      img.setAttribute('src', './icon.png');
      const brandArea = img.closest('div');
      if (brandArea) brandArea.classList.add('yx-brand-area');
    }
  }

  function normalizeBrandBlocks() {
    const darkMode = document.body.dataset.yxTheme === 'dark';
    const textColor = darkMode ? '#e6edf3' : '#111827';
    const mutedColor = darkMode ? '#7d8590' : '#667085';
    const candidates = Array.from(document.querySelectorAll('aside, [class*="sider"], [class*="sidebar"], .ant-layout-sider'));
    for (const container of candidates) {
      container.querySelectorAll('[style*="rgb(230"], [style*="#E6EDF3"], [style*="#e6edf3"]').forEach((el) => {
        el.style.color = textColor;
      });
      container.querySelectorAll('[style*="rgb(255"], [style*="#FFF"], [style*="#fff"], [style*="white"]').forEach((el) => {
        if ((el.textContent || '').trim()) el.style.color = textColor;
      });
      container.querySelectorAll('[style*="rgb(125"], [style*="#7D8590"], [style*="#7d8590"]').forEach((el) => {
        el.style.color = mutedColor;
      });
      if (container.querySelector(`.${MARK_CLASS}, .yx-app-icon, img[src*="icon.png"]`)) continue;
      if (!/运营虾|自媒体助手|yunyingxia/.test(container.textContent || '')) continue;
      const target = Array.from(container.querySelectorAll('div, a, span')).find((el) =>
        /运营虾|自媒体助手|yunyingxia/.test(el.textContent || ''),
      );
      if (!target) continue;
      const mark = document.createElement('span');
      mark.className = MARK_CLASS;
      mark.textContent = '虾';
      target.insertAdjacentElement('afterbegin', mark);
    }
  }

  function mountThemeToggle() {
    if (document.querySelector('.yx-theme-switch')) {
      syncThemeToggle();
      return;
    }
    const sidebar = document.querySelector('.ant-layout-sider, aside, .ant-layout-sider-children, [class*="sidebar"]');
    if (!sidebar) return;
    sidebar.style.position = 'relative';
    sidebar.style.paddingBottom = '214px';
    const switchEl = document.createElement('div');
    switchEl.className = 'yx-theme-switch';
    switchEl.setAttribute('role', 'group');
    for (const option of [
      { mode: 'light', label: '日间', icon: '☀' },
      { mode: 'dark', label: '夜间', icon: '☾' },
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'yx-theme-option';
      button.dataset.mode = option.mode;
      button.innerHTML = `<span aria-hidden="true">${option.icon}</span><span>${option.label}</span>`;
      button.addEventListener('click', () => setThemeMode(option.mode));
      switchEl.appendChild(button);
    }
    sidebar.appendChild(switchEl);
    syncThemeToggle();
  }

  function maskPhone(phone) {
    const value = String(phone || '').replace(/\s/g, '');
    return /^1\d{10}$/.test(value) ? `${value.slice(0, 3)}****${value.slice(-4)}` : (value || '未识别账号');
  }

  function operationProduct(state) {
    const products = state && Array.isArray(state.products) ? state.products : [];
    return products.find((item) => item && item.product_id === 'operation_shrimp') || null;
  }

  function formatExpiry(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '未开通';
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function formatEnergyBalance(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    return amount.toLocaleString('zh-CN');
  }

  function extractOfficialEnergyBalance(payload) {
    const data = payload && payload.data ? payload.data : payload;
    const raw = data && data.raw ? data.raw : {};
    const candidates = [
      data && data.balance,
      data && data.energy_balance,
      data && data.credits_balance,
      raw && raw.balance,
      raw && raw.energy_balance,
      raw && raw.credits_balance,
    ];
    const found = candidates.find((value) => value !== null && typeof value !== 'undefined' && Number.isFinite(Number(value)));
    return typeof found === 'undefined' ? null : Number(found);
  }

  async function readOfficialEnergyBalance() {
    try {
      const response = await fetch('http://127.0.0.1:19832/api/llm/official-catalog', {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return extractOfficialEnergyBalance(payload);
    } catch (_) {
      return null;
    }
  }

  function renderAccountPanel(panel, state) {
    const user = state && state.user ? state.user : null;
    const product = operationProduct(state);
    const isActive = Boolean(product && product.status === 'active' && product.expires_at && new Date(product.expires_at).getTime() > Date.now());
    panel.querySelector('[data-yx-account-phone]').textContent = `账号：${maskPhone(user && user.phone)}`;
    panel.querySelector('[data-yx-account-status]').textContent = isActive
      ? `运营虾会员 · 到期 ${formatExpiry(product.expires_at)} · 算力 ${formatEnergyBalance(user && user.energy_balance)}`
      : `普通用户 · 算力 ${formatEnergyBalance(user && user.energy_balance)} · 开通后可使用生成`;
    panel.querySelector('[data-yx-account-recharge]').textContent = isActive ? '管理续费' : '去官网开通';
  }

  async function refreshAccountPanel(panel) {
    const api = window.electronAPI && window.electronAPI.account;
    if (!api || !api.me) {
      panel.querySelector('[data-yx-account-status]').textContent = '账号服务暂不可用';
      return;
    }
    try {
      const result = await api.me();
      if (!result || !result.ok || !result.state) throw new Error('session unavailable');
      const officialBalance = await readOfficialEnergyBalance();
      if (officialBalance !== null && result.state.user) {
        result.state.user = { ...result.state.user, energy_balance: officialBalance };
      }
      renderAccountPanel(panel, result.state);
    } catch (_) {
      panel.querySelector('[data-yx-account-status]').textContent = '登录状态已失效，请重新登录';
    }
  }

  function mountAccountPanel() {
    let panel = document.querySelector('.yx-sidebar-account');
    if (panel) return;
    const sidebar = document.querySelector('.ant-layout-sider, aside, .ant-layout-sider-children, [class*="sidebar"]');
    if (!sidebar) return;
    panel = document.createElement('section');
    panel.className = 'yx-sidebar-account';
    panel.setAttribute('aria-label', '运营虾账号');
    panel.innerHTML = `
      <p class="yx-sidebar-account-title" data-yx-account-phone>账号：加载中</p>
      <div class="yx-sidebar-account-status" data-yx-account-status>正在读取账号权益…</div>
      <div class="yx-sidebar-account-actions">
        <button type="button" data-yx-account-recharge>去官网开通</button>
        <button type="button" class="yx-sidebar-logout" data-yx-account-logout>退出登录</button>
      </div>`;
    panel.querySelector('[data-yx-account-recharge]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const api = window.electronAPI && window.electronAPI.account;
      if (!api || !api.openRechargePortal) return;
      button.disabled = true;
      try {
        await api.openRechargePortal();
      } finally {
        button.disabled = false;
      }
    });
    panel.querySelector('[data-yx-account-logout]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const api = window.electronAPI && window.electronAPI.account;
      if (!api || !api.logout) return;
      button.disabled = true;
      await api.logout();
    });
    sidebar.appendChild(panel);
    void refreshAccountPanel(panel);
    if (!window.__yxAccountPanelRefreshTimer) {
      window.__yxAccountPanelRefreshTimer = window.setInterval(() => {
        const current = document.querySelector('.yx-sidebar-account');
        if (current) void refreshAccountPanel(current);
      }, 60000);
    }
  }

  function openModelSettings() {
    const settingsLink = Array.from(document.querySelectorAll('a, button, [role="menuitem"]'))
      .find((el) => /设置/.test(el.textContent || ''));
    if (settingsLink) {
      settingsLink.click();
      setTimeout(() => {
        const modelTab = Array.from(document.querySelectorAll('[role="tab"], .ant-tabs-tab'))
          .find((el) => /AI\s*模型|大模型/.test(el.textContent || ''));
        if (modelTab) modelTab.click();
      }, 350);
      return;
    }
    try {
      window.history.pushState({}, '', '/settings');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.location.hash = '#/settings';
    }
  }

  function mountModelShortcut() {
    mountModelShortcutInSidebar();
  }

  function mountModelShortcutInSidebar() {
    let row = document.querySelector('.yx-model-shortcut-row');
    const route = window.location.hash || window.location.pathname || '';
    const visible = /topic|copywriting|video|distribute|settings/.test(route);
    if (!visible) {
      if (row) row.remove();
      return;
    }
    const panel = document.querySelector('.yx-sidebar-account');
    if (!panel) return;
    if (row && panel.contains(row)) return;
    if (row) row.remove();
    row = document.createElement('div');
    row.className = 'yx-model-shortcut-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yx-model-shortcut';
    button.textContent = 'AI模型/算力';
    button.addEventListener('click', openModelSettings);
    row.appendChild(button);
    const actions = panel.querySelector('.yx-sidebar-account-actions');
    if (actions) {
      actions.insertAdjacentElement('beforebegin', row);
    } else {
      panel.appendChild(row);
    }
  }

  function applyBrand() {
    document.title = '运营虾';
    replaceVisibleText(document.body);
    scrubQianshanLinks();
    installQianshanNavigationGuard();
    scrubSensitiveErrorText();
    installGenerationRequestKeepalive();
    installGenerationPanelSnapshot();
    installWorkspaceCache();
    persistVisibleGenerationPanelContent();
    mountBackgroundGenerationStatus();
    markScenePromptPanels();
    enhanceLogoImages();
    normalizeBrandBlocks();
    mountThemeToggle();
    mountAccountPanel();
    mountInlineModelPickers();
  }

  function showRuntimeErrorToast() {
    const id = 'yx-runtime-error-toast';
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.setAttribute('role', 'status');
      Object.assign(toast.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '10000',
        maxWidth: '280px',
        padding: '10px 14px',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        background: '#fff7f7',
        color: '#b42318',
        boxShadow: '0 6px 20px rgba(16, 24, 40, .14)',
        fontSize: '13px',
        lineHeight: '1.4',
        pointerEvents: 'none',
      });
      document.body.appendChild(toast);
    }
    toast.textContent = '操作错误，稍后再试';
    clearTimeout(window.__yxRuntimeErrorTimer);
    window.__yxRuntimeErrorTimer = window.setTimeout(() => toast?.remove(), 5000);
  }

  function installRuntimeErrorGuard() {
    if (window.__yxRuntimeErrorGuardInstalled) return;
    window.__yxRuntimeErrorGuardInstalled = true;
    window.addEventListener('error', (event) => {
      console.error('[Yunyingxia] renderer error', event.error || event.message);
      if (isBenignGenerationAbortError(event.error || event.message)) {
        event.preventDefault();
        return;
      }
      showRuntimeErrorToast();
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Yunyingxia] unhandled rejection', event.reason);
      if (isBenignGenerationAbortError(event.reason)) {
        event.preventDefault();
        return;
      }
      showRuntimeErrorToast();
    });
    const observer = new MutationObserver(() => {
      scrubTransientGenerationErrorToasts();
      restoreGenerationResultToPanel();
      const heading = Array.from(document.querySelectorAll('h2')).find((node) =>
        node.textContent?.includes('Unexpected Application Error!'));
      if (!heading) return;
      // React Router's default fallback exposes the raw stack to users. Keep the
      // diagnostic in DevTools, but remove the blocking stack view and show the
      // same compact message as other renderer failures.
      heading.textContent = '操作错误，稍后再试';
      heading.parentElement?.querySelectorAll('pre').forEach((node) => node.remove());
      heading.parentElement?.querySelectorAll('h3').forEach((node) => {
        node.textContent = '请稍后重试。';
      });
      showRuntimeErrorToast();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function boot() {
    document.body.dataset.yxTheme = getThemeMode();
    installRuntimeErrorGuard();
    injectStyle();
    setFavicon();
    applyBrand();
    const observer = new MutationObserver(() => {
      clearTimeout(window.__operatingShrimpThemeTimer);
      window.__operatingShrimpThemeTimer = setTimeout(applyBrand, 120);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
