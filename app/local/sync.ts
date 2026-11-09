/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LocalWorkerClient } from './client'
import { localWorker } from './client'

export type SyncStatus
  = | 'local_only'
    | 'syncing'
    | 'synced'
    | 'offline'
    | 'offline_changes'
    | 'error'

export interface SyncEngineState {
  status: SyncStatus
  pendingCount: number
  lastSyncedAt: string | null
  lastError: string | null
}

export interface SyncEngineOptions {
  localWorker?: LocalWorkerClient
  getAuthToken?: () => Promise<string | null>
  isFree?: () => boolean
  syncIntervalMs?: number
  fetchFn?: any
  deviceId?: string
}

export class SyncEngine {
  private localWorker: LocalWorkerClient
  private getAuthToken: () => Promise<string | null>
  private isFreeFn: () => boolean
  private syncIntervalMs: number
  private fetchFn: any

  private timer: ReturnType<typeof setTimeout> | null = null
  private isSyncing = false
  private consecutiveFailures = 0
  private isRunning = false
  private deviceId = 'D1'

  private state: SyncEngineState = {
    status: 'local_only',
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
  }

  private listeners = new Set<(state: SyncEngineState) => void>()

  constructor(options: SyncEngineOptions = {}) {
    this.localWorker = options.localWorker || localWorker
    this.getAuthToken = options.getAuthToken || (async () => null)
    this.isFreeFn = options.isFree || (() => false)
    this.syncIntervalMs = options.syncIntervalMs ?? 20000
    this.fetchFn = options.fetchFn || (typeof globalThis.$fetch !== 'undefined' ? globalThis.$fetch : globalThis.fetch)
    if (options.deviceId) this.deviceId = options.deviceId

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline())
      window.addEventListener('offline', () => this.handleOffline())
    }
  }

  public configure(options: Partial<SyncEngineOptions>): void {
    if (options.localWorker) this.localWorker = options.localWorker
    if (options.getAuthToken) this.getAuthToken = options.getAuthToken
    if (options.isFree) this.isFreeFn = options.isFree
    if (options.syncIntervalMs !== undefined) this.syncIntervalMs = options.syncIntervalMs
    if (options.fetchFn) this.fetchFn = options.fetchFn
    if (options.deviceId) this.deviceId = options.deviceId
  }

  public setDeviceId(deviceId: string): void {
    this.deviceId = deviceId
  }

  public getState(): SyncEngineState {
    return { ...this.state }
  }

  public subscribe(listener: (state: SyncEngineState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emitState(): void {
    const s = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(s)
      }
      catch (e) {
        console.error('[sync-engine] Listener error:', e)
      }
    }
  }

  private setState(partial: Partial<SyncEngineState>): void {
    this.state = { ...this.state, ...partial }
    this.emitState()
  }

  public start(): void {
    if (this.isAdminRoute()) {
      return
    }
    this.isRunning = true
    if (this.isFreeFn()) {
      this.setState({ status: 'local_only' })
      return
    }
    void this.refreshPendingCount()
    this.scheduleNext(0)
  }

  public stop(): void {
    this.isRunning = false
    this.clearTimer()
    if (this.isFreeFn()) {
      this.setState({ status: 'local_only' })
    }
  }

  private isAdminRoute(): boolean {
    if (typeof window === 'undefined') return false
    const path = window.location.pathname
    return path.startsWith('/admin') || path.startsWith('/login/admin')
  }

  private handleOnline(): void {
    if (this.isRunning && !this.isFreeFn()) {
      this.scheduleNext(0)
    }
  }

  private handleOffline(): void {
    this.clearTimer()
    const status: SyncStatus = this.state.pendingCount > 0 ? 'offline_changes' : 'offline'
    this.setState({ status })
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleNext(delayMs: number): void {
    this.clearTimer()
    if (!this.isRunning) return
    this.timer = setTimeout(() => {
      void this.syncCycle()
    }, delayMs)
  }

  public async refreshPendingCount(): Promise<number> {
    try {
      const res = await this.localWorker.getSyncStatus()
      const count = res.pendingOutboxCount
      this.setState({
        pendingCount: count,
        ...(res.syncState?.last_pushed_at ? { lastSyncedAt: res.syncState.last_pushed_at } : {}),
      })
      return count
    }
    catch {
      return this.state.pendingCount
    }
  }

  public async triggerSync(): Promise<void> {
    if (this.isAdminRoute()) {
      if (this.isRunning) {
        this.scheduleNext(this.syncIntervalMs)
      }
      return
    }
    return this.syncCycle()
  }

  public async syncCycle(): Promise<void> {
    if (this.isSyncing) return
    if (this.isAdminRoute()) {
      if (this.isRunning) {
        this.scheduleNext(this.syncIntervalMs)
      }
      return
    }

    if (this.isFreeFn()) {
      this.setState({ status: 'local_only' })
      return
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const pending = await this.refreshPendingCount()
      this.setState({
        status: pending > 0 ? 'offline_changes' : 'offline',
      })
      return
    }

    this.isSyncing = true
    this.setState({ status: 'syncing', lastError: null })

    try {
      const token = await this.getAuthToken()
      if (!token) {
        await this.refreshPendingCount()
        this.setState({ status: 'local_only' })
        this.isSyncing = false
        this.scheduleNext(this.syncIntervalMs)
        return
      }

      // --- Push Phase ---
      let hasMorePush = true
      while (hasMorePush) {
        const { mutations } = await this.localWorker.getPendingMutations(50)
        if (!mutations || mutations.length === 0) {
          hasMorePush = false
          break
        }

        const effectiveDeviceId = mutations[0]?.deviceId || this.deviceId || 'D1'

        const pushRes = await this.fetchFn('/api/sync/push', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: {
            deviceId: effectiveDeviceId,
            mutations,
          },
        })

        if (pushRes && Array.isArray(pushRes.results)) {
          await this.localWorker.markMutationsProcessed(pushRes.results)
        }
        else {
          throw new Error('Failed to push mutations to cloud')
        }

        if (mutations.length < 50) {
          hasMorePush = false
        }
      }

      // --- Pull Phase ---
      let hasMorePull = true
      while (hasMorePull) {
        const { lastPulledVersion } = await this.localWorker.getLastPulledVersion()

        const pullRes = await this.fetchFn('/api/sync/pull', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          query: {
            sinceVersion: lastPulledVersion,
            limit: 500,
            excludeDeviceId: this.deviceId,
          },
        })

        if (!pullRes || !Array.isArray(pullRes.changes)) {
          throw new Error('Invalid pull response from cloud')
        }

        if (pullRes.changes.length > 0) {
          await this.localWorker.applyRemoteChanges(pullRes.changes, pullRes.latestVersion)
        }

        hasMorePull = Boolean(pullRes.hasMore)
      }

      const now = new Date().toISOString()
      const pendingCount = await this.refreshPendingCount()
      this.consecutiveFailures = 0

      this.setState({
        status: pendingCount > 0 ? 'syncing' : 'synced',
        lastSyncedAt: now,
        lastError: null,
        pendingCount,
      })

      await this.localWorker.updateSyncState({
        status: 'synced',
        lastError: null,
      })

      this.scheduleNext(this.syncIntervalMs)
    }
    catch (err: any) {
      console.warn('[sync-engine] Sync error:', err)
      this.consecutiveFailures++

      await this.localWorker.resetInFlightMutations()
      const pendingCount = await this.refreshPendingCount()

      const errorMessage = err?.message || 'Sync failed'
      this.setState({
        status: 'error',
        lastError: errorMessage,
        pendingCount,
      })

      await this.localWorker.updateSyncState({
        status: 'error',
        lastError: errorMessage,
      })

      const backoffMs = Math.min(1000 * Math.pow(2, this.consecutiveFailures), 60000)
      this.scheduleNext(backoffMs)
    }
    finally {
      this.isSyncing = false
    }
  }
}

declare global {
  var __tamagoSyncEngine: SyncEngine | undefined
}

export const syncEngine: SyncEngine
  = (typeof globalThis !== 'undefined' && globalThis.__tamagoSyncEngine)
    || ((typeof globalThis !== 'undefined') ? (globalThis.__tamagoSyncEngine = new SyncEngine()) : new SyncEngine())
