import { BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type UpdateAction = 'download' | 'install' | 'later' | 'retry'
export type UpdatePhase = 'available' | 'downloading' | 'verifying' | 'ready' | 'error'

export interface UpdateWindowState {
  version: string
  notes: string
  mandatory: boolean
  phase: UpdatePhase
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  message?: string
  installDir?: string
}

let activeWindow: BrowserWindow | null = null
let latestState: UpdateWindowState | null = null
let pendingAction: ((action: UpdateAction) => void) | null = null
let handlersRegistered = false
let closeAllowed = false

const HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><title>运营虾更新</title>
<style>
:root{color-scheme:dark;--bg:#09101e;--card:#111b2d;--line:#263854;--text:#e7f0ff;--muted:#9bb0ca;--accent:#39c8c0;--accent-strong:#21b6ae;--danger:#ff8585;--warning:#f3b35d}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:var(--bg);color:var(--text);font:14px/1.55 "Segoe UI","Microsoft YaHei",sans-serif}.shell{height:100%;padding:24px;display:flex;align-items:center;justify-content:center}.panel{width:100%;min-height:330px;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:26px;box-shadow:0 22px 56px rgba(0,0,0,.32)}.eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:1px}.title{margin:6px 0 4px;font-size:25px;line-height:1.25}.meta{color:var(--muted);min-height:22px}.notes{margin:18px 0;padding:12px;border-left:3px solid var(--accent);background:rgba(57,200,192,.08);color:#d6e5f5;white-space:pre-wrap;min-height:54px}.progress-wrap{display:none;margin:20px 0 8px}.progress-wrap.show{display:block}.progress-row{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin-bottom:7px}.track{height:10px;border-radius:5px;background:#1d2b42;overflow:hidden}.bar{height:100%;width:0;background:var(--accent);transition:width .18s ease}.status{min-height:22px;margin:13px 0;color:var(--muted)}.status.error{color:var(--danger)}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}button{height:38px;padding:0 16px;border:1px solid #3a4e70;border-radius:7px;background:#1a2941;color:var(--text);font:600 14px "Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer}button.primary{background:var(--accent);border-color:var(--accent);color:#052323}button.primary:hover{background:var(--accent-strong)}button:disabled{opacity:.55;cursor:wait}.badge{display:inline-flex;padding:2px 8px;margin-left:8px;border:1px solid #3a4e70;border-radius:999px;font-size:12px;color:var(--muted)}.badge.required{color:#ffd7a0;border-color:#805d2c;background:rgba(190,125,32,.12)}
</style></head><body><main class="shell"><section class="panel"><div class="eyebrow">运营虾更新</div><h1 class="title" id="title">正在检查更新</h1><div class="meta" id="meta"></div><div class="notes" id="notes"></div><div class="progress-wrap" id="progressWrap"><div class="progress-row"><span id="progressLabel">准备下载</span><span id="percent">0%</span></div><div class="track"><div class="bar" id="bar"></div></div></div><div class="status" id="status"></div><div class="actions" id="actions"></div></section></main><script>
const $=id=>document.getElementById(id);let state=null;const size=v=>!v?'':v<1024*1024?(v/1024).toFixed(1)+' KB':(v/1024/1024).toFixed(1)+' MB';const speed=v=>!v?'':size(v)+'/s';
function action(name){window.electronAPI.update.uiAction(name)}
function button(label,name,primary,disabled){const el=document.createElement('button');el.textContent=label;el.className=primary?'primary':'';el.disabled=!!disabled;el.onclick=()=>action(name);return el}
function render(next){state=next;const required=next.mandatory?' <span class="badge required">必须更新</span>':'<span class="badge">普通更新</span>';$('title').innerHTML='发现新版本 '+next.version+required;$('meta').textContent=(next.mandatory?'当前版本已停止支持，完成更新前不能继续使用。':'此更新可后台下载安装，你可继续使用运营虾。')+(next.installDir?' 安装位置：'+next.installDir:'');$('notes').textContent=next.notes||'本次更新已通过签名校验。';const running=['downloading','verifying','ready','error'].includes(next.phase);$('progressWrap').className='progress-wrap'+(running?' show':'');const percent=Math.max(0,Math.min(100,Number(next.percent)||0));$('bar').style.width=percent+'%';$('percent').textContent=percent.toFixed(percent<10&&percent>0?1:0)+'%';$('progressLabel').textContent=next.phase==='verifying'?'正在校验更新包完整性':next.phase==='ready'?'更新包已校验完成':next.phase==='error'?'更新失败':next.phase==='downloading'?'正在后台下载':'准备下载';const status=$('status');status.className='status'+(next.phase==='error'?' error':'');status.textContent=next.message||(next.phase==='downloading'?[size(next.transferred),next.total?' / '+size(next.total):'',speed(next.bytesPerSecond)?' · '+speed(next.bytesPerSecond):''].join(''):next.phase==='ready'?'新版本已下载并校验完成。安装时会自动关闭运营虾并覆盖上方安装位置。':'');const actions=$('actions');actions.textContent='';if(next.phase==='available'){actions.append(button(next.mandatory?'下载必须更新':'稍后','later',false,next.mandatory));actions.append(button(next.mandatory?'下载并安装':'下载更新','download',true,false))}else if(next.phase==='ready'){if(!next.mandatory)actions.append(button('稍后安装','later',false,false));actions.append(button('立即安装','install',true,false))}else if(next.phase==='error'){actions.append(button('重试下载','retry',true,false))}}
window.electronAPI.update.onUiState(render);
</script></body></html>`

function pagePath(): string {
  const dir = path.join(process.env.LOCALAPPDATA || process.cwd(), 'Yunyingxia', 'runtime')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'update-window.html')
}

function settle(action: UpdateAction): void {
  const resolve = pendingAction
  pendingAction = null
  resolve?.(action)
}

function sendState(): void {
  if (activeWindow && !activeWindow.isDestroyed() && latestState) activeWindow.webContents.send('update-ui:state', latestState)
}

function registerHandlers(): void {
  if (handlersRegistered) return
  ipcMain.handle('update:uiAction', async (_event, action: unknown) => {
    const value = String(action || '') as UpdateAction
    if (!['download', 'install', 'later', 'retry'].includes(value)) return { ok: false, error: '无效更新操作' }
    if (latestState?.mandatory && value === 'later') return { ok: false, error: '当前版本必须完成更新' }
    settle(value)
    return { ok: true }
  })
  handlersRegistered = true
}

export function showUpdateWindow(parent: BrowserWindow | null, state: UpdateWindowState): void {
  registerHandlers()
  latestState = state
  closeAllowed = false
  if (!activeWindow || activeWindow.isDestroyed()) {
    activeWindow = new BrowserWindow({
      width: 560,
      height: 430,
      minWidth: 560,
      minHeight: 430,
      maximizable: false,
      resizable: false,
      modal: Boolean(parent),
      parent: parent || undefined,
      autoHideMenuBar: true,
      title: '运营虾更新',
      backgroundColor: '#09101e',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
    })
    activeWindow.once('closed', () => {
      activeWindow = null
      if (pendingAction && !latestState?.mandatory) settle('later')
    })
    activeWindow.on('close', (event) => {
      if (latestState?.mandatory && !closeAllowed) event.preventDefault()
    })
    const file = pagePath()
    fs.writeFileSync(file, HTML, 'utf8')
    activeWindow.webContents.once('did-finish-load', sendState)
    void activeWindow.loadFile(file)
  } else {
    activeWindow.show()
    activeWindow.focus()
    sendState()
  }
}

export function updateUpdateWindow(state: UpdateWindowState): void {
  latestState = state
  sendState()
}

export function waitForUpdateAction(): Promise<UpdateAction> {
  return new Promise((resolve) => { pendingAction = resolve })
}

export function closeUpdateWindow(): void {
  closeAllowed = true
  pendingAction = null
  if (activeWindow && !activeWindow.isDestroyed()) activeWindow.close()
  activeWindow = null
  latestState = null
}
