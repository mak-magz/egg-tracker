/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncEngine } from '../../app/local/sync'

describe('SyncEngine', () => {
  let mockWorker: any
  let mockFetch: any
  let getAuthToken: any
  let isFree: boolean

  beforeEach(() => {
    isFree = false
    getAuthToken = vi.fn().mockResolvedValue('test-jwt-token')

    mockWorker = {
      getSyncStatus: vi.fn().mockResolvedValue({
        syncState: { last_pushed_at: '2026-11-06T12:00:00Z', last_pulled_version: 5 },
        pendingOutboxCount: 0,
      }),
      getPendingMutations: vi.fn().mockResolvedValue({ mutations: [] }),
      markMutationsProcessed: vi.fn().mockResolvedValue({ success: true }),
      resetInFlightMutations: vi.fn().mockResolvedValue({ success: true }),
      getLastPulledVersion: vi.fn().mockResolvedValue({ lastPulledVersion: 5, lastPulledAt: null }),
      applyRemoteChanges: vi.fn().mockResolvedValue({ appliedCount: 0, latestVersion: 5 }),
      updateSyncState: vi.fn().mockResolvedValue({ success: true }),
    }

    mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/sync/push') {
        return Promise.resolve({ results: [], latestVersion: 5 })
      }
      if (url === '/api/sync/pull') {
        return Promise.resolve({ changes: [], latestVersion: 5, hasMore: false })
      }
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('initializes in local_only state for free tier users', () => {
    isFree = true
    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => isFree,
      fetchFn: mockFetch,
    })

    expect(engine.getState().status).toBe('local_only')
    engine.start()
    expect(engine.getState().status).toBe('local_only')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('executes push and pull cycle successfully for premium users', async () => {
    mockWorker.getPendingMutations.mockResolvedValueOnce({
      mutations: [
        {
          id: 'mut-1',
          deviceId: 'D1',
          type: 'add_size',
          payload: { name: 'Extra Large' },
          occurredAt: '2026-11-06T12:05:00Z',
        },
      ],
    })

    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/sync/push') {
        return Promise.resolve({
          results: [{ id: 'mut-1', status: 'applied', version: 6 }],
          latestVersion: 6,
        })
      }
      if (url === '/api/sync/pull') {
        return Promise.resolve({
          changes: [
            {
              version: 6,
              entityType: 'sizes',
              entityId: 'size-xl',
              action: 'insert',
              deviceId: 'D2',
              occurredAt: '2026-11-06T12:05:00Z',
              data: { id: 'size-xl', name: 'Extra Large' },
            },
          ],
          latestVersion: 6,
          hasMore: false,
        })
      }
      return Promise.resolve({})
    })

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
      deviceId: 'D1',
    })

    await engine.syncCycle()

    expect(mockWorker.getPendingMutations).toHaveBeenCalledWith(50)
    expect(mockFetch).toHaveBeenCalledWith('/api/sync/push', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        deviceId: 'D1',
        mutations: expect.arrayContaining([expect.objectContaining({ id: 'mut-1' })]),
      }),
    }))
    expect(mockWorker.markMutationsProcessed).toHaveBeenCalledWith([
      { id: 'mut-1', status: 'applied', version: 6 },
    ])
    expect(mockWorker.applyRemoteChanges).toHaveBeenCalledWith(expect.any(Array), 6)
    expect(engine.getState().status).toBe('synced')
    expect(engine.getState().lastError).toBeNull()
  })

  it('paginates pull when hasMore is true', async () => {
    let pullCallCount = 0
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/sync/push') {
        return Promise.resolve({ results: [], latestVersion: 10 })
      }
      if (url === '/api/sync/pull') {
        pullCallCount++
        if (pullCallCount === 1) {
          return Promise.resolve({
            changes: [{ version: 6, entityType: 'clients', entityId: 'c1', action: 'insert', deviceId: 'D2', occurredAt: '2026-11-06T12:00:00Z', data: {} }],
            latestVersion: 10,
            hasMore: true,
          })
        }
        return Promise.resolve({
          changes: [{ version: 7, entityType: 'clients', entityId: 'c2', action: 'insert', deviceId: 'D2', occurredAt: '2026-11-06T12:01:00Z', data: {} }],
          latestVersion: 10,
          hasMore: false,
        })
      }
      return Promise.resolve({})
    })

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
    })

    await engine.syncCycle()
    expect(pullCallCount).toBe(2)
    expect(mockWorker.applyRemoteChanges).toHaveBeenCalledTimes(2)
  })

  it('handles transient network error: resets in-flight mutations and sets error state', async () => {
    mockWorker.getPendingMutations.mockResolvedValueOnce({
      mutations: [{ id: 'mut-1', deviceId: 'D1', type: 'add_size', payload: {}, occurredAt: '2026-11-06T12:00:00Z' }],
    })
    mockFetch.mockRejectedValueOnce(new Error('Network offline or 503 Service Unavailable'))

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
    })

    await engine.syncCycle()

    expect(mockWorker.resetInFlightMutations).toHaveBeenCalledTimes(1)
    expect(engine.getState().status).toBe('error')
    expect(engine.getState().lastError).toBe('Network offline or 503 Service Unavailable')
  })

  it('prevents overlapping runs with single-flight mutex', async () => {
    let resolvePush: any
    mockWorker.getPendingMutations.mockReturnValue(new Promise((resolve) => {
      resolvePush = resolve
    }))

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
    })

    const run1 = engine.syncCycle()
    const run2 = engine.syncCycle() // Concurrent call while run1 is in-flight

    expect(engine.getState().status).toBe('syncing')
    resolvePush({ mutations: [] })
    await Promise.all([run1, run2])

    // Only 1 execution occurred, the second returned immediately due to mutex
    expect(mockWorker.getLastPulledVersion).toHaveBeenCalledTimes(1)
  })

  it('subscribes to state changes', () => {
    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
    })

    const states: string[] = []
    const unsubscribe = engine.subscribe(state => states.push(state.status))

    expect(states).toEqual(['local_only'])
    unsubscribe()
  })

  it('pauses sync without network calls when navigator.onLine is false', async () => {
    const originalNavigator = globalThis.navigator
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        configurable: true,
      })

      mockWorker.getSyncStatus.mockResolvedValueOnce({
        syncState: null,
        pendingOutboxCount: 3,
      })

      const engine = new SyncEngine({
        localWorker: mockWorker,
        getAuthToken,
        isFree: () => false,
        fetchFn: mockFetch,
      })

      await engine.syncCycle()

      expect(engine.getState().status).toBe('offline_changes')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockWorker.getPendingMutations).not.toHaveBeenCalled()
    }
    finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      })
    }
  })

  it('pulls and applies action-based CDC mutations from remote devices', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/sync/push') {
        return Promise.resolve({ results: [], latestVersion: 8 })
      }
      if (url === '/api/sync/pull') {
        return Promise.resolve({
          changes: [
            {
              version: 7,
              entityType: 'create_sale',
              entityId: 'mut-sale-1',
              action: 'insert',
              deviceId: 'D2',
              occurredAt: '2026-11-06T12:05:00Z',
              data: {
                id: 'sale-remote-1',
                saleNumber: 'D2-0001',
                saleDate: '2026-11-06',
                type: 'delivery',
                clientId: 'cli-1',
                lines: [{ sizeId: 'sz-1', eggs: 30, pricePerTray: 200, lineTotal: 200 }],
              },
            },
            {
              version: 8,
              entityType: 'log_production',
              entityId: 'mut-prod-1',
              action: 'insert',
              deviceId: 'D2',
              occurredAt: '2026-11-06T12:06:00Z',
              data: {
                date: '2026-11-06',
                good: [{ sizeId: 'sz-1', eggs: 60 }],
                rejects: 2,
              },
            },
          ],
          latestVersion: 8,
          hasMore: false,
        })
      }
      return Promise.resolve({})
    })

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
      deviceId: 'D1',
    })

    await engine.syncCycle()

    expect(mockWorker.applyRemoteChanges).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'create_sale' }),
        expect.objectContaining({ entityType: 'log_production' }),
      ]),
      8,
    )
    expect(engine.getState().status).toBe('synced')
  })

  it('updates excludeDeviceId when setDeviceId is called', async () => {
    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
      deviceId: 'D-ORIG',
    })

    engine.setDeviceId('D-NEW1')
    await engine.syncCycle()

    expect(mockFetch).toHaveBeenCalledWith('/api/sync/pull', expect.objectContaining({
      query: expect.objectContaining({
        excludeDeviceId: 'D-NEW1',
      }),
    }))
  })

  it('pulls changes starting from lastPulledVersion to prevent re-applying snapshotted data', async () => {
    mockWorker.getLastPulledVersion.mockResolvedValueOnce({
      lastPulledVersion: 15,
      lastPulledAt: '2026-11-06T12:00:00Z',
    })

    const engine = new SyncEngine({
      localWorker: mockWorker,
      getAuthToken,
      isFree: () => false,
      fetchFn: mockFetch,
      deviceId: 'D1',
    })

    await engine.syncCycle()

    expect(mockFetch).toHaveBeenCalledWith('/api/sync/pull', expect.objectContaining({
      query: expect.objectContaining({
        sinceVersion: 15,
        excludeDeviceId: 'D1',
      }),
    }))
  })
})
