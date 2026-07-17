(function () {
  const STYLE_ID = 'operating-shrimp-theme';
  const MARK_CLASS = 'yx-logo-mark';
  const THEME_KEY = 'operating-shrimp-theme-mode';
  const replacements = [
    [/万山自媒体/g, '运营虾'],
    [/万山本地模型配置/g, '运营虾本地模型配置'],
    [/万山/g, '运营虾'],
    [/千山自媒体助手/g, '运营虾'],
    [/千山AI/g, '运营虾'],
    [/千山 AI/g, '运营虾'],
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
          return /万山|千山|qianshanAI|Qianshan/.test(node.nodeValue || '')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      },
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceTextNode);
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

  function renderAccountPanel(panel, state) {
    const user = state && state.user ? state.user : null;
    const product = operationProduct(state);
    const isActive = Boolean(product && product.status === 'active' && product.expires_at && new Date(product.expires_at).getTime() > Date.now());
    panel.querySelector('[data-yx-account-phone]').textContent = `账号：${maskPhone(user && user.phone)}`;
    panel.querySelector('[data-yx-account-status]').textContent = isActive
      ? `运营虾会员 · 到期 ${formatExpiry(product.expires_at)}`
      : '普通用户 · 开通后可使用生成、编辑与导出';
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
  }

  function applyBrand() {
    document.title = '运营虾';
    replaceVisibleText(document.body);
    enhanceLogoImages();
    normalizeBrandBlocks();
    mountThemeToggle();
    mountAccountPanel();
  }

  function showRuntimeErrorToast() {
    const id = 'yx-runtime-error-toast';
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.setAttribute('role', 'status');
      Object.assign(toast.style, {
        position: 'fixed', top: '16px', right: '16px', zIndex: '10000', maxWidth: '280px',
        padding: '10px 14px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fff7f7',
        color: '#b42318', boxShadow: '0 6px 20px rgba(16, 24, 40, .14)', fontSize: '13px',
        lineHeight: '1.4', pointerEvents: 'none',
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
      showRuntimeErrorToast();
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Yunyingxia] unhandled rejection', event.reason);
      showRuntimeErrorToast();
    });
    const observer = new MutationObserver(() => {
      const heading = Array.from(document.querySelectorAll('h2')).find((node) =>
        node.textContent?.includes('Unexpected Application Error!'));
      if (!heading) return;
      heading.textContent = '操作错误，稍后再试';
      heading.parentElement?.querySelectorAll('pre').forEach((node) => node.remove());
      heading.parentElement?.querySelectorAll('h3').forEach((node) => { node.textContent = '请稍后重试。'; });
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
