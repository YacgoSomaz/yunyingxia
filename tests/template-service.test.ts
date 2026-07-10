import { describe, expect, it } from 'vitest'
import { TemplateService } from '../electron/template-service'

describe('TemplateService', () => {
  it('renders declared variables and clears missing values', () => {
    const service = new TemplateService(':memory:')

    expect(service.render('copy_outline', { topic: '夏日收纳', platform: '小红书' }))
      .toContain('主题：夏日收纳')
    expect(service.render('copy_outline', { topic: '夏日收纳' }))
      .not.toContain('{{platform}}')
  })

  it('restores an edited template to its built-in content', () => {
    const service = new TemplateService(':memory:')
    const builtIn = service.get('copy_title_generate')
    service.save({ ...builtIn, content: '仅用于测试的内容' })

    expect(service.get('copy_title_generate').content).toBe('仅用于测试的内容')
    service.reset('copy_title_generate')
    expect(service.get('copy_title_generate').content).toBe(builtIn.content)
  })
})
