import { computed, ref } from 'vue'
import type { LocalDataSummary } from '#shared/types/api'

interface GuardState {
  open: boolean
  summary: LocalDataSummary | null
  confirming: boolean
  errorMessage: string | null
  resolve: ((outcome: 'replaced' | 'cancelled') => void) | null
  onConfirmReplace: (() => Promise<void>) | null
}

const guardState = ref<GuardState>({
  open: false,
  summary: null,
  confirming: false,
  errorMessage: null,
  resolve: null,
  onConfirmReplace: null,
})

export function formatLocalDataSummaryItems(summary: LocalDataSummary | null): string[] {
  if (!summary) return []
  const items: string[] = []
  if (summary.productionDays > 0) {
    items.push(`${summary.productionDays} production day${summary.productionDays === 1 ? '' : 's'}`)
  }
  if (summary.sales > 0) {
    items.push(`${summary.sales} sale${summary.sales === 1 ? '' : 's'}`)
  }
  if (summary.orders > 0) {
    items.push(`${summary.orders} order${summary.orders === 1 ? '' : 's'}`)
  }
  if (summary.clients > 0) {
    items.push(`${summary.clients} client${summary.clients === 1 ? '' : 's'}`)
  }
  if (summary.customSizesCount > 0) {
    items.push(`${summary.customSizesCount} custom size${summary.customSizesCount === 1 ? '' : 's'}`)
  }
  const unsynced = summary.pendingOutboxCount + summary.failedOutboxCount
  if (unsynced > 0) {
    items.push(`${unsynced} unsynced change${unsynced === 1 ? '' : 's'}`)
  }
  return items
}

export async function confirmOrHydrateCloudFarm(params: {
  getSummary: () => Promise<LocalDataSummary>
  hydrateCloud: () => Promise<void>
  requestConfirmation: (summary: LocalDataSummary, onConfirm: () => Promise<void>) => Promise<'replaced' | 'cancelled'>
  onCancel?: () => Promise<void>
  targetUid?: string | null
}): Promise<{ status: 'hydrated' | 'cancelled', replacedOtherAccount?: boolean }> {
  const summary = await params.getSummary()
  if (!summary.hasData) {
    await params.hydrateCloud()
    return { status: 'hydrated' }
  }

  // Never offer backup or retention of a different authenticated account's local OPFS data
  if (summary.ownerUid && params.targetUid && summary.ownerUid !== params.targetUid) {
    await params.hydrateCloud()
    return { status: 'hydrated', replacedOtherAccount: true }
  }

  const outcome = await params.requestConfirmation(summary, params.hydrateCloud)
  if (outcome === 'cancelled') {
    await params.onCancel?.()
    return { status: 'cancelled' }
  }

  return { status: 'hydrated' }
}

export function useLocalReplaceGuard() {
  function requestLocalReplaceConfirmation(
    summary: LocalDataSummary,
    onConfirmReplace: () => Promise<void>,
  ): Promise<'replaced' | 'cancelled'> {
    if (guardState.value.resolve) {
      guardState.value.resolve('cancelled')
    }

    return new Promise((resolve) => {
      guardState.value = {
        open: true,
        summary,
        confirming: false,
        errorMessage: null,
        resolve,
        onConfirmReplace,
      }
    })
  }

  async function confirmReplace(): Promise<void> {
    if (!guardState.value.onConfirmReplace || guardState.value.confirming) return
    guardState.value.confirming = true
    guardState.value.errorMessage = null
    try {
      await guardState.value.onConfirmReplace()
      const resolve = guardState.value.resolve
      guardState.value.open = false
      guardState.value.resolve = null
      guardState.value.onConfirmReplace = null
      resolve?.('replaced')
    }
    catch (err: unknown) {
      const e = err as { data?: { message?: string }, message?: string }
      guardState.value.errorMessage = e?.data?.message || e?.message || 'Failed to load cloud farm data. Please check your connection and try again.'
    }
    finally {
      guardState.value.confirming = false
    }
  }

  function cancelReplace(): void {
    if (guardState.value.confirming) return
    const resolve = guardState.value.resolve
    guardState.value.open = false
    guardState.value.resolve = null
    guardState.value.onConfirmReplace = null
    guardState.value.errorMessage = null
    resolve?.('cancelled')
  }

  return {
    guardState,
    summaryItems: computed(() => formatLocalDataSummaryItems(guardState.value.summary)),
    requestLocalReplaceConfirmation,
    confirmReplace,
    cancelReplace,
  }
}
