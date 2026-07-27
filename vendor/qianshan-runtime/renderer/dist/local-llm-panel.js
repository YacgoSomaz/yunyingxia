(function () {
  const PANEL_ID = 'wanshan-local-llm-panel';
  const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:19832' : '';
  const API = `${API_BASE}/api/llm/local-config`;
  const SOURCE_API = `${API_BASE}/api/llm/ai-source`;
  const OFFICIAL_CATALOG_API = `${API_BASE}/api/llm/official-catalog`;
  const VIDEO_API = `${API_BASE}/api/llm/local-video-config`;
  const IMAGE_API = `${API_BASE}/api/llm/local-image-config`;
  const IMAGE_SOURCE_API = `${API_BASE}/api/llm/local-image-source`;
  const VOICE_API = `${API_BASE}/api/llm/local-voice-config`;
  const DIGITAL_API = `${API_BASE}/api/digital-human/prefs`;
  const ALIYUN_VIDEO_HELP_URL = 'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference';
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
  const videoDefaults = {
    provider: 'custom_openai',
    baseUrl: '',
    model: 'wan2.7-t2v',
  };
  const videoProviderPresets = {
    custom_openai: {
      label: '自定义视频中转站',
      baseUrl: '',
      model: 'wan2.7-t2v',
      custom: true,
    },
    aliyun_dashscope: {
      label: '阿里百炼 / 通义万相',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'wan2.7-t2v',
      custom: false,
    },
    volcengine_ark: {
      label: '火山方舟 Seedance',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      model: 'doubao-seedance-1-0-pro-250528',
      custom: false,
    },
    cool: {
      label: 'Cool / mjapi 视频中转',
      baseUrl: '',
      model: 'veo3',
      custom: true,
    },
    wuyinkeji: {
      label: '速创 Grok Imagine',
      baseUrl: '',
      model: 'grok_imagine',
      custom: true,
    },
  };
  const imageDefaults = {
    imageSource: 'custom',
    provider: 'custom_openai',
    baseUrl: '',
    model: 'gpt-image-1',
  };
  const imageProviderPresets = {
    custom_openai: {
      label: '自定义图片中转站',
      baseUrl: '',
      model: 'gpt-image-1',
      custom: true,
    },
    aliyun_dashscope: {
      label: '阿里百炼 / 通义万相',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'wan2.2-t2i-flash',
      custom: false,
    },
    volcengine: {
      label: '火山方舟 Seedream',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      model: 'seedream-5-0',
      custom: false,
    },
    cool: {
      label: 'Cool / mjapi 图片中转',
      baseUrl: '',
      model: 'gpt-image-1',
      custom: true,
    },
    wuyinkeji: {
      label: '速创图片中转',
      baseUrl: '',
      model: 'image_gpt',
      custom: true,
    },
  };
  const voiceDefaults = {
    provider: 'aliyun_dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'cosyvoice-v3.5-plus',
  };
  const voiceProviderPresets = {
    aliyun_dashscope: {
      label: '阿里百炼 CosyVoice',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'cosyvoice-v3.5-plus',
      custom: false,
    },
    aliyun_minimax: {
      label: '阿里百炼 MiniMax',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'MiniMax/speech-2.8-hd',
      custom: false,
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
        el.textContent = '本地 AI 模型配置：在“运营虾本地模型配置”里填写中转站 Base URL、模型/接入点 ID 和 API Key，保存后立即生效，不需要去远端网页配置。';
      }
    }
  }

  function setStatus(panel, text, tone) {
    const status = panel.querySelector('[data-local-llm-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || 'normal';
  }

  function setOfficialStatus(panel, text, tone) {
    const statuses = Array.from(panel.querySelectorAll('[data-official-ai-status]'));
    for (const status of statuses) {
      status.textContent = text;
      status.dataset.tone = tone || 'normal';
    }
  }

  function officialTaskFromCatalog(cfg, taskType) {
    const camel = taskType.replace(/_([a-z])/g, (_, ch) => String(ch).toUpperCase());
    const raw = cfg && cfg.raw;
    const rawData = raw && raw.data;
    const candidates = [
      cfg && cfg[camel],
      cfg && cfg[taskType],
      cfg && cfg.tasks && cfg.tasks[taskType],
      cfg && cfg.tasks && cfg.tasks[camel],
      raw && raw[taskType],
      raw && raw[camel],
      rawData && rawData[taskType],
      rawData && rawData[camel],
      rawData && rawData.tasks && rawData.tasks[taskType],
      rawData && rawData.tasks && rawData.tasks[camel],
      rawData && rawData.official_ai && rawData.official_ai.tasks && rawData.official_ai.tasks[taskType],
      rawData && rawData.official_ai && rawData.official_ai.tasks && rawData.official_ai.tasks[camel],
    ];
    for (const item of candidates) {
      if (item && typeof item === 'object') return item;
    }
    const taskList = [
      ...(Array.isArray(cfg && cfg.available_tasks) ? cfg.available_tasks : []),
      ...(Array.isArray(cfg && cfg.availableTasks) ? cfg.availableTasks : []),
      ...(Array.isArray(raw && raw.available_tasks) ? raw.available_tasks : []),
      ...(Array.isArray(rawData && rawData.available_tasks) ? rawData.available_tasks : []),
    ].map((item) => String(typeof item === 'string' ? item : (item && (item.task_type || item.taskType || item.type || item.id || item.name)) || ''));
    if (taskList.includes(taskType) || taskList.includes(camel)) return { configured: true, available: true };
    return null;
  }

  function isOfficialTaskAvailable(task, fallbackReady) {
    if (!task) return Boolean(fallbackReady);
    const configured = task.configured !== false
      && task.enabled !== false
      && (task.configured === true || task.available === true || task.enabled === true || Boolean(fallbackReady));
    return configured && task.available !== false && task.enabled !== false;
  }

  function setDigitalStatus(panel, text, tone) {
    const status = panel.querySelector('[data-digital-human-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || 'normal';
  }

  function setVideoStatus(panel, text, tone) {
    const status = panel.querySelector('[data-local-video-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || 'normal';
  }

  function setImageStatus(panel, text, tone) {
    const status = panel.querySelector('[data-local-image-status]');
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || 'normal';
  }

  function setVoiceStatus(panel, text, tone) {
    const status = panel.querySelector('[data-local-voice-status]');
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

  function applyVideoProviderMode(panel) {
    const provider = value(panel, 'videoProvider') || videoDefaults.provider;
    const preset = videoProviderPresets[provider] || videoProviderPresets.custom_openai;
    const base = panel.querySelector('[name="videoBaseUrl"]');
    const model = panel.querySelector('[name="videoModel"]');
    base.readOnly = !preset.custom;
    model.readOnly = false;
    if (!preset.custom) {
      base.value = preset.baseUrl;
      if (!model.value) model.value = preset.model;
    }
    if (preset.custom && provider === 'custom_openai' && base.value === videoDefaults.baseUrl) {
      base.value = '';
    }
    base.placeholder = '填写视频中转站或厂商 Base URL';
    model.placeholder = '推荐 wan2.7-t2v；老模型 wan2.2/wanx2.1 多为固定 5 秒';
    updateVideoRecommendation(panel);
  }

  function videoRecommendationText(provider, model) {
    const normalized = String(model || '').trim();
    if (provider === 'aliyun_dashscope') {
      if (/^(wan2\.2|wanx2\.1)-t2v/i.test(normalized)) {
        return '当前百炼老模型通常固定 5 秒，不适合一键成片的动态分镜时长。建议改用 wan2.7-t2v。';
      }
      if (/^wan2\.7-t2v/i.test(normalized)) {
        return '推荐配置：wan2.7-t2v，支持 2-15 秒整数时长，适合运营虾按分镜时长生成。';
      }
      return '阿里百炼视频模型建议优先使用 wan2.7-t2v；保存前请确认该模型支持你的时长、比例和分辨率。';
    }
    return '推荐选择支持自定义时长的视频模型。部分中转站会把 wan2.2/wanx2.1 映射为固定 5 秒模型。';
  }

  function updateVideoRecommendation(panel) {
    const target = panel.querySelector('[data-video-model-recommendation]');
    if (!target) return;
    target.textContent = videoRecommendationText(value(panel, 'videoProvider') || videoDefaults.provider, value(panel, 'videoModel') || videoDefaults.model);
  }

  function openExternal(url) {
    const api = window.electronAPI;
    if (api && typeof api.openExternal === 'function') api.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  function applyImageProviderMode(panel) {
    const provider = value(panel, 'imageProvider') || imageDefaults.provider;
    const preset = imageProviderPresets[provider] || imageProviderPresets.custom_openai;
    const base = panel.querySelector('[name="imageBaseUrl"]');
    const model = panel.querySelector('[name="imageModel"]');
    base.readOnly = !preset.custom;
    model.readOnly = false;
    if (!preset.custom) {
      base.value = preset.baseUrl;
      if (!model.value) model.value = preset.model;
    }
    base.placeholder = '填写图片中转站或厂商 Base URL';
    model.placeholder = '填写图片模型/接入点 ID，例如 gpt-image-1';
  }

  function applyVoiceProviderMode(panel) {
    const provider = value(panel, 'voiceProvider') || voiceDefaults.provider;
    const preset = voiceProviderPresets[provider] || voiceProviderPresets.aliyun_dashscope;
    const base = panel.querySelector('[name="voiceBaseUrl"]');
    const model = panel.querySelector('[name="voiceModel"]');
    base.readOnly = !preset.custom;
    model.readOnly = false;
    if (!preset.custom) {
      base.value = preset.baseUrl;
      if (!model.value) model.value = preset.model;
    }
    base.placeholder = '阿里百炼固定使用 https://dashscope.aliyuncs.com';
    model.placeholder = '推荐 cosyvoice-v3.5-plus；MiniMax 用 MiniMax/speech-2.8-hd';
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

  async function refreshOfficialCatalog(panel) {
    try {
      const cfg = await request(OFFICIAL_CATALOG_API);
      const balance = cfg.balance === null || typeof cfg.balance === 'undefined' ? '未知' : cfg.balance;
      const officialReady = cfg.configured !== false && cfg.available !== false;
      const imageTask = officialTaskFromCatalog(cfg, 'operation_image');
      const imageFallback = Boolean(cfg.operationImage && cfg.operationImage.available !== false && cfg.operationImage.configured !== false);
      panel.dataset.officialImageAvailable = officialReady && isOfficialTaskAvailable(imageTask, imageFallback) ? '1' : '0';
      if (cfg.configured === false) {
        setOfficialStatus(panel, '官方算力暂未开放', 'bad');
        setImageStatus(panel, '官方图片算力暂未开放', 'bad');
        return;
      }
      const imageText = panel.dataset.officialImageAvailable === '1' ? '官方图片可用' : '官方图片算力暂未开放';
      setOfficialStatus(panel, `官方算力可用 · ${imageText} · 余额：${balance} · 价格以服务端 catalog 为准`, panel.dataset.officialImageAvailable === '1' ? 'ok' : 'normal');
    } catch (err) {
      panel.dataset.officialImageAvailable = '0';
      setOfficialStatus(panel, `官方算力状态读取失败：${err.message || err}`, 'bad');
    }
  }

  async function saveAiSource(panel) {
    const aiSource = value(panel, 'aiSource') || 'custom';
    await request(SOURCE_API, { method: 'POST', body: JSON.stringify({ aiSource }) });
    if (aiSource === 'official') {
      setStatus(panel, '已切换为官方 AI 算力。模型、供应商、提示词和 Key 均由服务器控制。', 'ok');
      await refreshOfficialCatalog(panel);
    } else {
      setStatus(panel, '已切换为自定义接口。继续使用下方本地保存的 Base URL、模型 ID 和 API Key。', 'ok');
    }
  }

  async function refresh(panel) {
    try {
      const cfg = await request(API);
      panel.querySelector('[name="aiSource"]').value = cfg.aiSource || 'custom';
      panel.querySelector('[name="provider"]').value = cfg.provider || defaults.provider;
      panel.querySelector('[name="baseUrl"]').value = cfg.baseUrl || defaults.baseUrl;
      panel.querySelector('[name="model"]').value = cfg.model || defaults.model;
      applyProviderMode(panel);
      panel.querySelector('[name="apiKey"]').value = '';
      panel.querySelector('[name="apiKey"]').placeholder = cfg.maskedKey
        ? `已保存 ${cfg.maskedKey}，留空不修改`
        : '粘贴 API Key';
      setStatus(panel, cfg.configured ? `已启用本地模型：${cfg.model}` : '填写中转站 Base URL、模型/接入点 ID 和 API Key 后即可使用', cfg.configured ? 'ok' : 'normal');
      await refreshOfficialCatalog(panel);
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
    setStatus(panel, `已保存：${payload.model}`, 'ok');
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

  async function refreshVideo(panel) {
    try {
      const cfg = await request(VIDEO_API);
      panel.querySelector('[name="videoProvider"]').value = cfg.provider || videoDefaults.provider;
      panel.querySelector('[name="videoBaseUrl"]').value = cfg.baseUrl || videoDefaults.baseUrl;
      panel.querySelector('[name="videoModel"]').value = cfg.model || videoDefaults.model;
      applyVideoProviderMode(panel);
      panel.querySelector('[name="videoApiKey"]').value = '';
      panel.querySelector('[name="videoApiKey"]').placeholder = cfg.maskedKey
        ? `已保存 ${cfg.maskedKey}，留空不修改`
        : '粘贴视频模型 API Key';
      setVideoStatus(panel, cfg.configured ? `已启用 AI 视频模型：${cfg.model}` : '填写视频模型 API 地址、模型/接入点 ID 和 API Key 后，视频工坊即可生成视频', cfg.configured ? 'ok' : 'normal');
    } catch (err) {
      setVideoStatus(panel, `读取视频配置失败：${err.message || err}`, 'bad');
    }
  }

  async function saveVideo(panel) {
    setVideoStatus(panel, '正在保存 AI 视频模型配置...', 'normal');
    const payload = {
      provider: value(panel, 'videoProvider') || videoDefaults.provider,
      baseUrl: value(panel, 'videoBaseUrl') || videoDefaults.baseUrl,
      model: value(panel, 'videoModel') || videoDefaults.model,
      apiKey: value(panel, 'videoApiKey'),
    };
    await request(VIDEO_API, { method: 'POST', body: JSON.stringify(payload) });
    setVideoStatus(panel, `已保存视频配置：${payload.model}`, 'ok');
  }

  async function testVideo(panel) {
    setVideoStatus(panel, '正在检查 AI 视频模型配置...', 'normal');
    const payload = {
      provider: value(panel, 'videoProvider') || videoDefaults.provider,
      baseUrl: value(panel, 'videoBaseUrl') || videoDefaults.baseUrl,
      model: value(panel, 'videoModel') || videoDefaults.model,
      apiKey: value(panel, 'videoApiKey'),
    };
    const result = await request(`${VIDEO_API}/test`, { method: 'POST', body: JSON.stringify(payload) });
    setVideoStatus(panel, result.message || `视频模型配置可用：${result.model}`, 'ok');
  }

  async function clearVideo(panel) {
    setVideoStatus(panel, '正在清除 AI 视频模型配置...', 'normal');
    await request(VIDEO_API, { method: 'DELETE' });
    await refreshVideo(panel);
  }

  async function refreshImage(panel) {
    try {
      const cfg = await request(IMAGE_API);
      panel.querySelector('[name="imageSource"]').value = cfg.imageSource || imageDefaults.imageSource;
      panel.querySelector('[name="imageProvider"]').value = cfg.provider || imageDefaults.provider;
      panel.querySelector('[name="imageBaseUrl"]').value = cfg.baseUrl || imageDefaults.baseUrl;
      panel.querySelector('[name="imageModel"]').value = cfg.model || imageDefaults.model;
      applyImageProviderMode(panel);
      panel.querySelector('[name="imageApiKey"]').value = '';
      panel.querySelector('[name="imageApiKey"]').placeholder = cfg.maskedKey
        ? `已保存 ${cfg.maskedKey}，留空不修改`
        : '粘贴图片模型 API Key';
      await refreshOfficialCatalog(panel);
      const sourceLabel = cfg.imageSource === 'official' ? '官方图片算力（积分）' : '本地配置';
      setImageStatus(panel, cfg.configured || cfg.imageSource === 'official' ? `AI 图片来源：${sourceLabel}` : '选择本地配置并填写图片模型 Key，或切换到官方算力（积分）', cfg.configured || cfg.imageSource === 'official' ? 'ok' : 'normal');
      const officialMode = cfg.imageSource === 'official';
      for (const el of Array.from(panel.querySelectorAll('[name="imageProvider"], [name="imageBaseUrl"], [name="imageModel"], [name="imageApiKey"]'))) {
        el.disabled = officialMode;
      }
    } catch (err) {
      setImageStatus(panel, `读取图片配置失败：${err.message || err}`, 'bad');
    }
  }

  async function saveImageSource(panel) {
    const imageSource = value(panel, 'imageSource') || imageDefaults.imageSource;
    if (imageSource === 'official') {
      await refreshOfficialCatalog(panel);
      if (panel.dataset.officialImageAvailable !== '1') {
        throw new Error('官方图片算力暂未开放');
      }
    }
    await request(IMAGE_SOURCE_API, { method: 'POST', body: JSON.stringify({ imageSource }) });
    setImageStatus(panel, imageSource === 'official' ? '已切换为官方图片算力（积分）' : '已切换为本地图片配置', 'ok');
  }

  async function saveImageCurrent(panel) {
    const imageSource = value(panel, 'imageSource') || imageDefaults.imageSource;
    setImageStatus(panel, '正在保存当前图片配置...', 'normal');
    if (imageSource === 'official') {
      await refreshOfficialCatalog(panel);
      if (panel.dataset.officialImageAvailable !== '1') {
        throw new Error('官方图片算力暂未开放');
      }
      await request(IMAGE_SOURCE_API, { method: 'POST', body: JSON.stringify({ imageSource }) });
      setImageStatus(panel, '已保存：官方图片算力（积分）。模型、价格和 Key 均由服务器控制。', 'ok');
      return;
    }
    const payload = {
      provider: value(panel, 'imageProvider') || imageDefaults.provider,
      baseUrl: value(panel, 'imageBaseUrl') || imageDefaults.baseUrl,
      model: value(panel, 'imageModel') || imageDefaults.model,
      apiKey: value(panel, 'imageApiKey'),
    };
    await request(IMAGE_API, { method: 'POST', body: JSON.stringify(payload) });
    await request(IMAGE_SOURCE_API, { method: 'POST', body: JSON.stringify({ imageSource }) });
    setImageStatus(panel, `已保存当前图片模型：${payload.model}`, 'ok');
  }

  async function testImage(panel) {
    setImageStatus(panel, '正在检查 AI 图片模型配置...', 'normal');
    const payload = {
      provider: value(panel, 'imageProvider') || imageDefaults.provider,
      baseUrl: value(panel, 'imageBaseUrl') || imageDefaults.baseUrl,
      model: value(panel, 'imageModel') || imageDefaults.model,
      apiKey: value(panel, 'imageApiKey'),
    };
    const result = await request(`${IMAGE_API}/test`, { method: 'POST', body: JSON.stringify(payload) });
    setImageStatus(panel, result.message || `图片模型配置可用：${result.model}`, 'ok');
  }

  async function clearImage(panel) {
    setImageStatus(panel, '正在清除 AI 图片模型配置...', 'normal');
    await request(IMAGE_API, { method: 'DELETE' });
    await refreshImage(panel);
  }

  async function refreshVoice(panel) {
    try {
      const cfg = await request(VOICE_API);
      panel.querySelector('[name="voiceProvider"]').value = cfg.provider || voiceDefaults.provider;
      panel.querySelector('[name="voiceBaseUrl"]').value = cfg.baseUrl || voiceDefaults.baseUrl;
      panel.querySelector('[name="voiceModel"]').value = cfg.model || voiceDefaults.model;
      applyVoiceProviderMode(panel);
      panel.querySelector('[name="voiceApiKey"]').value = '';
      panel.querySelector('[name="voiceApiKey"]').placeholder = cfg.maskedKey
        ? `已保存 ${cfg.maskedKey}，留空不修改`
        : '粘贴阿里百炼 API Key';
      setVoiceStatus(panel, cfg.configured ? `已启用口播/声音克隆：${cfg.model}` : '填写阿里百炼 API Key 后，上传口播录音即可克隆音色并生成配音', cfg.configured ? 'ok' : 'normal');
    } catch (err) {
      setVoiceStatus(panel, `读取口播配置失败：${err.message || err}`, 'bad');
    }
  }

  async function saveVoice(panel) {
    setVoiceStatus(panel, '正在保存口播/声音克隆配置...', 'normal');
    const payload = {
      provider: value(panel, 'voiceProvider') || voiceDefaults.provider,
      baseUrl: value(panel, 'voiceBaseUrl') || voiceDefaults.baseUrl,
      model: value(panel, 'voiceModel') || voiceDefaults.model,
      apiKey: value(panel, 'voiceApiKey'),
    };
    await request(VOICE_API, { method: 'POST', body: JSON.stringify(payload) });
    setVoiceStatus(panel, `已保存口播配置：${payload.model}`, 'ok');
  }

  async function testVoice(panel) {
    setVoiceStatus(panel, '正在检查口播/声音克隆配置...', 'normal');
    const payload = {
      provider: value(panel, 'voiceProvider') || voiceDefaults.provider,
      baseUrl: value(panel, 'voiceBaseUrl') || voiceDefaults.baseUrl,
      model: value(panel, 'voiceModel') || voiceDefaults.model,
      apiKey: value(panel, 'voiceApiKey'),
    };
    const result = await request(`${VOICE_API}/test`, { method: 'POST', body: JSON.stringify(payload) });
    setVoiceStatus(panel, result.message || `口播配置可用：${result.model}`, 'ok');
  }

  async function clearVoice(panel) {
    setVoiceStatus(panel, '正在删除口播/声音克隆配置...', 'normal');
    await request(VOICE_API, { method: 'DELETE' });
    await refreshVoice(panel);
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
    setDigitalStatus(panel, '已保存数字人配置', 'ok');
  }

  async function testDigital(panel) {
    setDigitalStatus(panel, '正在测试数字人供应商配置...', 'normal');
    const result = await request(`${DIGITAL_API}/test`, { method: 'POST' });
    setDigitalStatus(panel, result.message || '数字人供应商配置可用', 'ok');
  }

  async function clearDigital(panel) {
    setDigitalStatus(panel, '正在删除数字人配置...', 'normal');
    await request(DIGITAL_API, { method: 'DELETE' });
    await refreshDigital(panel);
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
        #${PANEL_ID} [data-official-ai-status] {
          margin-top: 10px;
          color: #9fb0c8;
          font-size: 12px;
        }
        #${PANEL_ID} [data-local-video-status] {
          margin-top: 10px;
          color: #9fb0c8;
          font-size: 12px;
        }
        #${PANEL_ID} [data-local-image-status] {
          margin-top: 10px;
          color: #9fb0c8;
          font-size: 12px;
        }
        #${PANEL_ID} [data-local-voice-status] {
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
        #${PANEL_ID} [data-official-ai-status][data-tone="ok"],
        #${PANEL_ID} [data-local-video-status][data-tone="ok"],
        #${PANEL_ID} [data-local-image-status][data-tone="ok"],
        #${PANEL_ID} [data-local-voice-status][data-tone="ok"],
        #${PANEL_ID} [data-digital-human-status][data-tone="ok"] { color: #3ddc97; }
        #${PANEL_ID} [data-local-llm-status][data-tone="bad"],
        #${PANEL_ID} [data-official-ai-status][data-tone="bad"],
        #${PANEL_ID} [data-local-video-status][data-tone="bad"],
        #${PANEL_ID} [data-local-image-status][data-tone="bad"],
        #${PANEL_ID} [data-local-voice-status][data-tone="bad"],
        #${PANEL_ID} [data-digital-human-status][data-tone="bad"] { color: #ff7b72; }
        @media (max-width: 720px) {
          #${PANEL_ID} .ws-grid { grid-template-columns: 1fr; }
        }
      </style>
      <div class="ws-title">运营虾本地模型配置</div>
      <div class="ws-grid">
        <label>AI 来源<select name="aiSource">
          <option value="official">官方 AI 算力</option>
          <option value="custom">自定义接口</option>
        </select></label>
        <label>官方算力说明<input value="服务器托管模型，按账号积分计费" readonly></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="source-save">保存 AI 来源</button>
      </div>
      <div data-official-ai-status>正在读取官方算力状态...</div>
      <div class="ws-divider"></div>
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
        <button type="button" data-primary data-action="save">保存</button>
        <button type="button" data-action="test">测试</button>
        <button type="button" data-action="clear">删除</button>
      </div>
      <div data-local-llm-status>正在读取配置...</div>
      <div class="ws-divider"></div>
      <div class="ws-subtitle">AI 视频生成模型配置</div>
      <p class="ws-help">视频工坊使用这里的本地视频模型配置，不再跳转千山网页。中转站请选择“自定义视频中转站”，填入 Base URL、模型/接入点 ID 和 API Key。</p>
      <div class="ws-grid">
        <label>视频服务商<select name="videoProvider">
          <option value="custom_openai">自定义视频中转站</option>
          <option value="aliyun_dashscope">阿里百炼 / 通义万相</option>
          <option value="volcengine_ark">火山方舟 Seedance</option>
          <option value="cool">Cool / mjapi 视频中转</option>
          <option value="wuyinkeji">速创 Grok Imagine</option>
        </select></label>
        <label>视频模型/接入点 ID<input name="videoModel" autocomplete="off" value="${videoDefaults.model}"></label>
        <div class="ws-help" data-video-model-recommendation>推荐配置：wan2.7-t2v，支持 2-15 秒整数时长，适合运营虾按分镜时长生成。</div>
        <label>视频 API 地址<input name="videoBaseUrl" autocomplete="off" value="${videoDefaults.baseUrl}"></label>
        <label>视频 API Key<input name="videoApiKey" type="password" autocomplete="off" placeholder="粘贴视频模型 API Key"></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="video-save">保存</button>
        <button type="button" data-action="video-test">测试</button>
        <button type="button" data-action="video-clear">删除</button>
        <a href="${ALIYUN_VIDEO_HELP_URL}" target="_blank" rel="noreferrer" style="align-self:center;color:#7dd3fc;font-size:12px;text-decoration:none;">如何配置 / 推荐模型</a>
      </div>
      <div data-local-video-status>正在读取视频配置...</div>
      <div class="ws-divider"></div>
      <div class="ws-subtitle">AI 图片生成模型配置</div>
      <p class="ws-help">封面和营销图片可使用本地自配图片模型，也可切换官方算力按积分生成。官方模式下模型、价格、余额和下载地址都由服务器控制。</p>
      <div data-official-ai-status>正在读取官方算力状态...</div>
      <div class="ws-grid">
        <label>图片来源<select name="imageSource">
          <option value="custom">本地配置</option>
          <option value="official">官方算力（积分）</option>
        </select></label>
        <label>图片服务商<select name="imageProvider">
          <option value="custom_openai">自定义图片中转站</option>
          <option value="aliyun_dashscope">阿里百炼 / 通义万相</option>
          <option value="volcengine">火山方舟 Seedream</option>
          <option value="cool">Cool / mjapi 图片中转</option>
          <option value="wuyinkeji">速创图片中转</option>
        </select></label>
        <label>图片模型/接入点 ID<input name="imageModel" autocomplete="off" value="${imageDefaults.model}"></label>
        <label>图片 API 地址<input name="imageBaseUrl" autocomplete="off" value="${imageDefaults.baseUrl}"></label>
        <label>图片 API Key<input name="imageApiKey" type="password" autocomplete="off" placeholder="粘贴图片模型 API Key"></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="image-save-current">保存当前配置</button>
        <button type="button" data-action="image-test">检测当前配置</button>
        <button type="button" data-action="image-clear">删除本地配置</button>
      </div>
      <div data-local-image-status>正在读取图片配置...</div>
      <div class="ws-divider"></div>
      <div class="ws-subtitle">口播 / 声音克隆模型配置</div>
      <p class="ws-help">用于上传自己的口播录音、克隆音色、视频工坊配音和音色试听。请填写阿里百炼 DashScope API Key；CosyVoice 推荐 cosyvoice-v3.5-plus，MiniMax 推荐 MiniMax/speech-2.8-hd。</p>
      <div class="ws-grid">
        <label>口播服务商<select name="voiceProvider">
          <option value="aliyun_dashscope">阿里百炼 CosyVoice</option>
          <option value="aliyun_minimax">阿里百炼 MiniMax</option>
        </select></label>
        <label>口播模型/接入点 ID<input name="voiceModel" autocomplete="off" value="${voiceDefaults.model}"></label>
        <label>口播 API 地址<input name="voiceBaseUrl" autocomplete="off" value="${voiceDefaults.baseUrl}" readonly></label>
        <label>口播 API Key<input name="voiceApiKey" type="password" autocomplete="off" placeholder="粘贴阿里百炼 API Key"></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="voice-save">保存</button>
        <button type="button" data-action="voice-test">测试</button>
        <button type="button" data-action="voice-clear">删除</button>
      </div>
      <div data-local-voice-status>正在读取口播配置...</div>
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
          <option value="qianshan_temp_upload">临时素材上传</option>
          <option value="custom_public_asset">自定义公网素材接口</option>
        </select></label>
        <label data-dh-for="baidu_xiling_photo">公网素材接口 URL<input name="xilingTempUploadUrl" autocomplete="off" placeholder="自定义上传方式才需要"></label>
        <label data-dh-for="baidu_xiling_photo">上传接口令牌<input name="xilingTempUploadToken" type="password" autocomplete="off" placeholder="可选"></label>
      </div>
      <div class="ws-actions">
        <button type="button" data-primary data-action="dh-save">保存</button>
        <button type="button" data-action="dh-test">测试</button>
        <button type="button" data-action="dh-clear">删除</button>
      </div>
      <div data-digital-human-status>正在读取数字人配置...</div>
    `;
    panel.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      button.disabled = true;
      try {
        const action = button.dataset.action;
        if (action === 'source-save') await saveAiSource(panel);
        if (action === 'save') await save(panel);
        if (action === 'test') await test(panel);
        if (action === 'clear') await clear(panel);
        if (action === 'video-save') await saveVideo(panel);
        if (action === 'video-test') await testVideo(panel);
        if (action === 'video-clear') await clearVideo(panel);
        if (action === 'image-save-current') await saveImageCurrent(panel);
        if (action === 'image-test') await testImage(panel);
        if (action === 'image-clear') await clearImage(panel);
        if (action === 'voice-save') await saveVoice(panel);
        if (action === 'voice-test') await testVoice(panel);
        if (action === 'voice-clear') await clearVoice(panel);
        if (action === 'dh-save') await saveDigital(panel);
        if (action === 'dh-test') await testDigital(panel);
        if (action === 'dh-clear') await clearDigital(panel);
      } catch (err) {
        const action = button.dataset.action || '';
        if (action.startsWith('video-')) setVideoStatus(panel, err.message || String(err), 'bad');
        else if (action.startsWith('image-')) setImageStatus(panel, err.message || String(err), 'bad');
        else if (action.startsWith('voice-')) setVoiceStatus(panel, err.message || String(err), 'bad');
        else if (action.startsWith('dh-')) setDigitalStatus(panel, err.message || String(err), 'bad');
        else setStatus(panel, err.message || String(err), 'bad');
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
      if (event.target && event.target.name === 'videoProvider') {
        applyVideoProviderMode(panel);
      }
      if (event.target && event.target.name === 'videoModel') {
        updateVideoRecommendation(panel);
      }
      if (event.target && event.target.name === 'imageProvider') {
        applyImageProviderMode(panel);
      }
      if (event.target && event.target.name === 'voiceProvider') {
        applyVoiceProviderMode(panel);
      }
    });
    refresh(panel);
    refreshVideo(panel);
    refreshImage(panel);
    refreshVoice(panel);
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
