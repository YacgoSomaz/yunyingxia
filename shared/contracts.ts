export type TemplateId =
  | 'topic_analyze'
  | 'copy_outline'
  | 'copy_expand_scene'
  | 'copy_polish'
  | 'copy_subtitle'
  | 'copy_title_generate'
  | 'copy_platform_adapt'
  | 'copy_video_rewrite'
  | 'copy_text_rewrite'
  | 'video_expand_prompt'
  | 'video_translate_en'

export interface TemplateDefinition {
  id: TemplateId
  name: string
  description: string
  variables: string[]
  content: string
}

export interface ModelSettings {
  baseUrl: string
  model: string
  hasApiKey: boolean
}

export interface SaveModelSettings extends Omit<ModelSettings, 'hasApiKey'> {
  apiKey?: string
}

export interface WorkspaceRecord {
  id: number
  title: string
  topic: string
  platform: string
  style: string
  notes: string
  outline: string
  content: string
  titles: string
  subtitles: string
  createdAt: string
  updatedAt: string
}

export interface GenerateInput {
  topic: string
  platform: string
  style: string
  notes?: string
}
