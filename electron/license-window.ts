import { BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import type { LicenseService } from './license-service'

let activeWindow: BrowserWindow | null = null
let handlerRegistered = false

const HTML = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><title>激活万山自媒体</title><style>body{margin:0;padding:34px;background:#0d1117;color:#e6edf3;font:14px Arial,"Microsoft YaHei",sans-serif}main{width:430px;margin:auto}h1{font-size:22px;margin:0 0 10px}p{color:#8b949e;line-height:1.7}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #30363d;border-radius:6px;background:#161b22;color:#e6edf3;font-size:14px}button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:6px;background:#238636;color:#fff;font-size:14px;cursor:pointer}#status{min-height:24px;margin-top:14px;color:#f85149}</style><main><h1>激活万山自媒体</h1><p>请输入购买后获得的卡密。卡密只用于激活当前设备，服务端不会返回或保存客户端私钥。</p><input id="key" autocomplete="off" placeholder="请输入卡密"><button id="activate">激活</button><div id="status"></div></main><script>const key=document.getElementById('key'),status=document.getElementById('status');document.getElementById('activate').onclick=async()=>{status.textContent='正在验证…';try{const result=await window.electronAPI.activateLicense(key.value);if(!result.ok)throw new Error(result.error||'激活失败');status.style.color='#3fb950';status.textContent='激活成功，正在启动…'}catch(error){status.textContent=error.message||'激活失败'}};key.addEventListener('keydown',event=>{if(event.key==='Enter')document.getElementById('activate').click()})</script>`

export function showLicenseWindow(preloadPath: string, service: LicenseService): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false
    const finish = (result: boolean) => {
      if (finished) return
      finished = true
      activeWindow = null
      resolve(result)
    }

    if (!handlerRegistered) {
      ipcMain.handle('license:activate', async (_event, cardKey: unknown) => {
        try {
          const state = await service.activate(String(cardKey || ''))
          activeWindow?.close()
          return { ok: true, state: service.publicView(state) }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : '激活失败' }
        }
      })
      handlerRegistered = true
    }

    activeWindow = new BrowserWindow({
      width: 520,
      height: 430,
      resizable: false,
      autoHideMenuBar: true,
      title: '激活万山自媒体',
      webPreferences: { preload: path.resolve(preloadPath), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
    })
    activeWindow.on('closed', () => finish(false))
    void activeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`)

    const originalClose = activeWindow.close.bind(activeWindow)
    activeWindow.close = () => {
      finish(true)
      originalClose()
    }
  })
}
