import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('legacy runtime seeding', () => {
  it('restores original Qianshan runtime asset initialization', () => {
    const root = process.cwd()
    const main = readFileSync(join(root, 'electron', 'main.ts'), 'utf8')
    const seed = readFileSync(join(root, 'electron', 'legacy-seed.ts'), 'utf8')

    expect(main).toContain('seedLegacyRuntimeAssets')
    expect(seed).toContain('seedBuiltinPresets')
    expect(seed).toContain('seedBuiltinAssets')
    expect(seed).toContain('seedMockAccounts')
    expect(seed).toContain('avatarAssetService')
  })

  it('does not invent copywriting templates that are absent from original Qianshan', () => {
    const seed = readFileSync(join(process.cwd(), 'electron', 'legacy-seed.ts'), 'utf8')
    expect(seed).not.toContain('BUILTIN_COPYWRITING_TEMPLATES')
    expect(seed).not.toContain('seedCopywritingTemplates')
    expect(seed).not.toContain('db.insert(templates)')
    expect(seed).toContain('removeAccidentalTemplateSeeds')
  })
})
