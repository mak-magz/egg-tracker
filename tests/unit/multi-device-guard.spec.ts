import { describe, expect, it, vi } from 'vitest'
import {
  confirmOrHydrateCloudFarm,
  formatLocalDataSummaryItems,
  useLocalReplaceGuard,
} from '../../app/composables/useLocalReplaceGuard'
import type { LocalDataSummary } from '../../shared/types/api'

const PRISTINE_SUMMARY: LocalDataSummary = {
  hasData: false,
  productionDays: 0,
  clients: 0,
  orders: 0,
  sales: 0,
  customSizesCount: 0,
  pendingOutboxCount: 0,
  failedOutboxCount: 0,
  farmName: 'My Farm',
}

const DIRTY_SUMMARY: LocalDataSummary = {
  hasData: true,
  productionDays: 3,
  clients: 1,
  orders: 0,
  sales: 4,
  customSizesCount: 0,
  pendingOutboxCount: 2,
  failedOutboxCount: 1,
  farmName: 'Offline Farm',
}

describe('Multi-Device Sign-In Confirmation Guard', () => {
  it('formats human-readable local data summary chips', () => {
    const items = formatLocalDataSummaryItems(DIRTY_SUMMARY)
    expect(items).toEqual([
      '3 production days',
      '4 sales',
      '1 client',
      '3 unsynced changes',
    ])
  })

  it('bypasses confirmation modal on pristine device and hydrates immediately', async () => {
    const hydrateCloud = vi.fn().mockResolvedValue(undefined)
    const requestConfirmation = vi.fn()
    const onCancel = vi.fn()

    const outcome = await confirmOrHydrateCloudFarm({
      getSummary: async () => PRISTINE_SUMMARY,
      hydrateCloud,
      requestConfirmation,
      onCancel,
    })

    expect(outcome.status).toBe('hydrated')
    expect(hydrateCloud).toHaveBeenCalledTimes(1)
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('pauses hydration on non-pristine device and preserves local data if cancelled', async () => {
    const hydrateCloud = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn().mockResolvedValue(undefined)
    const { guardState, requestLocalReplaceConfirmation, cancelReplace } = useLocalReplaceGuard()

    const flowPromise = confirmOrHydrateCloudFarm({
      getSummary: async () => DIRTY_SUMMARY,
      hydrateCloud,
      requestConfirmation: requestLocalReplaceConfirmation,
      onCancel,
    })

    // Allow promise microtask to open guard dialog
    await Promise.resolve()
    expect(guardState.value.open).toBe(true)
    expect(hydrateCloud).not.toHaveBeenCalled()

    cancelReplace()
    const outcome = await flowPromise

    expect(outcome.status).toBe('cancelled')
    expect(hydrateCloud).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(guardState.value.open).toBe(false)
  })

  it('hydrates cloud snapshot only after explicit replace confirmation and surfaces errors inside dialog', async () => {
    const hydrateCloud = vi.fn()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(undefined)
    const { guardState, requestLocalReplaceConfirmation, confirmReplace, cancelReplace } = useLocalReplaceGuard()

    const flowPromise = confirmOrHydrateCloudFarm({
      getSummary: async () => DIRTY_SUMMARY,
      hydrateCloud,
      requestConfirmation: requestLocalReplaceConfirmation,
    })

    await Promise.resolve()
    expect(guardState.value.open).toBe(true)

    // First attempt fails -> modal stays open with error message so user can retry or cancel
    await confirmReplace()
    expect(guardState.value.open).toBe(true)
    expect(guardState.value.errorMessage).toContain('Network down')

    // Second attempt succeeds -> resolves hydrated and closes modal
    await confirmReplace()
    const outcome = await flowPromise
    expect(outcome.status).toBe('hydrated')
    expect(guardState.value.open).toBe(false)
    cancelReplace()
  })

  it('bypasses confirmation and overwrites without backup prompt when local OPFS belongs to another authenticated account', async () => {
    const hydrateCloud = vi.fn().mockResolvedValue(undefined)
    const requestConfirmation = vi.fn()
    const onCancel = vi.fn()

    const outcome = await confirmOrHydrateCloudFarm({
      getSummary: async () => ({ ...DIRTY_SUMMARY, ownerUid: 'uid-user-a' }),
      hydrateCloud,
      requestConfirmation,
      onCancel,
      targetUid: 'uid-user-b',
    })

    expect(outcome.status).toBe('hydrated')
    expect(outcome.replacedOtherAccount).toBe(true)
    expect(hydrateCloud).toHaveBeenCalledTimes(1)
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
