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

    expect(source).toContain('process.env.LLM_API_KEY')
    expect(source).toContain('process.env.OPENAI_API_KEY')
    expect(source).toContain('process.env.DASHSCOPE_API_KEY')
    expect(source).toContain('using local env LLM provider=')
  })
})
