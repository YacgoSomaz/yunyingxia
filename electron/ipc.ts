import { app, ipcMain, safeStorage } from 'electron'
import path from 'node:path'
import { z } from 'zod'
import { CredentialService } from './credential-service'
import { OpenAiCompatibleClient } from './llm-client'
import { TemplateService } from './template-service'
import { WorkspaceService } from './workspace-service'
import { WorkflowService } from './workflow-service'

const templateId = z.enum(['topic_analyze', 'copy_outline', 'copy_expand_scene', 'copy_polish', 'copy_subtitle', 'copy_title_generate', 'copy_platform_adapt', 'copy_video_rewrite', 'copy_text_rewrite', 'video_expand_prompt', 'video_translate_en'])
const settingsInput = z.object({ baseUrl: z.string(), model: z.string(), apiKey: z.string().optional() })
const generationInput = z.object({ topic: z.string().trim().min(1).max(240), platform: z.string().trim().min(1).max(80), style: z.string().trim().min(1).max(120), notes: z.string().max(4000).optional() })

export function registerIpcHandlers(): void {
  const dataDir = app.getPath('userData')
  const templates = new TemplateService(path.join(dataDir, 'wanshan-prompts.json'))
  const codec = {
    encrypt(value: string): string {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全加密不可用，无法保存 API Key')
      return safeStorage.encryptString(value).toString('base64')
    },
    decrypt(value: string): string { return safeStorage.decryptString(Buffer.from(value, 'base64')) }
  }
  const credentials = new CredentialService(path.join(dataDir, 'wanshan-settings.json'), codec)
  const workspace = new WorkspaceService(path.join(dataDir, 'wanshan-workspace.json'))
  const llm = new OpenAiCompatibleClient(() => ({ ...credentials.load(), apiKey: credentials.getApiKey() }))
  const workflow = new WorkflowService(templates, workspace, llm)

  ipcMain.handle('templates:list', () => templates.list())
  ipcMain.handle('templates:save', (_event, input) => {
    const value = z.object({ id: templateId, name: z.string().min(1).max(80), description: z.string().max(240), variables: z.array(z.string().max(60)).max(20), content: z.string().min(1).max(20000) }).parse(input)
    return templates.save(value)
  })
  ipcMain.handle('templates:reset', (_event, id) => templates.reset(templateId.parse(id)))
  ipcMain.handle('templates:render', (_event, input) => {
    const value = z.object({ id: templateId, values: z.record(z.string().max(8000).optional()) }).parse(input)
    return templates.render(value.id, value.values)
  })
  ipcMain.handle('settings:load', () => credentials.load())
  ipcMain.handle('settings:save', (_event, input) => credentials.save(settingsInput.parse(input)))
  ipcMain.handle('settings:clear', () => credentials.clear())
  ipcMain.handle('settings:test', () => llm.testConnection())
  ipcMain.handle('workspace:list', (_event, query) => workspace.list(z.string().max(200).optional().parse(query) ?? ''))
  ipcMain.handle('workspace:remove', (_event, id) => workspace.remove(z.number().int().positive().parse(id)))
  ipcMain.handle('workspace:generate', async (_event, input) => workflow.generate(generationInput.parse(input), () => undefined))
}
