import { computed, readonly, ref } from 'vue'
import { localWorker } from '../local/client'
import { syncEngine, type SyncStatus } from '../local/sync'

const globalSyncStatus = ref<SyncStatus>(syncEngine.getState().status)
const globalPendingOutboxCount = ref<number>(syncEngine.getState().pendingCount)
const globalFailedOutboxCount = ref<number>(syncEngine.getState().failedCount)
const globalNeedsReconcile = ref<boolean>(syncEngine.getState().needsReconcile)
const globalLastSyncedAt = ref<string | null>(syncEngine.getState().lastSyncedAt)
const globalLastRemoteUpdateAt = ref<string | null>(syncEngine.getState().lastRemoteUpdateAt)
const globalLastError = ref<string | null>(syncEngine.getState().lastError)
const globalConflictsModalOpen = ref<boolean>(false)

let isSubscribed = false

function ensureSubscribed() {
  if (isSubscribed || typeof window === 'undefined') return
  isSubscribed = true
  syncEngine.subscribe((state) => {
    globalSyncStatus.value = state.status
    globalPendingOutboxCount.value = state.pendingCount
    globalFailedOutboxCount.value = state.failedCount
    globalNeedsReconcile.value = state.needsReconcile
    globalLastSyncedAt.value = state.lastSyncedAt
    globalLastRemoteUpdateAt.value = state.lastRemoteUpdateAt
    globalLastError.value = state.lastError
  })
}

export function useSync() {
  ensureSubscribed()

  function triggerSync() {
    return syncEngine.triggerSync()
  }

  function openConflictsModal() {
    globalConflictsModalOpen.value = true
  }

  function closeConflictsModal() {
    globalConflictsModalOpen.value = false
  }

  async function getFailedMutations() {
    const res = await localWorker.getFailedMutations()
    return res.mutations
  }

  async function retryMutation(id: string) {
    await localWorker.retryFailedMutation(id)
    await syncEngine.refreshPendingCount()
    await syncEngine.triggerSync()
  }

  async function retryAllMutations() {
    await localWorker.retryAllFailedMutations()
    await syncEngine.refreshPendingCount()
    await syncEngine.triggerSync()
  }

  async function discardMutation(id: string) {
    const res = await localWorker.discardFailedMutation(id)
    await syncEngine.refreshPendingCount()
    try {
      await syncEngine.reconcileFromCloud()
    }
    catch {
      // needs_reconcile flag stays persisted in SQLite sync_state so the next sync cycle finishes reconciling
    }
    return res
  }

  return {
    syncStatus: readonly(globalSyncStatus),
    pendingOutboxCount: readonly(globalPendingOutboxCount),
    failedCount: readonly(globalFailedOutboxCount),
    needsReconcile: readonly(globalNeedsReconcile),
    lastSyncedAt: readonly(globalLastSyncedAt),
    lastRemoteUpdateAt: readonly(globalLastRemoteUpdateAt),
    lastError: readonly(globalLastError),
    conflictsModalOpen: globalConflictsModalOpen,
    isSyncing: computed(() => globalSyncStatus.value === 'syncing'),
    triggerSync,
    syncNow: triggerSync,
    openConflictsModal,
    closeConflictsModal,
    getFailedMutations,
    retryMutation,
    retryAllMutations,
    discardMutation,
    syncEngine,
  }
}
