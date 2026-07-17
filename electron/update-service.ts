import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { BrowserWindow } from 'electron'
import type { CommercialConfig } from './commercial-config'
import {
  ReleaseEventMonitor,
  releaseEventsEndpoint,
  type ReleaseCheckReason,
  type ReleaseMonitorDependencies,
} from './release-monitor'
import { OPERATION_PRODUCT_ID, verifyLatestRelease, type VerifiedRelease } from './release-verifier'
import { closeUpdateWindow, showUpdateWindow, updateUpdateWindow, waitForUpdateAction, type UpdatePhase } from './update-window'
export { isAllowedUpdateUrl } from './release-verifier'

interface DownloadedUpdate { version: string; filePath: string; mandatory: boolean }
type DownloadProgress = { phase: 'downloading' | 'verifying'; percent: number; transferred: number; total: number; bytesPerSecond?: number }

let registered = false
let downloadedUpdate: DownloadedUpdate | null = null
let runtimeMonitor: ReleaseEventMonitor | null = null
let runtimeMonitorFactory: (() => ReleaseEventMonitor) | null = null

function numericParts(version: string): number[] {
  const core = String(version).split(/[+-]/)[0]
  return core.split('.').map((part) => Number.parseInt(part.replace(/\D.*/, ''), 10) || 0)
}

export function compareVersions(next: string, current: string): number {
  const a = numericParts(next)
  const b = numericParts(current)
  for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function requiresMandatoryUpdate(release: Pick<VerifiedRelease, 'mandatory' | 'minSupportedVersion'>, currentVersion: string): boolean {
  return release.mandatory || (release.minSupportedVersion !== '' && compareVersions(currentVersion, release.minSupportedVersion) < 0)
}

export function shouldOfferRelease(release: Pick<VerifiedRelease, 'version' | 'mandatory' | 'minSupportedVersion'>, currentVersion: string): boolean {
  return compareVersions(release.version, currentVersion) > 0
    || (release.minSupportedVersion !== '' && compareVersions(currentVersion, release.minSupportedVersion) < 0)
}

export function releaseEndpoint(accountServerUrl: string): string {
  const url = new URL('/api/v1/releases/latest', accountServerUrl)
  url.searchParams.set('product_id', OPERATION_PRODUCT_ID)
  return url.toString()
}

export { releaseEventsEndpoint }

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export type UpdateConfig = Pick<CommercialConfig, 'accountServerUrl' | 'updatePublicKey' | 'version'>
type UpdateFetcher = (input: string, init?: RequestInit) => Promise<Response>

export async function requestSignedRelease(config: UpdateConfig, fetcher: UpdateFetcher = fetch): Promise<VerifiedRelease | null> {
  const endpoint = releaseEndpoint(config.accountServerUrl)
  const response = await fetcher(endpoint, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`更新服务请求失败: HTTP ${response.status}`)
  return verifyLatestRelease(await response.json(), config.updatePublicKey)
}

export async function preflightMandatoryUpdate(config: UpdateConfig, fetcher?: UpdateFetcher): Promise<VerifiedRelease | null> {
  const release = await requestSignedRelease(config, fetcher)
  if (!release || !shouldOfferRelease(release, config.version) || !requiresMandatoryUpdate(release, config.version)) return null
  return release
}

export function createRuntimeReleaseMonitor(
  config: UpdateConfig,
  checkSignedRelease: (reason: ReleaseCheckReason) => unknown,
  dependencies?: ReleaseMonitorDependencies,
): ReleaseEventMonitor {
  return new ReleaseEventMonitor(
    releaseEventsEndpoint(config.accountServerUrl),
    checkSignedRelease,
    dependencies,
  )
}

function startRuntimeMonitor(): void {
  if (runtimeMonitor || !runtimeMonitorFactory) return
  runtimeMonitor = runtimeMonitorFactory()
  runtimeMonitor.start()
}

export function stopRuntimeUpdateMonitoring(): void {
  runtimeMonitor?.stop()
  runtimeMonitor = null
}

async function downloadRelease(release: VerifiedRelease, onProgress: (payload: DownloadProgress) => void): Promise<DownloadedUpdate> {
  const response = await fetch(release.downloadUrl)
  if (!response.ok || !response.body) throw new Error(`下载安装包失败: HTTP ${response.status}`)
  const targetDir = path.join(os.tmpdir(), 'YunyingxiaUpdates')
  await fs.promises.mkdir(targetDir, { recursive: true })
  const targetPath = path.join(targetDir, `YunyingxiaSetup_${release.version}.exe`)
  const output = fs.createWriteStream(targetPath)
  const total = Number(response.headers.get('content-length') || 0)
  let transferred = 0
  const startedAt = Date.now()
  try {
    for await (const value of response.body as unknown as AsyncIterable<Uint8Array>) {
      const chunk = Buffer.from(value)
      transferred += chunk.length
      if (!output.write(chunk)) await new Promise<void>((resolve) => output.once('drain', resolve))
      const elapsed = Math.max(1, (Date.now() - startedAt) / 1000)
      onProgress({ phase: 'downloading', percent: total ? Math.min(100, (transferred / total) * 100) : 0, transferred, total, bytesPerSecond: Math.round(transferred / elapsed) })
    }
    await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()))
  } catch (error) {
    output.destroy()
    await fs.promises.rm(targetPath, { force: true })
    throw error
  }
  onProgress({ phase: 'verifying', percent: 100, transferred, total })
  if (sha256(targetPath) !== release.sha256) {
    await fs.promises.rm(targetPath, { force: true })
    throw new Error('更新包 SHA-256 校验失败')
  }
  if ((await fs.promises.stat(targetPath)).size !== release.sizeBytes) {
    await fs.promises.rm(targetPath, { force: true })
    throw new Error('更新包文件大小校验失败')
  }
  return { version: release.version, filePath: targetPath, mandatory: release.mandatory }
}

