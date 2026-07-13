(function () {
  const PANEL_ID = 'wanshan-local-llm-panel';
  const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:19832' : '';
  const API = `${API_BASE}/api/llm/local-config`;
  const DIGITAL_API = `${API_BASE}/api/digital-human/prefs`;
  const defaults = {
    provider: 'custom_openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash',
  };
  const providerPresets = {
    local_deepseek: {
      label: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      custom: true,
    },
    custom_openai: {
      label: '自定义中转站',
      baseUrl: '',
      model: '',
      custom: true,
    },
  };

  function isSettingsPage() {
    return isModelTabActive();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isModelTabActive() {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab-active, [role="tab"][aria-selected="true"]'));
    return tabs.some((tab) => /AI\s*模型|大模型/.test(tab.textContent || ''));
  }

  function findHost() {
    const panes = Array.from(document.querySelectorAll('.ant-tabs-tabpane-active, [role="tabpanel"][aria-hidden="false"], [role="tabpanel"]:not([hidden])'));
    const activePane = panes.find(isVisible);
    if (activePane) return activePane;

    const cards = Array.from(document.querySelectorAll('.ant-card'));
    const modelCard = cards.find((el) => /大模型配置|模型选择|去网页配置/.test(el.innerText || ''));
    if (modelCard) return modelCard.parentElement || modelCard;

    return document.querySelector('main, [role="main"]') || document.getElementById('root') || document.body;
  }

  function rewriteCloudCopy() {
    const cards = Array.from(document.querySelectorAll('.ant-card'));
    for (const card of cards) {
      const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
      if (/大模型配置|去网页配置|模型选择/.test(text)) {
        card.style.display = 'none';
        card.dataset.wanshanHiddenCloud = '1';
      }
    }

    for (const button of Array.from(document.querySelectorAll('button, a'))) {
      const text = (button.innerText || button.textContent || '').trim();
      if (/去网页配置|刷新云端|检测连通/.test(text)) {
        button.style.display = 'none';
        button.dataset.wanshanHiddenCloud = '1';
      }
    }

    const blocks = Array.from(document.querySelectorAll('p, span, a'));
    for (const el of blocks) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/qianshanai\.cn|云端 LLM 配置|网页端集中管理|30 秒内自动同步/.test(text)) {
        const isTiny = text.length < 8;
        if (isTiny || text.length > 360) continue;
        if (el.tagName === 'A') {
          el.removeAttribute('href');
          el.removeAttribute('onclick');
          el.textContent = '本地模型配置';
          continue;
        }
        el.textContent = '本地 AI 模型配置：在“万山本地模型配置”里填写中转站 Base URL、模型/接入点 ID 和 API Key，保存后立即生效，不需要去远端网页配置。';
      }
    }
  }

  function setStatus(panel, text, tone) {
    const status = panel.querySelector('[data-local-llm-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || 'normal';
  }

  function setDigitalStatus(panel, text, tone) {
    const status = panel.querySelector('[data-digital-human-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || 'normal';
  }

  function value(panel, name) {
    const el = panel.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : '';
  }

  function applyProviderMode(panel) {
    const provider = value(panel, 'provider') || defaults.provider;
    const preset = providerPresets[provider] || providerPresets.local_deepseek;
    const base = panel.querySelector('[name="baseUrl"]');
    const model = panel.querySelector('[name="model"]');
    base.readOnly = !preset.custom;
    model.readOnly = !preset.custom;
    if (!preset.custom) {
      base.value = preset.baseUrl;
      model.value = preset.model;
    }
    base.placeholder = '填写中转站或厂商 Base URL，例如 https://api.example.com/v1';
    model.placeholder = '填写中转站提供的模型/接入点 ID';
  }

  async function request(url, options) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...(options || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json.data || json;
  }

  async function refresh(panel) {
    try {
      const cfg = await request(API);
      panel.querySelector('[name="provider"]').value = cfg.provider || defaults.provider;
      panel.querySelector('[name="baseUrl"]').value = cfg.baseUrl || defaults.baseUrl;
      panel.querySelector('[name="model"]').value = cfg.model || defaults.model;
      applyProviderMode(panel);
      panel.querySelector('[name="apiKey"]').value = '';
      panel.querySelector('[name="apiKey"]').placeholder = cfg.maskedKey
        ? `已保存 ${cfg.maskedKey}，留空不修改`
        : '粘贴 API Key';
      setStatus(panel, cfg.configured ? `已启用本地模型：${cfg.model}` : '填写中转站 Base URL、模型/接入点 ID 和 API Key 后即可使用', cfg.configured ? 'ok' : 'normal');
    } catch (err) {
      setStatus(panel, `读取配置失败：${err.message || err}`, 'bad');
    }
  }

  async function save(panel) {
    setStatus(panel, '正在保存本地模型配置...', 'normal');
    const payload = {
      provider: value(panel, 'provider') || defaults.provider,
      baseUrl: value(panel, 'baseUrl') || defaults.baseUrl,
      model: value(panel, 'model') || defaults.model,
      apiKey: value(panel, 'apiKey'),
    };
    await request(API, { method: 'POST', body: JSON.stringify(payload) });
    await refresh(panel);
  }

  async function test(panel) {
    setStatus(panel, '正在测试模型连接...', 'normal');
    const payload = {
      provider: value(panel, 'provider') || defaults.provider,
      baseUrl: value(panel, 'baseUrl') || defaults.baseUrl,
      model: value(panel, 'model') || defaults.model,
      apiKey: value(panel, 'apiKey'),
    };
    const result = await request(`${API}/test`, { method: 'POST', body: JSON.stringify(payload) });
    setStatus(panel, `连接成功：${result.model}，耗时 ${result.elapsedMs}ms`, 'ok');
  }

  async function clear(panel) {
    setStatus(panel, '正在清除本地模型配置...', 'normal');
    await request(API, { method: 'DELETE' });
    await refresh(panel);
  }

  function applyDigitalProviderMode(panel) {
    const provider = value(panel, 'dhProvider') || 'aliyun_wan_s2v';
    for (const el of Array.from(panel.querySelectorAll('[data-dh-for]'))) {
      el.style.display = el.dataset.dhFor === provider ? '' : 'none';
    }
  }

  async function refreshDigital(panel) {
    try {
      const cfg = await request(DIGITAL_API);
      panel.querySelector('[name="dhProvider"]').value = cfg.provider || 'aliyun_wan_s2v';
      panel.querySelector('[name="aliyunModel"]').value = cfg.aliyun?.model || 'wan2.2-s2v';
      panel.querySelector('[name="aliyunApiKey"]').value = '';
      panel.querySelector('[name="aliyunApiKey"]').placeholder = cfg.aliyun?.apiKeyConfigured
        ? '已保存本地百炼 Key，留空不修改'
        : '粘贴阿里百炼 API Key';
      panel.querySelector('[name="xilingAppId"]').value = cfg.xiling?.appId || '';
      panel.querySelector('[name="xilingAppKey"]').value = '';
      panel.querySelector('[name="xilingAppKey"]').placeholder = cfg.xiling?.appKeyConfigured
        ? '已保存曦灵 AppKey，留空不修改'
        : '粘贴百度曦灵 AppKey';
      panel.querySelector('[name="xilingModel"]').value = cfg.xiling?.model || 'turbo_v2';
      panel.querySelector('[name="xilingBaseUrl"]').value = cfg.xiling?.baseUrl || 'https://open.xiling.baidu.com';
      panel.querySelector('[name="xilingUploadMode"]').value = cfg.xiling?.uploadMode || 'qianshan_temp_upload';
      panel.querySelector('[name="xilingTempUploadUrl"]').value = cfg.xiling?.tempUploadUrl || '';
      panel.querySelector('[name="xilingTempUploadToken"]').value = '';
      panel.querySelector('[name="xilingTempUploadToken"]').placeholder = cfg.xiling?.tempUploadTokenConfigured
        ? '已保存上传接口令牌，留空不修改'
        : '可选：上传接口令牌';
      applyDigitalProviderMode(panel);
      const label = cfg.provider === 'baidu_xiling_photo' ? '百度曦灵照片数字人' : '阿里万相 wan2.2-s2v';
      const configured = cfg.provider === 'baidu_xiling_photo' ? cfg.xiling?.appKeyConfigured : cfg.aliyun?.apiKeyConfigured;
      setDigitalStatus(panel, configured ? `数字人供应商已配置：${label}` : `请选择数字人供应商并填写对应 Key：${label}`, configured ? 'ok' : 'normal');
    } catch (err) {
      setDigitalStatus(panel, `读取数字人配置失败：${err.message || err}`, 'bad');
    }
  }

  async function saveDigital(panel) {
    setDigitalStatus(panel, '正在保存数字人供应商配置...', 'normal');
    const payload = {
      provider: value(panel, 'dhProvider') || 'aliyun_wan_s2v',
      aliyun: {
        model: value(panel, 'aliyunModel') || 'wan2.2-s2v',
        apiKey: value(panel, 'aliyunApiKey'),
      },
      xiling: {
        appId: value(panel, 'xilingAppId'),
        appKey: value(panel, 'xilingAppKey'),
        model: value(panel, 'xilingModel') || 'turbo_v2',
        baseUrl: value(panel, 'xilingBaseUrl') || 'https://open.xiling.baidu.com',
        uploadMode: value(panel, 'xilingUploadMode') || 'qianshan_temp_upload',
        tempUploadUrl: value(panel, 'xilingTempUploadUrl'),
        tempUploadToken: value(panel, 'xilingTempUploadToken'),
      },
    };
    await request(DIGITAL_API, { method: 'PUT', body: JSON.stringify(payload) });
    await refreshDigital(panel);
  }

  async function testDigital(panel) {
    setDigitalStatus(panel, '正在测试数字人供应商配置...', 'normal');
    const result = await request(`${DIGITAL_API}/test`, { method: 'POST' });
    setDigitalStatus(panel, result.message || '数字人供应商配置可用', 'ok');
  }

  function buildPanel() {
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <style>
        #${PANEL_ID} {
          margin: 0;
          padding: 16px;
          border: 1px solid rgba(125, 144, 255, .28);
          border-radius: 8px;
          background: #161b22;
          color: #e6edf3;
          box-shadow: none;
          width: 100%;
          max-width: none;
        }
        #${PANEL_ID} * { box-sizing: border-box; }
        #${PANEL_ID} .ws-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        #${PANEL_ID} .ws-divider {
          height: 1px;
          margin: 16px 0;
          background: #30363d;
        }
        #${PANEL_ID} .ws-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        #${PANEL_ID} .ws-help {
          margin: 0 0 12px;
          color: #8b949e;
          font-size: 12px;
          line-height: 1.6;
        }
        #${PANEL_ID} .ws-title::before {
          content: "";
          width: 4px;
          height: 18px;
          border-radius: 4px;
          background: #6b63ff;
          display: inline-block;
        }
        #${PANEL_ID} .ws-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        #${PANEL_ID} label {
          display: grid;
          gap: 6px;
          color: #9fb0c8;
          font-size: 12px;
        }
        #${PANEL_ID} input,
        #${PANEL_ID} select {
          width: 100%;
          min-height: 36px;
          padding: 8px 10px;
          border: 1px solid #303846;
          border-radius: 6px;
          background: #0d1117;
          color: #e6edf3;
          outline: none;
        }
        #${PANEL_ID} input:focus,
        #${PANEL_ID} select:focus {
          border-color: #6b63ff;
          box-shadow: 0 0 0 2px rgba(107, 99, 255, .18);
        }
        #${PANEL_ID} .ws-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        #${PANEL_ID} button {
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid #303846;
          border-radius: 6px;
          background: #21262d;
          color: #e6edf3;
          cursor: pointer;
        }
        #${PANEL_ID} button[data-primary] {
          border-color: #6b63ff;
          background: #6157f5;
        }
        #${PANEL_ID} button:hover { filter: brightness(1.08); }
        #${PANEL_ID} [data-local-llm-status] {
          margin-top: 10px;
          color: #9fb0c8;
          font-size: 12px;
        }
        #${PANEL_ID} [data-digital-human-status] {
          margin-top: 10px;
          color: #9fb0c8;
          font-size: 12px;
        }
        #${PANEL_ID} [data-local-llm-status][data-tone="ok"],
        #${PANEL_ID} [data-digital-human-status][data-tone="ok"] { color: #3ddc97; }
        #${PANEL_ID} [data-local-llm-status][data-tone="bad"],
        #${PANEL_ID} [data-digital-human-status][data-tone="bad"] { color: #ff7b72; }
        @media (max-width: 720px) {
          #${PANEL_ID} .ws-grid { grid-template-columns: 1fr; }
        }
      </style>
      <div class="ws-title">万山本地模型配置</div>
      <div class="ws-grid">
        <label>服务商<select name="provider">
          <option value="custom_openai">自定义中转站</option>
          <option value="local_deepseek">DeepSeek 官方</option>
        </select></label>
        <label>模型/接入点 ID<input name="model" autocomplete="off" value="${defaults.model}" readonly></label>
        <label>API 地址<input name="baseUrl" autocomplete="off" value="${defaults.baseUrl}" readonly></label>
        <label>API Key<input name="apiKey" type="password" autocomplete="off" placeholder="粘贴 API Key"></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="save">保存本地配置</button>
        <button type="button" data-action="test">测试连接</button>
        <button type="button" data-action="refresh">刷新状态</button>
        <button type="button" data-action="clear">清除配置</button>
      </div>
      <div data-local-llm-status>正在读取配置...</div>
      <div class="ws-divider"></div>
      <div class="ws-subtitle">数字人供应商配置</div>
      <p class="ws-help">数字人不是文案模型。阿里万相使用百炼 Key；百度曦灵使用 AppID/AppKey。保存后用于一键成片里的画中画数字人。</p>
      <div class="ws-grid">
        <label>数字人供应商<select name="dhProvider">
          <option value="aliyun_wan_s2v">阿里万相 wan2.2-s2v</option>
          <option value="baidu_xiling_photo">百度曦灵照片数字人</option>
        </select></label>
        <label data-dh-for="aliyun_wan_s2v">阿里模型<input name="aliyunModel" autocomplete="off" value="wan2.2-s2v"></label>
        <label data-dh-for="aliyun_wan_s2v">阿里百炼 API Key<input name="aliyunApiKey" type="password" autocomplete="off" placeholder="粘贴阿里百炼 API Key"></label>
        <label data-dh-for="baidu_xiling_photo">曦灵 AppID<input name="xilingAppId" autocomplete="off" placeholder="百度曦灵 AppID"></label>
        <label data-dh-for="baidu_xiling_photo">曦灵 AppKey<input name="xilingAppKey" type="password" autocomplete="off" placeholder="百度曦灵 AppKey"></label>
        <label data-dh-for="baidu_xiling_photo">曦灵模型<select name="xilingModel">
          <option value="turbo_v2">turbo_v2</option>
          <option value="quality_v2">quality_v2</option>
        </select></label>
        <label data-dh-for="baidu_xiling_photo">曦灵 API 地址<input name="xilingBaseUrl" autocomplete="off" value="https://open.xiling.baidu.com"></label>
        <label data-dh-for="baidu_xiling_photo">素材上传方式<select name="xilingUploadMode">
          <option value="qianshan_temp_upload">千山临时素材上传</option>
          <option value="custom_public_asset">自定义公网素材接口</option>
        </select></label>
        <label data-dh-for="baidu_xiling_photo">公网素材接口 URL<input name="xilingTempUploadUrl" autocomplete="off" placeholder="自定义上传方式才需要"></label>
        <label data-dh-for="baidu_xiling_photo">上传接口令牌<input name="xilingTempUploadToken" type="password" autocomplete="off" placeholder="可选"></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="dh-save">保存数字人配置</button>
        <button type="button" data-action="dh-test">测试数字人配置</button>
        <button type="button" data-action="dh-refresh">刷新数字人状态</button>
      </div>
      <div data-digital-human-status>正在读取数字人配置...</div>
    `;
    panel.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      button.disabled = true;
      try {
        const action = button.dataset.action;
        if (action === 'save') await save(panel);
        if (action === 'test') await test(panel);
        if (action === 'refresh') await refresh(panel);
        if (action === 'clear') await clear(panel);
        if (action === 'dh-save') await saveDigital(panel);
        if (action === 'dh-test') await testDigital(panel);
        if (action === 'dh-refresh') await refreshDigital(panel);
      } catch (err) {
        setStatus(panel, err.message || String(err), 'bad');
      } finally {
        button.disabled = false;
      }
    });
    panel.addEventListener('change', (event) => {
      if (event.target && event.target.name === 'provider') {
        applyProviderMode(panel);
      }
      if (event.target && event.target.name === 'dhProvider') {
        applyDigitalProviderMode(panel);
      }
    });
    refresh(panel);
    refreshDigital(panel);
    return panel;
  }

  function mount() {
    const existing = document.getElementById(PANEL_ID);
    if (!isSettingsPage()) {
      if (existing) existing.style.display = 'none';
      return;
    }
    rewriteCloudCopy();
    const host = findHost();
    const panel = existing || buildPanel();
    panel.style.display = '';
    if (panel.parentElement !== host || host.firstChild !== panel) {
      host.insertBefore(panel, host.firstChild || null);
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.__wanshanLocalLlmTimer);
    window.__wanshanLocalLlmTimer = setTimeout(mount, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', () => setTimeout(mount, 120), true);
  window.addEventListener('hashchange', mount);
  window.addEventListener('popstate', mount);
  setTimeout(mount, 500);
})();
