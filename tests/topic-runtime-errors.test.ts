import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')

describe('topic runtime source safety', () => {
  it('does not silently insert offline topics in real mode', () => {
    const source = fs.readFileSync(
      path.join(root, 'vendor/qianshan-runtime/dist/services/topic-radar.js'),
      'utf8',
    )

    expect(source).toContain("source: 'none', scraperError, scraperErrorMessage, scraperAccount")
    expect(source).toContain("scraperError = 'no-llm'")
    expect(source).toContain('if (config_1.USE_MOCK)')
  })
})
