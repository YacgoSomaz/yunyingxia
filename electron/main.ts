import { app, BrowserWindow, dialog } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AccountService, hasActiveAccess, type AccountState } from './account-service'
import { registerAccountService, showAccountWindow } from './account-window'
import { loadCommercialConfig, type CommercialConfig } from './commercial-config'
import { verifyIntegrity } from './integrity-verifier'
import { seedLegacyRuntimeAssets } from './legacy-seed'
import { registerUpdateService } from './update-service'

function isBrokenPipeError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'EPIPE')
}

function installBrokenPipeGuard(): void {
  const stdioStreams = [process.stdout, process.stderr]

  for (const stream of stdioStreams) {
    stream.on('error', (error) => {
      if (isBrokenPipeError(error)) return
      throw error
    })

    const originalWrite = stream.write.bind(stream) as typeof stream.write
    stream.write = ((chunk: unknown, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
      try {
        if (typeof encoding === 'function') {
          return originalWrite(chunk as string | Uint8Array, (error?: Error | null) => {
            if (isBrokenPipeError(error)) return
            encoding(error)
          })
        }
        return originalWrite(chunk as string | Uint8Array, encoding, (error?: Error | null) => {
          if (isBrokenPipeError(error)) return
          callback?.(error)
        })
      } catch (error) {
        if (isBrokenPipeError(error)) return false
        throw error
      }
    }) as typeof stream.write
  }
}

installBrokenPipeGuard()

let mainWindow: BrowserWindow | null = null
let accountRefreshTimer: NodeJS.Timeout | null = null
let accountLoginPending = false
let accountBootInProgress = false
let activeCommercialConfig: CommercialConfig | null = null
let stopUpdateService: (() => void) | null = null
const localApiAccessToken = crypto.randomBytes(32).toString('base64url')
const LOCAL_API_TOKEN_HEADER = 'x-wanshan-local-token'
const LOCAL_API_URL_FILTER = 'http://127.0.0.1:19832/api/*'
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (process.platform === 'win32') {
  app.setAppUserModelId('com.yunyingxia.desktop')
}

