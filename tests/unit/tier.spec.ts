/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, readonly, ref } from 'vue'
import { useTier } from '../../app/composables/useTier'

const cookieState = ref<string>('free')

// Provide Nuxt auto-imports in Vitest
;(globalThis as any).useCookie = (_name: string, _opts?: any) => cookieState
;(globalThis as any).computed = computed
;(globalThis as any).readonly = readonly
;(globalThis as any).useFirebaseAuth = () => ({
  currentUser: {
    getIdToken: vi.fn().mockResolvedValue('mock-token-xyz'),
  },
})

describe('useTier Composable (Feature 08)', () => {
  beforeEach(() => {
    cookieState.value = 'free'
  })

  it('defaults to free tier', () => {
    const { tier, isFree, isPremium } = useTier()
    expect(tier.value).toBe('free')
    expect(isFree.value).toBe(true)
    expect(isPremium.value).toBe(false)
  })

  it('returns null token for free users without querying Firebase Auth', async () => {
    const { isFree, getAuthToken } = useTier()
    expect(isFree.value).toBe(true)
    const token = await getAuthToken()
    expect(token).toBeNull()
  })

  it('switches to premium tier when upgradeToPremium() is called', () => {
    const { tier, isFree, isPremium, upgradeToPremium } = useTier()
    upgradeToPremium()
    expect(tier.value).toBe('premium')
    expect(isFree.value).toBe(false)
    expect(isPremium.value).toBe(true)
  })

  it('reverts back to free tier when revertToFree() is called', () => {
    const { tier, isFree, isPremium, upgradeToPremium, revertToFree } = useTier()
    upgradeToPremium()
    expect(isPremium.value).toBe(true)

    revertToFree()
    expect(tier.value).toBe('free')
    expect(isFree.value).toBe(true)
    expect(isPremium.value).toBe(false)
  })
})
