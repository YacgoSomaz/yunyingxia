import type { ModelSettings, SaveModelSettings, TemplateDefinition, WorkspaceRecord, GenerateInput } from '../shared/contracts'

declare global {
  interface Window {
    wanshan: {
      app: { name: string; offline: boolean }
      templates: { list(): Promise<TemplateDefinition[]>; save(template: TemplateDefinition): Promise<TemplateDefinition>; reset(id: string): Promise<TemplateDefinition>; render(input: { id: string; values: Record<string, string> }): Promise<string> }
      settings: { load(): Promise<ModelSettings>; save(input: SaveModelSettings): Promise<ModelSettings>; clear(): Promise<ModelSettings>; test(): Promise<{ ok: boolean; message: string }> }
      workspace: { list(query?: string): Promise<WorkspaceRecord[]>; generate(input: GenerateInput): Promise<WorkspaceRecord>; remove(id: number): Promise<void> }
    }
  }
}

export {}
