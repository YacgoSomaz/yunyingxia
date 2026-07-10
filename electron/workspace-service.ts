import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { WorkspaceRecord } from '../shared/contracts'

interface WorkspaceStore {
  nextId: number
  records: WorkspaceRecord[]
}

export class WorkspaceService {
  private memoryStore: WorkspaceStore = { nextId: 1, records: [] }

  constructor(private readonly filePath: string) {}

  list(query = ''): WorkspaceRecord[] {
    const normalized = query.trim().toLocaleLowerCase()
    return this.read().records
      .filter((record) => !normalized || `${record.title} ${record.topic}`.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: number): WorkspaceRecord | null {
    return this.read().records.find((record) => record.id === id) ?? null
  }

  create(input: Omit<WorkspaceRecord, 'id' | 'createdAt' | 'updatedAt'>): WorkspaceRecord {
    const store = this.read()
    const now = new Date().toISOString()
    const record: WorkspaceRecord = { ...input, id: store.nextId++, createdAt: now, updatedAt: now }
    store.records.unshift(record)
    this.write(store)
    return record
  }

  remove(id: number): void {
    const store = this.read()
    store.records = store.records.filter((record) => record.id !== id)
    this.write(store)
  }

  private read(): WorkspaceStore {
    if (this.filePath === ':memory:') return this.memoryStore
    if (!existsSync(this.filePath)) return { nextId: 1, records: [] }
    try {
      const stored = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<WorkspaceStore>
      return { nextId: stored.nextId ?? 1, records: stored.records ?? [] }
    } catch {
      return { nextId: 1, records: [] }
    }
  }

  private write(store: WorkspaceStore): void {
    if (this.filePath === ':memory:') {
      this.memoryStore = store
      return
    }
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf8')
  }
}
