import type { ChatMessage, CompletionClient } from './workflow-service'

export class OpenAiCompatibleClient implements CompletionClient {
  constructor(private readonly getSettings: () => { baseUrl: string; model: string; apiKey: string }) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const settings = this.getSettings()
    if (!settings.baseUrl || !settings.model || !settings.apiKey) throw new Error('请先在模型设置中保存 Base URL、模型名与 API Key')
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: settings.model, messages, temperature: 0.7 })
    })
    if (!response.ok) throw new Error(`模型服务请求失败: ${response.status}`)
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('模型服务未返回文本内容')
    return content
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.complete([{ role: 'user', content: 'Reply with OK only.' }])
      return { ok: true, message: '模型连接成功' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '模型连接失败' }
    }
  }
}
