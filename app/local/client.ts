/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WorkerRequest, WorkerResponse } from './worker'

function toCloneable<T>(val: T): T {
  if (val === undefined || val === null) return val
  if (typeof val !== 'object') return val
  try {
    return JSON.parse(JSON.stringify(val))
  }
  catch {
    return val
  }
}

export class LocalWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<string, {
    resolve: (value: any) => void
    reject: (reason?: any) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  private initPromise: Promise<void> | null = null

  private send<T = any>(request: WorkerRequest, timeoutMs = 30000): Promise<T> {
    const worker = this.worker
    if (!worker) {
      return Promise.reject(new Error('Local worker is not available on this platform'))
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        reject(new Error(`Local worker request [${request.type}] timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(request.id, { resolve, reject, timer })

      try {
        const cloneableRequest: WorkerRequest = {
          id: request.id,
          type: request.type,
          ...(request.route
            ? {
                route: {
                  method: request.route.method,
                  path: request.route.path,
                  query: toCloneable(request.route.query),
                  body: toCloneable(request.route.body),
                },
              }
            : {}),
          ...(request.payload !== undefined
            ? { payload: toCloneable(request.payload) }
            : {}),
        }
        worker.postMessage(cloneableRequest)
      }
      catch (err) {
        clearTimeout(timer)
        this.pending.delete(request.id)
        reject(err)
      }
    })
  }

  private init(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined' || typeof Worker === 'undefined') {
        resolve()
        return
      }

      try {
        // Request persistent storage in OPFS if supported
        if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
          navigator.storage.persist().catch(() => {})
        }

        this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
          type: 'module',
        })

        // Terminate worker synchronously on page unload so OPFS sync access handles are promptly released
        window.addEventListener('beforeunload', () => {
          try {
            this.worker?.terminate()
          }
          catch {
            // ignore
          }
        })

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const { id, ok, data, error } = event.data
          const handler = this.pending.get(id)
          if (!handler) return

          clearTimeout(handler.timer)
          this.pending.delete(id)

          if (ok) {
            handler.resolve(data)
          }
          else {
            handler.reject(error)
          }
        }

        this.worker.onerror = (err: any) => {
          const errInfo = {
            message: err?.message,
            filename: err?.filename,
            lineno: err?.lineno,
            colno: err?.colno,
            error: err?.error ? String(err.error) : undefined,
          }
          console.error('[local-worker] Worker error:', errInfo, err)
          for (const [id, handler] of this.pending.entries()) {
            clearTimeout(handler.timer)
            handler.reject(err)
            this.pending.delete(id)
          }
        }

        // Verify with PING directly without calling callWorker / awaiting init()
        this.send({ id: crypto.randomUUID(), type: 'PING' }, 10000)
          .then(() => resolve())
          .catch(err => reject(err))
      }
      catch (err) {
        console.error('[local-worker] Failed to spawn worker:', err)
        reject(err)
      }
    })

    return this.initPromise
  }

  async callWorker<T = any>(
    type: WorkerRequest['type'],
    payload?: any,
    timeoutMs = 30000,
  ): Promise<T> {
    await this.init()
    const id = crypto.randomUUID()
    return this.send<T>({ id, type, payload }, timeoutMs)
  }

  async dispatchRoute<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    query?: Record<string, any>,
    body?: any,
    timeoutMs = 30000,
  ): Promise<T> {
    await this.init()
    const id = crypto.randomUUID()
    return this.send<T>(
      {
        id,
        type: 'EXECUTE',
        route: {
          method,
          path,
          query,
          body,
        },
      },
      timeoutMs,
    )
  }

  async exportData(): Promise<any> {
    return this.callWorker('EXPORT_DATA')
  }

  async importSnapshot(snapshot: any): Promise<{ success: boolean }> {
    return this.callWorker('IMPORT_SNAPSHOT', snapshot)
  }

  async getSyncStatus(): Promise<{ syncState: any, pendingOutboxCount: number }> {
    return this.callWorker('GET_SYNC_STATUS')
  }

  async getPendingMutations(limit?: number): Promise<{
    mutations: Array<{
      id: string
      deviceId: string
      type: string
      payload: Record<string, any>
      occurredAt: string
    }>
  }> {
    return this.callWorker('GET_PENDING_MUTATIONS', { limit })
  }

  async markMutationsProcessed(results: Array<{
    id: string
    status: 'applied' | 'conflict_lww' | 'rejected'
    error?: string
  }>): Promise<{ success: boolean }> {
    return this.callWorker('MARK_MUTATIONS_PROCESSED', { results })
  }

  async resetInFlightMutations(): Promise<{ success: boolean }> {
    return this.callWorker('RESET_IN_FLIGHT_MUTATIONS')
  }

  async getLastPulledVersion(): Promise<{
    lastPulledVersion: number
    lastPulledAt: string | null
  }> {
    return this.callWorker('GET_LAST_PULLED_VERSION')
  }

  async applyRemoteChanges(changes: any[], latestVersion: number): Promise<{
    appliedCount: number
    latestVersion: number
  }> {
    return this.callWorker('APPLY_REMOTE_CHANGES', { changes, latestVersion })
  }

  async updateSyncState(patch: {
    status?: string
    lastError?: string | null
    tenantId?: string
    cloudUrl?: string
    cloudToken?: string
  }): Promise<{ success: boolean }> {
    return this.callWorker('UPDATE_SYNC_STATE', patch)
  }
}

declare global {
  var __tamagoLocalWorker: LocalWorkerClient | undefined
}

export const localWorker: LocalWorkerClient
  = (typeof globalThis !== 'undefined' && globalThis.__tamagoLocalWorker)
    || ((typeof globalThis !== 'undefined') ? (globalThis.__tamagoLocalWorker = new LocalWorkerClient()) : new LocalWorkerClient())
