import path from 'node:path'

export interface BuiltinCopywritingTemplate {
  name: string
  category: string
  platform: string
  structure: string
  exampleText: string
}

export const BUILTIN_COPYWRITING_TEMPLATES: BuiltinCopywritingTemplate[] = [
  {
    name: '小红书种草笔记',
    category: '种草',
    platform: '小红书',
    structure: '痛点开场 -> 真实体验 -> 3 个核心卖点 -> 使用建议 -> 互动提问',
    exampleText: '开头先说具体困扰，再用第一人称描述体验，正文保留清晰分段和话题标签，结尾引导收藏或评论。',
  },
  {
    name: '小红书干货清单',
    category: '知识',
    platform: '小红书',
    structure: '结论前置 -> 清单分点 -> 避坑提醒 -> 保存提示',
    exampleText: '适合教程、生活技巧和经验复盘。每一点用短标题，正文控制在 60 字以内。',
  },
  {
    name: '抖音短视频口播',
    category: '口播',
    platform: '抖音',
    structure: '3 秒钩子 -> 冲突/反差 -> 方法或观点 -> 行动号召',
    exampleText: '第一句必须有停留理由，句子短、节奏快，适合 30-60 秒短视频。',
  },
  {
    name: '抖音带货脚本',
    category: '带货',
    platform: '抖音',
    structure: '人群痛点 -> 场景演示 -> 卖点证明 -> 价格/福利 -> 下单提醒',
    exampleText: '少用空泛形容词，多写可拍摄动作，例如打开、对比、试用、前后变化。',
  },
  {
    name: '视频号情绪共鸣',
    category: '情感',
    platform: '视频号',
    structure: '生活场景 -> 情绪共鸣 -> 观点升华 -> 温和互动',
    exampleText: '语气克制温暖，适合家庭、职场、人生成长和中青年用户。',
  },
  {
    name: 'B站教程脚本',
    category: '教程',
    platform: 'B站',
    structure: '目标说明 -> 前置条件 -> 分步骤演示 -> 常见错误 -> 总结',
    exampleText: '适合 3-8 分钟教程，保留章节感和解释空间，避免过度标题党。',
  },
  {
    name: '微博热点短评',
    category: '热点',
    platform: '微博',
    structure: '一句话立场 -> 事件背景 -> 观点拆解 -> 讨论提问',
    exampleText: '适合热点跟进，表达明确但避免极端措辞，结尾抛出可讨论问题。',
  },
  {
    name: '通用产品测评',
    category: '测评',
    platform: '通用',
    structure: '测试对象 -> 测试维度 -> 实测表现 -> 适合/不适合人群 -> 购买建议',
    exampleText: '强调真实测试和适用边界，适合跨平台复用后再微调语气。',
  },
]

interface SeedResult {
  stylePresets?: string
  videoAssets?: string
  mockAccounts?: string
  avatarAssets?: string
  copywritingTemplates: number
}

type SeedStatusLabel = Exclude<keyof SeedResult, 'copywritingTemplates'>

async function maybeCall(label: SeedStatusLabel, callback: () => Promise<unknown>, result: SeedResult): Promise<void> {
  try {
    await callback()
    result[label] = 'ok'
  } catch (error) {
    result[label] = error instanceof Error ? error.message : String(error)
  }
}

export async function seedCopywritingTemplates(runtimeRoot: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db } = require(path.join(runtimeRoot, 'dist', 'db', 'index.js')) as { db: any }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { templates } = require(path.join(runtimeRoot, 'dist', 'db', 'schema', 'index.js')) as { templates: any }

  const existing = await db.select().from(templates)
  const existingKeys = new Set(
    existing
      .filter((row: any) => row.isBuiltin === 1)
      .map((row: any) => `${row.category}|${row.platform}|${row.name}`),
  )

  let inserted = 0
  for (const template of BUILTIN_COPYWRITING_TEMPLATES) {
    const key = `${template.category}|${template.platform}|${template.name}`
    if (existingKeys.has(key)) continue
    await db.insert(templates).values({
      name: template.name,
      category: template.category,
      platform: template.platform,
      structure: template.structure,
      exampleText: template.exampleText,
      isBuiltin: 1,
    })
    inserted += 1
  }
  return inserted
}

export async function seedLegacyRuntimeAssets(runtimeRoot: string): Promise<SeedResult> {
  const result: SeedResult = { copywritingTemplates: 0 }

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

  result.copywritingTemplates = await seedCopywritingTemplates(runtimeRoot)
  return result
}
