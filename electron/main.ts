import { app, BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { loadCommercialConfig } from './commercial-config'
import { verifyIntegrity } from './integrity-verifier'
import { LicenseService } from './license-service'
import { showLicenseWindow } from './license-window'
import { seedLegacyRuntimeAssets } from './legacy-seed'
import { registerUpdateService } from './update-service'

let mainWindow: BrowserWindow | null = null
let licenseRefreshTimer: NodeJS.Timeout | null = null

// Keep databases, license cache, cookies and generated media outside the install directory.
if (process.env.LOCALAPPDATA) {
  const userDataRoot = path.join(process.env.LOCALAPPDATA, 'WanshanMedia')
  fs.mkdirSync(userDataRoot, { recursive: true })
  app.setPath('userData', userDataRoot)
}

function legacyRuntimeRoot(): string {
  const appRoot = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..', '..')
  return path.join(appRoot, 'vendor', 'qianshan-runtime')
}

function appRoot(): string {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..', '..')
}

async function startLegacyRuntime(): Promise<void> {
  process.env.WANSHAN_RUNTIME = '1'
  // Do not inherit a stale global USE_MOCK=1 from an earlier test shell.
  // Mock mode is opt-in for this app via WANSHAN_USE_MOCK=1.
  process.env.USE_MOCK = process.env.WANSHAN_USE_MOCK === '1' ? '1' : '0'
  const root = legacyRuntimeRoot()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { startServer } = require(path.join(root, 'dist', 'server.js')) as { startServer(): Promise<void> }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerIPC } = require(path.join(root, 'dist', 'ipc.js')) as { registerIPC(window: BrowserWindow): void }
  await startServer()
  const seedResult = await seedLegacyRuntimeAssets(root)
  console.info('[Wanshan] Legacy runtime seeds:', seedResult)
  if (mainWindow) registerIPC(mainWindow)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: '万山自媒体',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  })

  mainWindow.webContents.on('devtools-opened', () => mainWindow?.webContents.closeDevTools())

  void mainWindow.loadFile(path.join(legacyRuntimeRoot(), 'renderer', 'dist', 'index.html'))
}

async function boot(): Promise<void> {
  const root = appRoot()
  let commercialConfig
  try {
    commercialConfig = loadCommercialConfig(root)
  } catch (error) {
    dialog.showErrorBox('万山自媒体启动失败', error instanceof Error ? error.message : '商业配置无效')
    app.quit()
    return
  }

  if (app.isPackaged || commercialConfig.commercial) {
    const integrity = verifyIntegrity(root, undefined, commercialConfig.integrityPublicKey)
    if (!integrity.ok) {
      dialog.showErrorBox('万山自媒体完整性校验失败', integrity.issues.slice(0, 12).join('\n'))
      app.quit()
      return
    }
  }

  if (commercialConfig.commercial) {
    const license = new LicenseService(commercialConfig)
    const authorized = await license.ensureAuthorized().catch(() => null)
    if (!authorized) {
      const activated = await showLicenseWindow(path.join(__dirname, 'preload.js'), license)
      if (!activated) {
        dialog.showErrorBox('万山自媒体未激活', '请输入有效卡密后再启动商业版。')
        app.quit()
        return
      }
    }
    licenseRefreshTimer = license.startBackgroundRefresh((error) => {
      if (licenseRefreshTimer) {
        clearInterval(licenseRefreshTimer)
        licenseRefreshTimer = null
      }
      dialog.showErrorBox('万山自媒体授权已失效', error.message || '授权已失效，请重新激活。')
      app.quit()
    })
  }

  createWindow()
  registerUpdateService(() => mainWindow, commercialConfig)
  await startLegacyRuntime()
}

app.whenReady().then(boot).then(() => {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error) => {
  dialog.showErrorBox('万山自媒体启动失败', error instanceof Error ? error.message : String(error))
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
