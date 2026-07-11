import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_COPYWRITING_TEMPLATES } from '../electron/legacy-seed'

describe('legacy runtime seeding', () => {
  it('restores built-in preset and copywriting template initialization', () => {
    const root = process.cwd()
    const main = readFileSync(join(root, 'electron', 'main.ts'), 'utf8')
    const seed = readFileSync(join(root, 'electron', 'legacy-seed.ts'), 'utf8')

    expect(main).toContain('seedLegacyRuntimeAssets')
    expect(seed).toContain('seedBuiltinPresets')
    expect(seed).toContain('seedBuiltinAssets')
    expect(seed).toContain('seedMockAccounts')
    expect(seed).toContain('avatarAssetService')
  })

  it('includes enough built-in copywriting templates for dropdowns to render options', () => {
    expect(BUILTIN_COPYWRITING_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    expect(BUILTIN_COPYWRITING_TEMPLATES.map((item) => item.platform)).toEqual(
      expect.arrayContaining(['小红书', '抖音', '视频号', 'B站', '微博', '通用']),
    )
    expect(BUILTIN_COPYWRITING_TEMPLATES.every((item) => item.structure.trim().length > 10)).toBe(true)
  })
})