// Keep databases, license cache, cookies and generated media outside the install directory.
if (process.env.LOCALAPPDATA) {
  const userDataRoot = path.join(process.env.LOCALAPPDATA, 'Yunyingxia')
  const legacyUserDataRoot = path.join(process.env.LOCALAPPDATA, 'WanshanMedia')
  if (!fs.existsSync(userDataRoot) && fs.existsSync(legacyUserDataRoot)) {
    fs.cpSync(legacyUserDataRoot, userDataRoot, { recursive: true, force: false, errorOnExist: false })
  }
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

function appIconPath(): string | undefined {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = [
    path.join(appRoot(), 'resources', iconName),
    path.join(appRoot(), 'resources', 'icon.png'),
    path.join(process.resourcesPath || '', iconName),
    path.join(process.resourcesPath || '', 'icon.png'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function applyAppMetadata(config: CommercialConfig): void {
  app.setName(config.appName)
  const electronApp = app as typeof app & {
    getVersion(): string
    getName(): string
  }
  electronApp.getVersion = () => config.version
  electronApp.getName = () => config.appName
}

async function startLegacyRuntime(): Promise<void> {
  process.env.WANSHAN_RUNTIME = '1'
  process.env.WANSHAN_LOCAL_API_TOKEN = localApiAccessToken
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
  // The original Qianshan Electron entrypoint initializes LLM routing after the
  // API server starts. Our wrapper loads server.js directly, so we must do it here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { llmConfig } = require(path.join(root, 'dist', 'services', 'llm-config.js')) as { llmConfig: { init(): Promise<void> } }
  await llmConfig.init()
  if (mainWindow) registerIPC(mainWindow)
}

function installLocalApiRequestHeader(window: BrowserWindow): void {
  window.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [LOCAL_API_URL_FILTER] },
    (details, callback) => callback({
      requestHeaders: {
        ...details.requestHeaders,
        [LOCAL_API_TOKEN_HEADER]: localApiAccessToken,
      },
    }),
  )
}

function updateOperationEntitlement(state: AccountState | null): void {
  process.env.WANSHAN_OPERATION_ENTITLED = hasActiveAccess(state) ? '1' : '0'
}

function installOperationEntitlementGate(account: AccountService): void {
  const runtime = globalThis as typeof globalThis & {
    __WANSHAN_VERIFY_OPERATION_ACCESS?: () => Promise<boolean>
  }
  runtime.__WANSHAN_VERIFY_OPERATION_ACCESS = async () => {
    const result = await account.verifyOperationEntitlement()
    updateOperationEntitlement(result.state)
    return result.entitled
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: '运营虾',
    backgroundColor: '#f7f8fa',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  })

  installLocalApiRequestHeader(mainWindow)
  mainWindow.webContents.on('devtools-opened', () => mainWindow?.webContents.closeDevTools())
  mainWindow.once('closed', () => {
    mainWindow = null
    stopUpdateService?.()
    stopUpdateService = null
  })

  void mainWindow.loadFile(path.join(legacyRuntimeRoot(), 'renderer', 'dist', 'index.html'))
  if (activeCommercialConfig) {
    stopUpdateService = registerUpdateService(() => mainWindow, activeCommercialConfig)
  }
}

async function boot(): Promise<void> {
  accountBootInProgress = true
  const root = appRoot()
  let commercialConfig
  try {
    commercialConfig = loadCommercialConfig(root)
  } catch (error) {
    accountBootInProgress = false
    dialog.showErrorBox('运营虾启动失败', error instanceof Error ? error.message : '商业配置无效')
    app.quit()
    return
  }

  if (app.isPackaged) {
    const integrity = verifyIntegrity(root, undefined, commercialConfig.integrityPublicKey)
    if (!integrity.ok) {
      accountBootInProgress = false
      dialog.showErrorBox('运营虾完整性校验失败', integrity.issues.slice(0, 12).join('\n'))
      app.quit()
      return
    }
  }

  const account = new AccountService(commercialConfig)
  registerAccountService(account)
  installOperationEntitlementGate(account)
  let state = await account.ensureSession().catch(() => null)
  if (!state) {
    let loggedIn = false
    accountLoginPending = true
    try {
      loggedIn = await showAccountWindow(path.join(__dirname, 'preload.js'), account)
    } finally {
      accountLoginPending = false
    }
    if (!loggedIn) {
      accountBootInProgress = false
      app.quit()
      return
    }
    state = await account.ensureSession().catch(() => null)
    if (!state) {
      accountBootInProgress = false
      dialog.showErrorBox('运营虾登录失败', '未能读取当前账号状态，请重新登录。')
      app.quit()
      return
    }
  }
  updateOperationEntitlement(state)
  accountRefreshTimer = account.startBackgroundRefresh((error) => {
    updateOperationEntitlement(null)
    console.warn('[Yunyingxia] Account entitlement revoked:', error.message || '账号状态已失效')
  }, updateOperationEntitlement)

  activeCommercialConfig = commercialConfig
  applyAppMetadata(commercialConfig)
  createWindow()
  accountBootInProgress = false
  await startLegacyRuntime()
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const existingWindow = mainWindow ?? BrowserWindow.getAllWindows()[0]
    if (!existingWindow || existingWindow.isDestroyed()) return
    if (existingWindow.isMinimized()) existingWindow.restore()
    existingWindow.focus()
  })

  app.whenReady().then(boot).then(() => {
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }).catch((error) => {
    dialog.showErrorBox('运营虾启动失败', error instanceof Error ? error.message : String(error))
    app.quit()
  })
}

app.on('window-all-closed', () => {
  if (accountLoginPending || accountBootInProgress) return
  stopUpdateService?.()
  stopUpdateService = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopUpdateService?.()
  stopUpdateService = null
})