export function registerUpdateService(getMainWindow: () => BrowserWindow | null, config: CommercialConfig): () => void {
  const { app, ipcMain } = require('electron') as typeof import('electron')
  if (registered) {
    if (app.isPackaged) startRuntimeMonitor()
    return stopRuntimeUpdateMonitoring
  }
  registered = true
  const send = (channel: string, payload?: unknown) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }
  const installDownloadedUpdate = () => {
    if (!downloadedUpdate) return { ok: false, error: '没有已下载的更新安装包' }
    try {
      const installDir = path.dirname(process.execPath)
      spawn(downloadedUpdate.filePath, ['/UPDATE', '/CLOSEAPPLICATIONS', `/DIR=${installDir}`], { detached: true, stdio: 'ignore' }).unref()
      setTimeout(() => app.quit(), 500)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  let checkInFlight: Promise<unknown> | null = null
  let lastOptionalPromptVersion = ''
  let mandatoryUpdateActive = false
  const updateWindowState = (release: VerifiedRelease, phase: UpdatePhase, progress: Partial<DownloadProgress> = {}, message = '') => ({
    version: release.version,
    notes: release.notes,
    mandatory: requiresMandatoryUpdate(release, config.version),
    phase,
    installDir: path.dirname(process.execPath),
    ...progress,
    message,
  })
  const beginDownload = async (release: VerifiedRelease) => {
    updateUpdateWindow(updateWindowState(release, 'downloading', { percent: 0, transferred: 0, total: release.sizeBytes }, '正在建立安全下载连接…'))
    downloadedUpdate = await downloadRelease(release, (payload) => {
      send('update:progress', payload)
      updateUpdateWindow(updateWindowState(release, payload.phase, payload))
    })
    send('update:downloaded', { version: release.version, mandatory: requiresMandatoryUpdate(release, config.version) })
    updateUpdateWindow(updateWindowState(release, 'ready', { percent: 100, transferred: release.sizeBytes, total: release.sizeBytes }))
  }
  const lockMainWindowForMandatoryUpdate = (release: VerifiedRelease) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.setEnabled(false)
    send('update:mandatory', { version: release.version })
  }
  const downloadMandatoryUpdate = async (release: VerifiedRelease) => {
    if (mandatoryUpdateActive) return { ok: false, error: '必须更新正在处理，请完成更新。' }
    mandatoryUpdateActive = true
    lockMainWindowForMandatoryUpdate(release)
    showUpdateWindow(getMainWindow(), updateWindowState(release, 'available'))
    while (true) {
      try {
        const action = await waitForUpdateAction()
        if (action !== 'download' && action !== 'retry') continue
        await beginDownload(release)
        const installAction = await waitForUpdateAction()
        if (installAction !== 'install') continue
        const installed = installDownloadedUpdate()
        if (!installed.ok) throw new Error(installed.error)
        return installed
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        send('update:error', { message, mandatory: true })
        updateUpdateWindow(updateWindowState(release, 'error', {}, `更新失败：${message}`))
      }
    }
  }
  const performCheck = async (automatic = false) => {
    try {
      send('update:checking')
      const release = await requestSignedRelease(config)
      if (release === null) {
        send('update:not-available', { version: config.version })
        return { ok: true, available: false, version: config.version }
      }
      const mandatory = requiresMandatoryUpdate(release, config.version)
      if (!shouldOfferRelease(release, config.version)) {
        send('update:not-available', { version: release.version })
        return { ok: true, available: false, version: release.version }
      }
      if (mandatory) return downloadMandatoryUpdate(release)
      send('update:available', { version: release.version, mandatory })
      if (automatic && lastOptionalPromptVersion === release.version) {
        return { ok: true, available: true, deferred: true, version: release.version }
      }
      lastOptionalPromptVersion = release.version
      showUpdateWindow(getMainWindow(), updateWindowState(release, 'available'))
      const action = await waitForUpdateAction()
      if (action === 'later') {
        closeUpdateWindow()
        return { ok: true, available: true, deferred: true, version: release.version }
      }
      await beginDownload(release)
      const installAction = await waitForUpdateAction()
      if (installAction === 'install') return installDownloadedUpdate()
      closeUpdateWindow()
      return { ok: true, available: true, version: release.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      send('update:error', { message })
      return { ok: false, error: message }
    }
  }
  const checkNow = (automatic = false) => {
    if (checkInFlight) return checkInFlight
    checkInFlight = performCheck(automatic).finally(() => { checkInFlight = null })
    return checkInFlight
  }
  ipcMain.handle('update:check', () => checkNow(false))
  ipcMain.handle('update:install', installDownloadedUpdate)
  runtimeMonitorFactory = () => createRuntimeReleaseMonitor(config, () => checkNow(true))
  if (app.isPackaged) {
    startRuntimeMonitor()
    // Surface signed mandatory updates through the same progress-capable UI
    // immediately after the main window is created. The release is still
    // untrusted until requestSignedRelease verifies it.
    setTimeout(() => { void checkNow(true) }, 0)
  }
  app.once('before-quit', stopRuntimeUpdateMonitoring)
  return () => {
    stopRuntimeUpdateMonitoring()
    closeUpdateWindow()
  }
}
