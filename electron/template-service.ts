import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { BUILTIN_TEMPLATES } from './templates'
import type { TemplateDefinition, TemplateId } from '../shared/contracts'

export class TemplateService {
  private readonly filePath: string
  private templates: TemplateDefinition[]

  constructor(databasePath: string) {
    this.filePath = databasePath
    this.templates = this.load()
  }

  list(): TemplateDefinition[] {
    return this.templates.map((template) => ({ ...template, variables: [...template.variables] }))
  }

  get(id: TemplateId): TemplateDefinition {
    const template = this.templates.find((item) => item.id === id)
    if (!template) throw new Error(`模板不存在: ${id}`)
    return { ...template, variables: [...template.variables] }
  }

  save(template: TemplateDefinition): TemplateDefinition {
    const builtIn = BUILTIN_TEMPLATES.find((item) => item.id === template.id)
    if (!builtIn) throw new Error(`不能覆盖未知内置模板: ${template.id}`)
    this.templates = this.templates.map((item) => item.id === template.id ? {
      ...template,
      name: template.name.trim(),
      description: template.description.trim(),
      variables: [...template.variables]
    } : item)
    this.persist()
    return this.get(template.id)
  }

  reset(id: TemplateId): TemplateDefinition {
    const builtIn = BUILTIN_TEMPLATES.find((item) => item.id === id)
    if (!builtIn) throw new Error(`模板不存在: ${id}`)
    this.templates = this.templates.map((item) => item.id === id ? { ...builtIn, variables: [...builtIn.variables] } : item)
    this.persist()
    return this.get(id)
  }

  render(id: TemplateId, values: Record<string, string | undefined>): string {
    const template = this.get(id)
    return template.content.replace(/\{\{([\w_]+)\}\}/g, (_, variable: string) => {
      if (!template.variables.includes(variable)) return ''
      return values[variable] ?? ''
    })
  }

  private load(): TemplateDefinition[] {
    if (this.filePath === ':memory:' || !existsSync(this.filePath)) {
      return BUILTIN_TEMPLATES.map((template) => ({ ...template, variables: [...template.variables] }))
    }
    try {
      const stored = JSON.parse(readFileSync(this.filePath, 'utf8')) as TemplateDefinition[]
      return BUILTIN_TEMPLATES.map((builtIn) => {
        const saved = stored.find((item) => item.id === builtIn.id)
        return saved ? { ...saved, variables: [...saved.variables] } : { ...builtIn, variables: [...builtIn.variables] }
      })
    } catch {
      return BUILTIN_TEMPLATES.map((template) => ({ ...template, variables: [...template.variables] }))
    }
  }

  private persist(): void {
    if (this.filePath === ':memory:') return
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.templates, null, 2), 'utf8')
  }
}
