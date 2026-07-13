import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('runtime data mode', () => {
  it('defaults to real sources and only enables mock mode explicitly', () => {
    const main = readFileSync('electron/main.ts', 'utf8')
    expect(main).toContain("process.env.USE_MOCK = process.env.WANSHAN_USE_MOCK === '1' ? '1' : '0'")
    expect(main).not.toContain("process.env.USE_MOCK = '1'")
    expect(main).toContain("'services', 'llm-config.js'")
    expect(main).toContain('await llmConfig.init()')
  })
})
