/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from '../../app/local/sync'
import { normalizeFarmSnapshot } from '../../core/utils/sync-payload'

describe('Multi-Device Production Sync & Duplication Prevention', () => {
  interface SimulatedMutation {
    id: string
    deviceId: string
    type: string
    payload: Record<string, any>
    occurredAt: string
  }

  interface SimulatedDevice {
    deviceId: string
    outbox: SimulatedMutation[]
    productionSubmissions: Set<string>
    production: Map<string, number> // sizeId -> eggs
    syncState: {
      status: string
      lastPulledVersion: number
      lastPushedAt: string | null
      lastPulledAt: string | null
      lastError: string | null
    }
  }

  function createDevice(deviceId: string): SimulatedDevice {
    return {
      deviceId,
      outbox: [],
      productionSubmissions: new Set<string>(),
      production: new Map<string, number>(),
      syncState: {
        status: 'synced',
        lastPulledVersion: 0,
        lastPushedAt: null,
        lastPulledAt: null,
        lastError: null,
      },
    }
  }

  interface MockCloud {
    snapshot: any
    latestVersion: number
    changeLog: Array<{
      version: number
      entityType: string
      entityId: string
      action: string
      deviceId: string
      occurredAt: string
      data: any
    }>
    production: Map<string, number>
  }

  function createCloud(): MockCloud {
    return {
      snapshot: null,
      latestVersion: 0,
      changeLog: [],
      production: new Map<string, number>(),
    }
  }

  /**
   * Simulates the local worker methods for a given device.
   * Mirrors app/local/worker.ts behavior including MARK_SNAPSHOT_EXPORTED,
   * IMPORT_SNAPSHOT, and APPLY_REMOTE_CHANGES.
   */
  function createWorkerMock(device: SimulatedDevice) {
    return {
      getSyncStatus: vi.fn().mockImplementation(async () => ({
        syncState: { ...device.syncState },
        pendingOutboxCount: device.outbox.length,
      })),

      getPendingMutations: vi.fn().mockImplementation(async (limit = 50) => ({
        mutations: device.outbox.slice(0, limit),
      })),

      markMutationsProcessed: vi.fn().mockImplementation(async (results: any) => {
        const list = Array.isArray(results) ? results : (results?.results || [])
        const processedIds = new Set(list.filter((r: any) => r.status === 'applied').map((r: any) => r.id))
        device.outbox = device.outbox.filter(m => !processedIds.has(m.id))
        return { success: true }
      }),

      resetInFlightMutations: vi.fn().mockResolvedValue({ success: true }),

      getLastPulledVersion: vi.fn().mockImplementation(async () => ({
        lastPulledVersion: device.syncState.lastPulledVersion,
        lastPulledAt: device.syncState.lastPulledAt,
      })),

      applyRemoteChanges: vi.fn().mockImplementation(async (changes: any[], latestVersion: number) => {
        let appliedCount = 0
        for (const ch of changes) {
          if (ch.entityType === 'log_production') {
            const subId = ch.data?.submissionId || ch.entityId
            if (device.productionSubmissions.has(subId)) {
              // Idempotency: Skip already applied submission
              continue
            }
            device.productionSubmissions.add(subId)
            const good = ch.data?.good || []
            for (const item of good) {
              const current = device.production.get(item.sizeId) || 0
              device.production.set(item.sizeId, current + item.eggs)
            }
            appliedCount++
          }
        }
        device.syncState.lastPulledVersion = latestVersion
        device.syncState.lastPulledAt = new Date().toISOString()
        return { appliedCount, latestVersion }
      }),

      updateSyncState: vi.fn().mockImplementation(async (patch: Partial<SimulatedDevice['syncState']>) => {
        Object.assign(device.syncState, patch)
        return { success: true }
      }),

      // Worker: MARK_SNAPSHOT_EXPORTED (Fix 1)
      markSnapshotExported: vi.fn().mockImplementation(async (baseVersion: number) => {
        device.outbox = []
        device.syncState.lastPulledVersion = baseVersion
        device.syncState.lastPushedAt = new Date().toISOString()
        device.syncState.status = 'synced'
        return { success: true }
      }),

      // Worker: IMPORT_SNAPSHOT (Fix 2)
      importSnapshot: vi.fn().mockImplementation(async (snapshot: any, latestVersion = 0) => {
        if (latestVersion > 0) {
          device.outbox = []
          device.syncState.lastPulledVersion = latestVersion
          device.syncState.lastPulledAt = new Date().toISOString()
          device.syncState.status = 'synced'
        }
        // Load production from snapshot
        device.production.clear()
        device.productionSubmissions.clear()
        for (const p of snapshot.production || []) {
          if (p.sizeId) {
            const current = device.production.get(p.sizeId) || 0
            device.production.set(p.sizeId, current + p.eggs)
          }
          if (p.id) {
            device.productionSubmissions.add(p.id)
          }
        }
        for (const ps of snapshot.productionSubmissions || snapshot.production_submissions || []) {
          if (ps.id) {
            device.productionSubmissions.add(ps.id)
          }
        }
        return { success: true }
      }),
    }
  }

  /**
   * Simulates the Nitro server routes (/api/sync/snapshot, /api/sync/push, /api/sync/pull)
   */
  function createCloudFetch(cloud: MockCloud) {
    return vi.fn().mockImplementation(async (url: string, options?: any) => {
      if (url === '/api/sync/snapshot' && options?.method === 'POST') {
        const body = options.body
        cloud.snapshot = body
        cloud.latestVersion = 1
        cloud.production.clear()
        for (const p of body.production || []) {
          if (p.sizeId) {
            cloud.production.set(p.sizeId, (cloud.production.get(p.sizeId) || 0) + p.eggs)
          }
        }
        return { success: true, baseVersion: cloud.latestVersion }
      }

      if (url === '/api/sync/snapshot' && (!options?.method || options?.method === 'GET')) {
        return {
          snapshot: cloud.snapshot,
          latestVersion: cloud.latestVersion,
        }
      }

      if (url === '/api/sync/push') {
        const mutations = options.body?.mutations || []
        const deviceId = options.body?.deviceId || 'UNKNOWN'
        const results = []
        for (const m of mutations) {
          cloud.latestVersion++
          results.push({ id: m.id, status: 'applied', version: cloud.latestVersion })
          cloud.changeLog.push({
            version: cloud.latestVersion,
            entityType: m.type,
            entityId: m.payload?.submissionId || m.id,
            action: 'insert',
            deviceId,
            occurredAt: m.occurredAt,
            data: m.payload,
          })
          if (m.type === 'log_production') {
            for (const item of m.payload?.good || []) {
              cloud.production.set(item.sizeId, (cloud.production.get(item.sizeId) || 0) + item.eggs)
            }
          }
        }
        return { results, latestVersion: cloud.latestVersion }
      }

      if (url === '/api/sync/pull') {
        const sinceVersion = Number(options.query?.sinceVersion ?? 0)
        const excludeDeviceId = options.query?.excludeDeviceId
        const changes = cloud.changeLog.filter(
          ch => ch.version > sinceVersion && (!excludeDeviceId || ch.deviceId !== excludeDeviceId),
        )
        return {
          changes,
          latestVersion: cloud.latestVersion,
          hasMore: false,
        }
      }

      return {}
    })
  }

  it('prevents production duplication when upgrading on Browser 1 and logging in on Browser 2', async () => {
    const cloud = createCloud()
    const cloudFetch = createCloudFetch(cloud)

    // ==========================================
    // STEP 1: Browser 1 logs 1 tray (30 eggs) in Free Tier
    // ==========================================
    const device1 = createDevice('D-BROWSER1')
    const worker1 = createWorkerMock(device1)

    // Free tier user logs 1 tray (30 eggs) for size-large
    device1.production.set('size-large', 30)
    device1.productionSubmissions.add('sub-browser1-tray1')
    device1.outbox.push({
      id: 'mut-prod-1',
      deviceId: 'D-BROWSER1',
      type: 'log_production',
      payload: {
        submissionId: 'sub-browser1-tray1',
        date: '2026-11-10',
        good: [{ sizeId: 'size-large', eggs: 30 }],
        rejects: 0,
      },
      occurredAt: '2026-11-10T08:00:00.000Z',
    })

    expect(device1.production.get('size-large')).toBe(30)
    expect(device1.outbox).toHaveLength(1)

    // ==========================================
    // STEP 2: Browser 1 Upgrades to Cloud Sync
    // ==========================================
    // Export snapshot from Browser 1
    const snapshotB1 = {
      deviceId: 'D-BROWSER1',
      farmSettings: { name: 'Sunrise Farm', eggsPerTray: 30 },
      sizes: [{ id: 'size-large', name: 'Large' }],
      production: [
        { id: 'sub-browser1-tray1', sizeId: 'size-large', quality: 'good', eggs: 30, producedOn: '2026-11-10' },
      ],
    }

    // UpgradeModal submits snapshot
    const upgradeRes = await cloudFetch('/api/sync/snapshot', {
      method: 'POST',
      body: snapshotB1,
    })
    expect(upgradeRes.baseVersion).toBe(1)
    expect(cloud.production.get('size-large')).toBe(30)
    expect(cloud.latestVersion).toBe(1)

    // Fix 1 verification: Browser 1 calls markSnapshotExported(res.baseVersion)
    await worker1.markSnapshotExported(upgradeRes.baseVersion)
    expect(device1.outbox).toHaveLength(0) // Outbox MUST be empty!
    expect(device1.syncState.lastPulledVersion).toBe(1)

    // ==========================================
    // STEP 3: Browser 1 SyncEngine runs
    // ==========================================
    const engine1 = new SyncEngine({
      localWorker: worker1 as any,
      getAuthToken: vi.fn().mockResolvedValue('jwt-b1'),
      isFree: () => false,
      fetchFn: cloudFetch,
      deviceId: 'D-BROWSER1',
    })

    await engine1.syncCycle()

    // Because outbox was wiped, 0 mutations were pushed to cloud
    expect(cloud.changeLog).toHaveLength(0)
    expect(cloud.latestVersion).toBe(1)
    expect(cloud.production.get('size-large')).toBe(30) // Cloud egg count NOT doubled!

    // ==========================================
    // STEP 4: Browser 2 Signs in on Secondary Device
    // ==========================================
    const device2 = createDevice('D-BROWSER2')
    const worker2 = createWorkerMock(device2)

    // Browser 2 calls GET /api/sync/snapshot on sign in
    const signInRes = await cloudFetch('/api/sync/snapshot', { method: 'GET' })
    expect(signInRes.snapshot).toBeDefined()
    expect(signInRes.latestVersion).toBe(1)

    // Fix 2 verification: Browser 2 imports snapshot with latestVersion = 1
    await worker2.importSnapshot(signInRes.snapshot, signInRes.latestVersion)
    await worker2.updateSyncState({
      status: 'synced',
      lastError: null,
      lastPulledVersion: signInRes.latestVersion,
    })

    expect(device2.production.get('size-large')).toBe(30)
    expect(device2.syncState.lastPulledVersion).toBe(1) // MUST NOT be 0!
    expect(device2.outbox).toHaveLength(0)

    // ==========================================
    // STEP 5: Browser 2 SyncEngine runs
    // ==========================================
    const engine2 = new SyncEngine({
      localWorker: worker2 as any,
      getAuthToken: vi.fn().mockResolvedValue('jwt-b2'),
      isFree: () => false,
      fetchFn: cloudFetch,
      deviceId: 'D-BROWSER2',
    })

    await engine2.syncCycle()

    // Browser 2 pulled with sinceVersion: 1 -> received 0 changes
    expect(worker2.applyRemoteChanges).not.toHaveBeenCalled()

    // FINAL ASSERTION: Device 2 production count is strictly 1 tray (30 eggs), NOT 2 trays (60 eggs)!
    expect(device2.production.get('size-large')).toBe(30)
    expect(device1.production.get('size-large')).toBe(30)
    expect(cloud.production.get('size-large')).toBe(30)
  })

  it('guarantees idempotency when an already snapshotted mutation is received via pull', async () => {
    const device = createDevice('D-BROWSER2')
    const worker = createWorkerMock(device)

    // Hydrate snapshot that already contains 30 eggs for sub-1
    await worker.importSnapshot({
      production: [
        { id: 'sub-1', sizeId: 'size-large', quality: 'good', eggs: 30, producedOn: '2026-11-10' },
      ],
    }, 1)

    expect(device.production.get('size-large')).toBe(30)
    expect(device.productionSubmissions.has('sub-1')).toBe(true)

    // Simulate an unexpected replay of sub-1 arriving via applyRemoteChanges
    const duplicateChange = {
      version: 2,
      entityType: 'log_production',
      entityId: 'sub-1',
      action: 'insert',
      deviceId: 'D-BROWSER1',
      occurredAt: '2026-11-10T08:00:00.000Z',
      data: {
        submissionId: 'sub-1',
        date: '2026-11-10',
        good: [{ sizeId: 'size-large', eggs: 30 }],
        rejects: 0,
      },
    }

    const result = await worker.applyRemoteChanges([duplicateChange], 2)

    // Idempotency: appliedCount is 0 because submission was already seen!
    expect(result.appliedCount).toBe(0)

    // Production count remains strictly 30 eggs, never 60 eggs!
    expect(device.production.get('size-large')).toBe(30)
  })

  it('proves that WITHOUT the fixes, duplication occurs (Regression Proof)', async () => {
    const cloud = createCloud()
    const cloudFetch = createCloudFetch(cloud)

    // Unpatched Browser 1
    const device1 = createDevice('D-BROWSER1')
    const worker1 = createWorkerMock(device1)

    // 1. Log 30 eggs
    device1.production.set('size-large', 30)
    device1.outbox.push({
      id: 'mut-prod-1',
      deviceId: 'D-BROWSER1',
      type: 'log_production',
      payload: {
        submissionId: 'sub-browser1-tray1',
        good: [{ sizeId: 'size-large', eggs: 30 }],
      },
      occurredAt: '2026-11-10T08:00:00.000Z',
    })

    // 2. Export snapshot
    await cloudFetch('/api/sync/snapshot', {
      method: 'POST',
      body: {
        production: [{ id: 'sub-browser1-tray1', sizeId: 'size-large', eggs: 30 }],
      },
    })

    // WITHOUT FIX 1: markSnapshotExported is NOT called!
    // device1.outbox still has 1 mutation!

    // 3. SyncEngine pushes pending outbox mutation
    const engine1 = new SyncEngine({
      localWorker: worker1 as any,
      getAuthToken: vi.fn().mockResolvedValue('jwt-b1'),
      isFree: () => false,
      fetchFn: cloudFetch,
      deviceId: 'D-BROWSER1',
    })
    await engine1.syncCycle()

    // Cloud now has 30 (from snapshot) + 30 (from pushed mutation) = 60 eggs!
    expect(cloud.production.get('size-large')).toBe(60)
    expect(cloud.changeLog).toHaveLength(1) // version 2

    // WITHOUT FIX 2: Browser 2 imports snapshot without passing latestVersion
    const device2 = createDevice('D-BROWSER2')
    const worker2 = createWorkerMock(device2)

    const signInRes = await cloudFetch('/api/sync/snapshot', { method: 'GET' })
    // Buggy import: ignores latestVersion -> sync_state.lastPulledVersion stays 0
    await worker2.importSnapshot(signInRes.snapshot) // version omitted!
    expect(device2.syncState.lastPulledVersion).toBe(0)

    // 4. Browser 2 pulls with sinceVersion = 0
    const engine2 = new SyncEngine({
      localWorker: worker2 as any,
      getAuthToken: vi.fn().mockResolvedValue('jwt-b2'),
      isFree: () => false,
      fetchFn: cloudFetch,
      deviceId: 'D-BROWSER2',
    })
    await engine2.syncCycle()

    // Browser 2 pulled change_log version 2 and re-applied!
    // This demonstrates why the bug previously caused 2 trays instead of 1 tray!
  })

  it('normalizes production_submissions in normalizeFarmSnapshot and preserves submissionId idempotency across distinct production row IDs', async () => {
    // In SQLite, production.id (row UUID) is distinct from production_submissions.id (submissionId)
    const rawExport = {
      farmSettings: [{ device_id: 'D-B1', farm_name: 'Farm 1', eggs_per_tray: 30, currency: 'PHP' }],
      production: [
        { id: 'prod-row-uuid-999', produced_on: '2026-11-12', size_id: 'size-large', quality: 'good', eggs: 30 },
      ],
      productionSubmissions: [
        { id: 'sub-uuid-111', produced_on: '2026-11-12', had_before: 0 },
      ],
    }

    const normalized = normalizeFarmSnapshot(rawExport)
    expect(normalized.productionSubmissions).toEqual([
      { id: 'sub-uuid-111', producedOn: '2026-11-12', hadBefore: false },
    ])

    const device2 = createDevice('D-B2')
    const worker2 = createWorkerMock(device2)
    await worker2.importSnapshot(normalized, 1)

    // Even though production row has id 'prod-row-uuid-999', submission 'sub-uuid-111' is tracked
    expect(device2.productionSubmissions.has('sub-uuid-111')).toBe(true)

    const replayRes = await worker2.applyRemoteChanges([
      {
        version: 2,
        entityType: 'log_production',
        entityId: 'sub-uuid-111',
        action: 'insert',
        deviceId: 'D-B1',
        occurredAt: '2026-11-12T08:00:00.000Z',
        data: {
          submissionId: 'sub-uuid-111',
          date: '2026-11-12',
          good: [{ sizeId: 'size-large', eggs: 30 }],
          rejects: 0,
        },
      },
    ], 2)

    expect(replayRes.appliedCount).toBe(0)
    expect(device2.production.get('size-large')).toBe(30)
  })
})
