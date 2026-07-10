import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { BrowserWindow } from 'electron'
import type { CommercialConfig } from './commercial-config'

interface UpdateFile {
  url: string
  sha512: string
  size: number
}

interface UpdateManifest {
  version: string
  releaseDate?: string
  path?: string
  sha512?: string
  files?: UpdateFile[]
}

interface DownloadedUpdate {
  version: string
  filePath: string
}

let registered = false
let downloadedUpdate: DownloadedUpdate | null = null

function numericParts(version: string): number[] {
  const core = String(version).split(/[+-]/)[0]
  return core.split('.').map((part) => {
    const value = Number.parseInt(part.replace(/\D.*/, ''), 10)
    return Number.isFinite(value) ? value : 0
  })
}

export function compareVersions(next: string, current: string): number {
  const a = numericParts(next)
  const b = numericParts(current)
  const length = Math.max(a.length, b.length, 3)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function isAllowedUpdateUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    if (url.protocol === 'file:') return true
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return true
    return false
  } catch {
    return false
  }
}

export function resolveUpdateFileUrl(manifestUrl: string, fileUrl: string): string {
  return new URL(fileUrl, manifestUrl).toString()
}

function sha512(filePath: string): string {
  return crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64')
}

async function readUrl(url: string): Promise<Buffer> {
  const parsed = new URL(url)
  if (parsed.protocol === 'file:') return fs.promises.readFile(parsed)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function readManifest(feedUrl: string): Promise<UpdateManifest> {
  const body = await readUrl(feedUrl)
  return JSON.parse(body.toString('utf8')) as UpdateManifest
}

async function downloadUpdate(manifestUrl: string, manifest: UpdateManifest, onProgress: (payload: unknown) => void): Promise<DownloadedUpdate> {
  const primaryFile = manifest.files?.[0]
  const fileUrl = resolveUpdateFileUrl(manifestUrl, primaryFile?.url || manifest.path || '')
  if (!isAllowedUpdateUrl(fileUrl)) throw new Error('更新安装包地址必须使用 HTTPS')

  const targetDir = path.join(os.tmpdir(), 'WanshanMediaUpdates')
  await fs.promises.mkdir(targetDir, { recursive: true })
  const targetPath = path.join(targetDir, path.basename(new URL(fileUrl).pathname) || `WanshanMediaSetup_${manifest.version}.exe`)
  const expectedSize = Number(primaryFile?.size || 0)
  const expectedSha512 = String(primaryFile?.sha512 || manifest.sha512 || '')

  const parsed = new URL(fileUrl)
  if (parsed.protocol === 'file:') {
    await fs.promises.copyFile(parsed, targetPath)
    onProgress({ percent: 100, transferred: expectedSize, total: expectedSize, bytesPerSecond: 0 })
  } else {
    const response = await fetch(fileUrl)
    if (!response.ok || !response.body) throw new Error(`下载安装包失败: HTTP ${response.status}`)
    const reader = response.body.getReader()
    const output = fs.createWriteStream(targetPath)
    let transferred = 0
    const startedAt = Date.now()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      transferred += chunk.length
      output.write(chunk)
      const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000)
      onProgress({
        percent: expectedSize > 0 ? Math.min(100, (transferred / expectedSize) * 100) : 0,
        transferred,
        total: expectedSize,
        bytesPerSecond: Math.round(transferred / elapsedSeconds),
      })
    }
    await new Promise<void>((resolve, reject) => {
      output.end((error: Error | null | undefined) => (error ? reject(error) : resolve()))
    })
  }

  if (expectedSha512 && sha512(targetPath) !== expectedSha512) {
    await fs.promises.rm(targetPath, { force: true })
    throw new Error('更新安装包 SHA512 校验失败')
  }
  return { version: manifest.version, filePath: targetPath }
}

export function registerUpdateService(getMainWindow: () => BrowserWindow | null, config: CommercialConfig): void {
  if (registered) return
  registered = true
  const { app, ipcMain } = require('electron') as typeof import('electron')
  const send = (channel: string, payload?: unknown) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  const checkNow = async () => {
    const feedUrl = config.updateFeedUrl.trim()
    if (!feedUrl) return { skipped: true, reason: 'update feed is not configured' }
    if (!isAllowedUpdateUrl(feedUrl)) return { ok: false, error: '更新源必须使用 HTTPS' }
    if (!app.isPackaged && !feedUrl.startsWith('file:') && !feedUrl.includes('127.0.0.1') && !feedUrl.includes('localhost')) {
      return { skipped: true, reason: 'dev mode' }
    }

    try {
      send('update:checking')
      const manifest = await readManifest(feedUrl)
      if (!manifest.version || compareVersions(manifest.version, config.version) <= 0) {
        send('update:not-available', { version: manifest.version || config.version })
        return { ok: true, available: false, version: manifest.version || config.version }
      }
      send('update:available', { version: manifest.version, releaseDate: manifest.releaseDate })
      downloadedUpdate = await downloadUpdate(feedUrl, manifest, (payload) => send('update:progress', payload))
      send('update:downloaded', { version: downloadedUpdate.version })
      return { ok: true, available: true, version: downloadedUpdate.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      send('update:error', { message })
      return { ok: false, error: message }
    }
  }

  ipcMain.handle('update:check', checkNow)
  ipcMain.handle('update:install', () => {
    if (!downloadedUpdate) return { ok: false, error: '没有已下载的更新安装包' }
    const child = spawn(downloadedUpdate.filePath, [], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    setTimeout(() => app.quit(), 500)
    return { ok: true }
  })

  if (app.isPackaged && config.updateFeedUrl.trim()) {
    setTimeout(() => {
      void checkNow()
    }, 5000)
  }
}
