import { app, BrowserWindow } from 'electron'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null

function legacyRuntimeRoot(): string {
  const appRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', '..')
  return path.join(appRoot, 'vendor', 'qianshan-runtime')
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
      sandbox: true
    }
  })

  void mainWindow.loadFile(path.join(legacyRuntimeRoot(), 'renderer', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  return startLegacyRuntime()
}).then(() => {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
