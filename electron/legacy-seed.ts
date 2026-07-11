import path from 'node:path'

const ACCIDENTAL_TEMPLATE_NAMES = [
  '小红书种草笔记',
  '小红书干货清单',
  '抖音短视频口播',
  '抖音带货脚本',
  '视频号情绪共鸣',
  'B站教程脚本',
  '微博热点短评',
  '通用产品测评',
]

interface SeedResult {
  stylePresets?: string
  videoAssets?: string
  mockAccounts?: string
  avatarAssets?: string
  accidentalTemplates?: string
}

async function maybeCall(label: keyof SeedResult, callback: () => Promise<unknown>, result: SeedResult): Promise<void> {
  try {
    await callback()
    result[label] = 'ok'
  } catch (error) {
    result[label] = error instanceof Error ? error.message : String(error)
  }
}

async function removeAccidentalTemplateSeeds(runtimeRoot: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sqlite } = require(path.join(runtimeRoot, 'dist', 'db', 'index.js')) as { sqlite: any }
  const placeholders = ACCIDENTAL_TEMPLATE_NAMES.map(() => '?').join(', ')
  const statement = sqlite.prepare(`delete from templates where is_builtin = 1 and name in (${placeholders})`)
  const result = statement.run(...ACCIDENTAL_TEMPLATE_NAMES)
  return Number(result.changes || 0)
}

export async function seedLegacyRuntimeAssets(runtimeRoot: string): Promise<SeedResult> {
  const result: SeedResult = {}

  await maybeCall('accidentalTemplates', async () => {
    const removed = await removeAccidentalTemplateSeeds(runtimeRoot)
    return removed
  }, result)

  await maybeCall('stylePresets', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { styleEngine } = require(path.join(runtimeRoot, 'dist', 'services', 'style-engine', 'index.js'))
    await styleEngine.seedBuiltinPresets()
  }, result)

  await maybeCall('videoAssets', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { videoWorkshop } = require(path.join(runtimeRoot, 'dist', 'services', 'video-workshop.js'))
    await videoWorkshop.seedBuiltinAssets()
  }, result)

  await maybeCall('mockAccounts', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { distribute } = require(path.join(runtimeRoot, 'dist', 'services', 'distribute.js'))
    await distribute.seedMockAccounts()
  }, result)

  await maybeCall('avatarAssets', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { avatarAssetService } = require(path.join(runtimeRoot, 'dist', 'services', 'avatar-asset.js'))
    await avatarAssetService.init()
  }, result)

  return result
}
