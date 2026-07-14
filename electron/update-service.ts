import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { BrowserWindow, MessageBoxOptions } from 'electron'
import type { CommercialConfig } from './commercial-config'
import { verifyLatestRelease, type VerifiedRelease } from './release-verifier'
export { isAllowedUpdateUrl } from './release-verifier'

interface DownloadedUpdate { version: string; filePath: string; mandatory: boolean }

let registered = false
let downloadedUpdate: DownloadedUpdate | null = null

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
  return requiresMandatoryUpdate(release, currentVersion) || compareVersions(release.version, currentVersion) > 0
}

export function releaseEndpoint(accountServerUrl: string): string {
  const url = new URL('/api/v1/releases/latest', accountServerUrl)
  url.searchParams.set('product_id', 'operation_shrimp')
  return url.toString()
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

type UpdateConfig = Pick<CommercialConfig, 'accountServerUrl' | 'updatePublicKey' | 'version'>
type UpdateFetcher = (input: string, init?: RequestInit) => Promise<Response>

async function requestRelease(config: UpdateConfig, fetcher: UpdateFetcher = fetch): Promise<VerifiedRelease | null> {
  const endpoint = releaseEndpoint(config.accountServerUrl)
  const response = await fetcher(endpoint, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`更新服务请求失败: HTTP ${response.status}`)
  return verifyLatestRelease(await response.json(), config.updatePublicKey)
}

export async function preflightMandatoryUpdate(config: UpdateConfig, fetcher?: UpdateFetcher): Promise<VerifiedRelease | null> {
  const release = await requestRelease(config, fetcher)
  if (!release || !shouldOfferRelease(release, config.version) || !requiresMandatoryUpdate(release, config.version)) return null
  return release
}

async function downloadRelease(release: VerifiedRelease, onProgress: (payload: unknown) => void): Promise<DownloadedUpdate> {
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
      onProgress({ percent: total ? Math.min(100, (transferred / total) * 100) : 0, transferred, total, bytesPerSecond: Math.round(transferred / elapsed) })
    }
    await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()))
  } catch (error) {
    output.destroy()
    await fs.promises.rm(targetPath, { force: true })
    throw error
  }
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

export function registerUpdateService(getMainWindow: () => BrowserWindow | null, config: CommercialConfig): void {
  if (registered) return
  registered = true
  const { app, dialog, ipcMain } = require('electron') as typeof import('electron')
  const send = (channel: string, payload?: unknown) => {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }
  const showDialog = (options: MessageBoxOptions) => {
    const window = getMainWindow()
    return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
  }
  const installDownloadedUpdate = () => {
    if (!downloadedUpdate) return { ok: false, error: '没有已下载的更新安装包' }
    spawn(downloadedUpdate.filePath, ['/UPDATE', '/CLOSEAPPLICATIONS'], { detached: true, stdio: 'ignore' }).unref()
    setTimeout(() => app.quit(), 500)
    return { ok: true }
  }
  const checkNow = async () => {
    try {
      send('update:checking')
      const release = await requestRelease(config)
      if (release === null) {
        send('update:not-available', { version: config.version })
        return { ok: true, available: false, version: config.version }
      }
      const mandatory = requiresMandatoryUpdate(release, config.version)
      if (!shouldOfferRelease(release, config.version)) {
        send('update:not-available', { version: release.version })
        return { ok: true, available: false, version: release.version }
      }
      send('update:available', { version: release.version, mandatory })
      const choices = mandatory ? ['下载必须更新'] : ['下载更新', '稍后']
      const choice = await showDialog({ type: mandatory ? 'warning' : 'info', title: mandatory ? '运营虾必须更新' : '运营虾发现新版本', message: `发现新版本 ${release.version}`, detail: release.notes || (mandatory ? '当前版本低于服务端最低支持版本，请下载并安装更新。' : '新版本将从签名验证的 HTTPS 地址下载。'), buttons: choices, defaultId: 0, cancelId: mandatory ? 0 : 1 })
      if (!mandatory && choice.response !== 0) return { ok: true, available: true, deferred: true, version: release.version }
      downloadedUpdate = await downloadRelease(release, (payload) => send('update:progress', payload))
      send('update:downloaded', { version: release.version, mandatory })
      const installChoices = mandatory ? ['立即安装必须更新'] : ['立即安装', '稍后安装']
      const install = await showDialog({ type: mandatory ? 'warning' : 'info', title: mandatory ? '运营虾必须更新' : '运营虾更新已下载', message: `版本 ${release.version} 已下载完成`, detail: '安装会自动关闭运营虾，然后启动签名验证后的安装器覆盖更新。', buttons: installChoices, defaultId: 0, cancelId: mandatory ? 0 : 1 })
      if (mandatory || install.response === 0) return installDownloadedUpdate()
      return { ok: true, available: true, version: release.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      send('update:error', { message })
      return { ok: false, error: message }
    }
  }
  ipcMain.handle('update:check', checkNow)
  ipcMain.handle('update:install', installDownloadedUpdate)
  if (app.isPackaged) setTimeout(() => { void checkNow() }, 5000)
}
