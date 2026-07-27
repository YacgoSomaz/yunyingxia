import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('legacy runtime LLM selection', () => {
  it('does not silently use MockLLMClient in real mode when credentials are missing', () => {
    const source = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm', 'index.js'),
      'utf8',
    )

    expect(source).toContain('config_1.USE_MOCK')
    expect(source).toContain('未配置可用的 AI 文案模型凭据')
    expect(source).not.toContain('No credential for ${provider}, falling back to mock')
    expect(source).toContain('USE_MOCK=1, falling back to mock')
  })

  it('can register a local OpenAI-compatible credential from environment variables', () => {
    const source = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm-config.js'),
      'utf8',
    )

    expect(source).toContain("require(\"./local-llm-config\")")
    expect(source).toContain('using local saved LLM provider=')
    expect(source).toContain('model: local.model')
    expect(source).toContain('process.env.LLM_API_KEY')
    expect(source).toContain('process.env.OPENAI_API_KEY')
    expect(source).toContain('process.env.DASHSCOPE_API_KEY')
    expect(source).toContain('using local env LLM provider=')
  })

  it('exposes local LLM configuration endpoints without embedding secrets in renderer files', () => {
    const routes = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'routes', 'llm.js'),
      'utf8',
    )
    const service = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'local-llm-config.js'),
      'utf8',
    )
    const panel = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'local-llm-panel.js'),
      'utf8',
    )
    const llmConfig = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm-config.js'),
      'utf8',
    )
    const html = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'index.html'),
      'utf8',
    )

    expect(routes).toContain("router.get('/local-config'")
    expect(routes).toContain("router.post('/local-config'")
    expect(routes).toContain("router.post('/local-config/test'")
    expect(routes).toContain("router.get('/ai-source'")
    expect(routes).toContain("router.post('/ai-source'")
    expect(routes).toContain("router.get('/official-catalog'")
    expect(routes).toContain("router.get('/local-video-config'")
    expect(routes).toContain("router.post('/local-video-config'")
    expect(routes).toContain("router.post('/local-video-config/test'")
    expect(routes).toContain("router.get('/local-image-config'")
    expect(routes).toContain("router.post('/local-image-source'")
    expect(routes).toContain("router.post('/local-image-config'")
    expect(routes).toContain("router.post('/local-image-config/test'")
    expect(routes).toContain("router.get('/local-voice-config'")
    expect(routes).toContain("router.post('/local-voice-config'")
    expect(routes).toContain("router.post('/local-voice-config/test'")
    expect(routes).toContain('manageUrl: null')
    expect(service).toContain('crypto_storage_1.cryptoStorage.encrypt(apiKey)')
    expect(service).toContain('getVideoCredential')
    expect(service).toContain('getAiSource')
    expect(service).toContain('saveAiSource')
    expect(service).toContain("source === 'official'")
    expect(service).toContain('VIDEO_PROVIDER_PRESETS')
    expect(service).toContain("const DEFAULT_VIDEO_MODEL = 'wan2.7-t2v'")
    expect(service).toContain('saveVideo')
    expect(service).toContain('IMAGE_PROVIDER_PRESETS')
    expect(service).toContain('getImageSource')
    expect(service).toContain('getImageCredential')
    expect(service).toContain('saveImageSource')
    expect(service).toContain('saveImage')
    expect(service).toContain('VOICE_PROVIDER_PRESETS')
    expect(service).toContain('getVoiceCredential')
    expect(service).toContain('saveVoice')
    expect(service).toContain("const DEFAULT_MODEL = 'deepseek-v4-flash'")
    expect(service).toContain('LLM_PROVIDER_PRESETS')
    expect(service).toContain('custom_openai')
    expect(service).toContain('saved config rejected')
    expect(service).toContain('maskedKey')
    expect(panel).toContain('/api/llm/local-config')
    expect(panel).toContain('/api/llm/ai-source')
    expect(panel).toContain('/api/llm/official-catalog')
    expect(panel).toContain('官方 AI 算力')
    expect(panel).toContain('服务器托管模型，按账号积分计费')
    expect(panel).toContain("querySelectorAll('[data-official-ai-status]')")
    expect(panel).toContain('function officialTaskFromCatalog')
    expect(panel).toContain("officialTaskFromCatalog(cfg, 'operation_image')")
    expect(panel).toContain('panel.dataset.officialImageAvailable')
    expect(panel).toContain('/api/llm/local-video-config')
    expect(panel).toContain('/api/llm/local-image-config')
    expect(panel).toContain('/api/llm/local-image-source')
    expect(panel).toContain('/api/llm/local-voice-config')
    expect(panel).toContain('自定义中转站')
    expect(panel).toContain('AI 视频生成模型配置')
    expect(panel).toContain('AI 图片生成模型配置')
    expect(panel).toContain('口播 / 声音克隆模型配置')
    expect(panel).toContain('自定义视频中转站')
    expect(panel).toContain('推荐配置：wan2.7-t2v')
    expect(panel).toContain('如何配置 / 推荐模型')
    expect(panel).toContain('https://help.aliyun.com/zh/model-studio/text-to-video-api-reference')
    expect(panel).toContain('保存当前配置')
    expect(panel).toContain('检测当前配置')
    expect(panel).toContain('image-save-current')
    expect(panel).toContain('image-clear')
    expect(panel).toContain('删除本地配置')
    expect(panel).not.toContain('保存图片来源')
    expect(panel).not.toContain('保存图片配置')
    expect(panel).not.toContain('检查图片配置')
    expect(panel).not.toContain('刷新图片状态')
    expect(panel).not.toContain('刷新视频状态')
    expect(panel).not.toContain('刷新状态')
    expect(panel).not.toContain('刷新数字人状态')
    expect(panel).toContain('官方图片算力（积分）')
    expect(panel).toContain('官方图片算力暂未开放')
    expect(panel).toContain('officialMode')
    expect(panel).toContain('[name="imageProvider"], [name="imageBaseUrl"], [name="imageModel"], [name="imageApiKey"]')
    expect(panel).toContain('isModelTabActive')
    expect(panel).toContain('rewriteCloudCopy')
    expect(panel).toContain('不需要去远端网页配置')
    expect(panel).not.toContain('去 qianshanai.cn 网页端配置')
    expect(panel).not.toContain('sk-')
    expect(llmConfig).toContain("aiSource === 'official'")
    expect(llmConfig).toContain("provider: 'official_ai'")
    expect(llmConfig).toContain('using official AI credits provider=official_ai')
    expect(llmConfig).toContain("aiSource === 'custom' ? await local_llm_config_1.localLlmConfig.getCredential() : null")
    expect(html).toContain('./local-llm-panel.js')
  })

  it('uses local voice model config for speech clone and TTS before falling back to cloud voice config', () => {
    const oneClick = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'one-click.js'),
      'utf8',
    )
    const upload = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'dashscope-file-upload.js'),
      'utf8',
    )
    const clone = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'tts-clone.js'),
      'utf8',
    )

    expect(oneClick).toContain('local_llm_config_1.localLlmConfig.getVoiceCredential')
    expect(oneClick).toContain("source: 'local-voice'")
    expect(oneClick).toContain('运营虾本地口播模型配置')
    expect(upload).toContain('local_llm_config_1.localLlmConfig.getVoiceCredential')
    expect(upload).toContain('未配置百炼 voice key，请在运营虾本地模型配置里填写口播/声音克隆配置')
    expect(clone).toContain('local_llm_config_1.localLlmConfig.getVoiceCredential')
    expect(clone).toContain('未配置百炼 voice key，请在运营虾本地模型配置里填写口播/声音克隆配置')
  })

  it('implements official AI credits without shipping model/provider secrets', () => {
    const official = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'official-ai-client.js'),
      'utf8',
    )
    const llm = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm', 'index.js'),
      'utf8',
    )

    expect(official).toContain("const PRODUCT_ID = 'operation_shrimp'")
    expect(official).toContain("const ENTITLEMENT = 'operation_course'")
    expect(official).toContain("const ANALYSIS_TASK_TYPE = 'operation_analysis'")
    expect(official).toContain("const IMAGE_TASK_TYPE = 'operation_image'")
    expect(official).toContain("'X-Product-Code': PRODUCT_ID")
    expect(official).toContain('/api/v1/ai/catalog?product_id=')
    expect(official).toContain("'/api/v1/ai/jobs'")
    expect(official).toContain('/api/v1/ai/jobs/${encodeURIComponent(id)}')
    expect(official).toContain('idempotencyKey')
    expect(official).toContain('operationImage')
    expect(official).toContain('ensureImageCatalogAvailable')
    expect(official).toContain('function normalizeTaskAvailability')
    expect(official).toContain('function normalizeTaskMap')
    expect(official).toContain('camelTaskType')
    expect(official).toContain('function collectNestedText')
    expect(official).toContain('function collectNestedAssets')
    expect(official).toContain('task.task_type')
    expect(official).toContain('available_tasks')
    expect(official).toContain('operationAnalysis')
    expect(official).toContain('root.user?.energy_balance')
    expect(official).toContain('choices?.[0]?.message?.content')
    expect(official).toContain("safeJson(choice).delta?.content")
    expect(official).toContain('result_text')
    expect(official).toContain('output.text')
    expect(official).toContain('result_assets')
    expect(official).toContain('result.assets')
    expect(official).toContain('generateImage(inputText')
    expect(official).toContain('result_assets')
    expect(official).toContain('display_url')
    expect(official).toContain('displayUrl')
    expect(official).toContain('download_url')
    expect(official).toContain('asset.url')
    expect(official).toContain('image_urls')
    expect(official).toContain('nestedData.job')
    expect(official).toContain('积分|余额|算力|不足|欠费')
    expect(official).toContain('created.status === 202')
    expect(official).toContain('product_id: PRODUCT_ID')
    expect(official).toContain('task_type: taskType')
    expect(official).toContain('input_text: inputText')
    expect(official).toContain('idempotency_key: idempotencyKey')
    expect(official).toContain("if (!msg || msg.role === 'system')")
    expect(official).toContain('官方算力暂未开放')
    expect(official).toContain('官方图片算力暂未开放')
    expect(official).toContain('官方 AI 算力积分不足')
    expect(official).toContain('未开通运营虾会员')
    expect(official).toContain('图片生成失败，积分已按服务端规则自动退款')
    expect(official).toContain('function isOfficialRateLimitError')
    expect(official).toContain('createJobWithRetry')
    expect(official).toContain('pollErrors')
    expect(official).toContain('Math.min(12000')
    expect(official).not.toContain('system_prompt')
    expect(official).not.toContain('base_url')
    expect(official).not.toContain('api_key')
    expect(official).not.toContain('model_name')
    expect(official).not.toContain('/chat/completions')
    expect(official).not.toContain('/images/generations')
    expect(official).not.toContain('/models')
    expect(llm).toContain('require("../official-ai-client")')
    expect(llm).toContain("provider === 'official_ai'")
    expect(llm).toContain('cred?.official === true')
  })

  it('routes AI image generation through either local config or signed official jobs', () => {
    const imageGen = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'ai-image-gen.js'),
      'utf8',
    )

    expect(imageGen).toContain('getImageSource')
    expect(imageGen).toContain("imageSource === 'official'")
    expect(imageGen).toContain('getImageCredential')
    expect(imageGen).toContain("providerCode: 'official_ai'")
    expect(imageGen).toContain('officialAiClient.generateImage(prompt, idempotencyKey)')
    expect(imageGen).toContain('crypto_1.default.randomUUID()')
    expect(imageGen).toContain('first?.display_url || first?.download_url')
    expect(imageGen).toContain('displayUrl: first.display_url || imageUrl')
    expect(imageGen).toContain('downloadUrl: first.download_url || imageUrl')
    expect(imageGen).toContain('未配置 AI 图片模型')
    expect(imageGen).not.toContain("llmTierConfig.resolveCategory('image')")
    expect(imageGen).not.toContain('getDecryptedKey')
    expect(imageGen).not.toContain('qianshanai.cn 网页端配置')
    expect(imageGen).not.toContain('basePrompt.slice(0, 80)')
    expect(imageGen).not.toContain('downloading ${imageUrl}')
  })

  it('uses local AI video configuration before legacy cloud video configuration', () => {
    const source = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'ai-video-gen.js'),
      'utf8',
    )

    expect(source).toContain('require("./local-llm-config")')
    expect(source).toContain('getVideoCredential')
    expect(source).toContain('using local video config provider=')
    expect(source).toContain('未配置 AI 视频模型')
    expect(source).toContain('运营虾本地模型配置')
    expect(source).toContain('/^(wan2\\.2|wanx2\\.1)-t2v/i.test(model) ? 5 : duration')
    expect(source).not.toContain('请到 qianshanai.cn 网页端配置')
  })

  it('keeps digital human overlay as picture-in-picture without changing scene canvas aspect', () => {
    const digital = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'digital-human-gen.js'),
      'utf8',
    )
    const oneClick = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'one-click.js'),
      'utf8',
    )

    expect(oneClick).toContain('normalizedPaths[i] = withAvatar')
    expect(oneClick).toContain('scenePath: normalizedPaths[i]')
    expect(digital).toContain('注意:必须保持原比例')
    expect(digital).toContain("scale='if(gt(iw,ih),-2,${size})':'if(gt(iw,ih),${size},-2)'")
    expect(digital).not.toContain('scale=${w}:${h}')
    expect(digital).toContain('[0:v][av]overlay=')
    expect(digital).toContain('-map\', \'[v]')
  })

  it('does not return mock image search results in real mode', () => {
    const source = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'image-search.js'),
      'utf8',
    )

    expect(source).toContain("throw new Error('未配置图片搜索 API Key")
    expect(source).toContain('if (config_1.USE_MOCK) {')
    expect(source).toContain('return []')
    expect(source).not.toContain('所有级都空：回退 Mock')
  })

  it('does not surface provider API keys or raw upstream auth payloads to users', () => {
    for (const file of [
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm', 'openai-client.js'),
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm', 'deepseek-client.js'),
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm', 'qwen-client.js'),
      join(projectRoot, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm', 'claude-client.js'),
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain('sanitizeProviderError')
      expect(source).toContain('API Key 无效或无权限')
      expect(source).not.toContain('${await res.text()}')
    }
  })
})
