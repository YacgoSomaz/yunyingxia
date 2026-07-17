import { OPERATION_PRODUCT_ID } from './release-verifier'

export const RELEASE_POLL_INTERVAL_MS = 60_000
export const RELEASE_EVENT_RECONNECT_DELAY_MS = 5_000

export type ReleaseCheckReason = 'sse' | 'interval'

export interface ReleaseEventsHandlers {
  // Event data is deliberately not exposed. It can only trigger a signed recheck.
  onRelease(): void
  onDisconnected(error?: unknown): void
}

export interface ReleaseEventsConnection {
  close(): void
}

export type ReleaseEventsConnector = (
  endpoint: string,
  handlers: ReleaseEventsHandlers,
) => ReleaseEventsConnection

export interface ReleaseMonitorDependencies {
  connect?: ReleaseEventsConnector
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

type SseFetcher = (input: string, init?: RequestInit) => Promise<Response>

export function releaseEventsEndpoint(accountServerUrl: string): string {
  const url = new URL('/api/v1/releases/events', accountServerUrl)
  url.searchParams.set('product_id', OPERATION_PRODUCT_ID)
  return url.toString()
}

export function connectReleaseEvents(
  endpoint: string,
  handlers: ReleaseEventsHandlers,
  fetcher: SseFetcher = fetch,
): ReleaseEventsConnection {
  const controller = new AbortController()
  let closed = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let buffered = ''
  let eventName = 'message'

  const dispatch = () => {
    if (eventName === 'release') handlers.onRelease()
    eventName = 'message'
  }

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'event') eventName = value || 'message'
    // `data`, `id`, and `retry` are intentionally ignored: signed latest-release
    // data is fetched separately and remains the sole source of update metadata.
  }

  const consumeText = (text: string) => {
    buffered += text
    let lineEnd = buffered.indexOf('\n')
    while (lineEnd !== -1) {
      consumeLine(buffered.slice(0, lineEnd))
      buffered = buffered.slice(lineEnd + 1)
      lineEnd = buffered.indexOf('\n')
    }
  }

  void (async () => {
    try {
      const response = await fetcher(endpoint, {
        headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`更新通知连接失败: HTTP ${response.status}`)
      if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
        throw new Error('更新通知服务返回了非 SSE 内容')
      }
      if (!response.body) throw new Error('更新通知服务未返回 SSE 数据流')

      reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (!closed) {
        const { done, value } = await reader.read()
        if (done) break
        consumeText(decoder.decode(value, { stream: true }))
      }
      if (!closed) handlers.onDisconnected(new Error('更新通知连接已关闭'))
    } catch (error) {
      if (!closed) handlers.onDisconnected(error)
    }
  })()

  return {
    close: () => {
      if (closed) return
      closed = true
      controller.abort()
      void reader?.cancel().catch(() => undefined)
    },
  }
}

export class ReleaseEventMonitor {
  private readonly connect: ReleaseEventsConnector
  private readonly setIntervalFn: typeof setInterval
  private readonly clearIntervalFn: typeof clearInterval
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout
  private connection: ReleaseEventsConnection | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private connectionGeneration = 0

  constructor(
    private readonly endpoint: string,
    private readonly onCheck: (reason: ReleaseCheckReason) => unknown,
    dependencies: ReleaseMonitorDependencies = {},
  ) {
    this.connect = dependencies.connect || connectReleaseEvents
    this.setIntervalFn = dependencies.setIntervalFn || setInterval
    this.clearIntervalFn = dependencies.clearIntervalFn || clearInterval
    this.setTimeoutFn = dependencies.setTimeoutFn || setTimeout
    this.clearTimeoutFn = dependencies.clearTimeoutFn || clearTimeout
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.openConnection()
    this.pollTimer = this.setIntervalFn(() => this.triggerCheck('interval'), RELEASE_POLL_INTERVAL_MS)
  }

  stop(): void {
    this.running = false
    if (this.pollTimer) this.clearIntervalFn(this.pollTimer)
    if (this.reconnectTimer) this.clearTimeoutFn(this.reconnectTimer)
    this.pollTimer = null
    this.reconnectTimer = null
    this.closeConnection()
  }

  private triggerCheck(reason: ReleaseCheckReason): void {
    if (!this.running) return
    Promise.resolve(this.onCheck(reason)).catch((error) => {
      console.warn('[Yunyingxia] Signed update recheck failed:', error instanceof Error ? error.message : String(error))
    })
  }

  private openConnection(): void {
    if (!this.running || this.connection) return
    const generation = ++this.connectionGeneration
    try {
      this.connection = this.connect(this.endpoint, {
        onRelease: () => {
          if (this.running && generation === this.connectionGeneration) this.triggerCheck('sse')
        },
        onDisconnected: (error) => {
          if (!this.running || generation !== this.connectionGeneration) return
          console.warn('[Yunyingxia] Update SSE disconnected:', error instanceof Error ? error.message : String(error || 'unknown error'))
          this.scheduleReconnect()
        },
      })
    } catch (error) {
      console.warn('[Yunyingxia] Update SSE connection failed:', error instanceof Error ? error.message : String(error))
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return
    this.closeConnection()
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null
      this.openConnection()
    }, RELEASE_EVENT_RECONNECT_DELAY_MS)
  }

  private closeConnection(): void {
    this.connectionGeneration += 1
    this.connection?.close()
    this.connection = null
  }
}
