import { useEffect, useMemo, useState } from 'react'
import type { ModelSettings, TemplateDefinition, WorkspaceRecord } from '../shared/contracts'

type View = 'workspace' | 'prompts' | 'settings' | 'history'
const emptySettings: ModelSettings = { baseUrl: '', model: '', hasApiKey: false }

export default function App() {
  const [view, setView] = useState<View>('workspace')
  const [templates, setTemplates] = useState<TemplateDefinition[]>([])
  const [selectedId, setSelectedId] = useState('copy_outline')
  const [draft, setDraft] = useState<TemplateDefinition | null>(null)
  const [settings, setSettings] = useState<ModelSettings>(emptySettings)
  const [apiKey, setApiKey] = useState('')
  const [records, setRecords] = useState<WorkspaceRecord[]>([])
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('小红书')
  const [style, setStyle] = useState('轻松实用')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<WorkspaceRecord | null>(null)

  const selected = useMemo(() => templates.find((item) => item.id === selectedId) ?? null, [templates, selectedId])
  useEffect(() => { void refresh() }, [])
  useEffect(() => { setDraft(selected ? { ...selected, variables: [...selected.variables] } : null) }, [selected])

  async function refresh() {
    const [nextTemplates, nextSettings, nextRecords] = await Promise.all([window.wanshan.templates.list(), window.wanshan.settings.load(), window.wanshan.workspace.list()])
    setTemplates(nextTemplates); setSettings(nextSettings); setRecords(nextRecords)
  }

  async function generate() {
    setStatus('正在生成文案…')
    try {
      const generated = await window.wanshan.workspace.generate({ topic, platform, style, notes })
      setResult(generated); setRecords(await window.wanshan.workspace.list()); setStatus('生成完成，已保存到本地历史记录')
    } catch (error) { setStatus(error instanceof Error ? error.message : '生成失败') }
  }

  async function saveSettings() {
    try { setSettings(await window.wanshan.settings.save({ baseUrl: settings.baseUrl, model: settings.model, apiKey })); setApiKey(''); setStatus('模型设置已安全保存到本机') }
    catch (error) { setStatus(error instanceof Error ? error.message : '保存失败') }
  }

  async function saveTemplate() {
    if (!draft) return
    const saved = await window.wanshan.templates.save(draft)
    setTemplates((items) => items.map((item) => item.id === saved.id ? saved : item)); setStatus('提示词模板已保存')
  }

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">虾</span><div><strong>运营虾</strong><small>自媒体运营助手</small></div></div>
      {([['workspace', '创作工作台'], ['prompts', '提示词库'], ['history', '本地历史'], ['settings', '模型设置']] as [View, string][]).map(([id, label]) => <button key={id} className={view === id ? 'nav active' : 'nav'} onClick={() => setView(id)}>{label}</button>)}
      <div className="offline">本地优先 · 轻量运营</div></aside>
    <section className="content"><header><div><p className="eyebrow">运营虾</p><h1>{view === 'workspace' ? '创作工作台' : view === 'prompts' ? '提示词库' : view === 'settings' ? '模型设置' : '本地历史'}</h1></div><p className="status">{status}</p></header>
      {view === 'workspace' && <div className="workspace-grid"><section className="panel form-panel"><label>创作主题<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：小户型夏日收纳" /></label><div className="form-row"><label>目标平台<select value={platform} onChange={(e) => setPlatform(e.target.value)}><option>小红书</option><option>抖音</option><option>视频号</option><option>B站</option><option>微博</option></select></label><label>文案风格<input value={style} onChange={(e) => setStyle(e.target.value)} /></label></div><label>补充要求<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="受众、时长、语气或必须包含的信息" /></label><button className="primary" disabled={!topic.trim()} onClick={() => void generate()}>生成文案</button></section><section className="panel result-panel"><div className="panel-title">本次成果</div>{result ? <><h2>{result.title}</h2><pre>{result.content}</pre><div className="subtle">标题与字幕已一并保存到本地历史记录。</div></> : <div className="empty">填写主题后开始生成。模型请求只会发送到你在“模型设置”中主动填写的地址。</div>}</section></div>}
      {view === 'prompts' && <div className="prompt-layout"><nav className="template-list">{templates.map((template) => <button key={template.id} className={template.id === selectedId ? 'template active' : 'template'} onClick={() => setSelectedId(template.id)}><strong>{template.name}</strong><small>{template.description}</small></button>)}</nav>{draft && <section className="panel editor"><label>名称<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>说明<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><div className="chips">{draft.variables.map((variable) => <span key={variable}>{'{{'}{variable}{'}}'}</span>)}</div><label>提示词内容<textarea className="prompt-editor" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label><div className="actions"><button className="primary" onClick={() => void saveTemplate()}>保存模板</button><button onClick={() => void window.wanshan.templates.reset(draft.id).then((value) => { setTemplates((items) => items.map((item) => item.id === value.id ? value : item)); setStatus('已恢复内置版本') })}>恢复内置版本</button></div></section>}</div>}
      {view === 'settings' && <section className="panel settings"><label>OpenAI 兼容 Base URL<input value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" /></label><label>模型名<input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} placeholder="gpt-4o-mini / deepseek-chat" /></label><label>API Key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.hasApiKey ? '已安全保存，留空则不改动' : '仅加密保存在本机'} /></label><div className="actions"><button className="primary" onClick={() => void saveSettings()}>保存设置</button><button onClick={() => void window.wanshan.settings.test().then((value) => setStatus(value.message))}>测试连接</button><button onClick={() => void window.wanshan.settings.clear().then((value) => { setSettings(value); setApiKey(''); setStatus('本机模型设置已清除') })}>清除本机设置</button></div></section>}
      {view === 'history' && <section className="history">{records.length ? records.map((record) => <article key={record.id} className="record"><div><h2>{record.title}</h2><p>{record.platform} · {record.style} · {new Date(record.createdAt).toLocaleString()}</p></div><button onClick={() => { setResult(record); setView('workspace') }}>查看</button></article>) : <div className="empty">还没有本地创作记录。</div>}</section>}
    </section>
  </main>
}
