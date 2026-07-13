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
    const html = readFileSync(
      join(projectRoot, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'index.html'),
      'utf8',
    )

    expect(routes).toContain("router.get('/local-config'")
    expect(routes).toContain("router.post('/local-config'")
    expect(routes).toContain("router.post('/local-config/test'")
    expect(routes).toContain('manageUrl: null')
    expect(service).toContain('crypto_storage_1.cryptoStorage.encrypt(apiKey)')
    expect(service).toContain("const DEFAULT_MODEL = 'deepseek-v4-flash'")
    expect(service).toContain('LLM_PROVIDER_PRESETS')
    expect(service).toContain('custom_openai')
    expect(service).toContain('saved config rejected')
    expect(service).toContain('maskedKey')
    expect(panel).toContain('/api/llm/local-config')
    expect(panel).toContain('自定义中转站')
    expect(panel).toContain('isModelTabActive')
    expect(panel).toContain('rewriteCloudCopy')
    expect(panel).toContain('不需要去远端网页配置')
    expect(panel).not.toContain('sk-')
    expect(html).toContain('./local-llm-panel.js')
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
})
