import { describe, expect, it } from 'vitest'
import { onboardingSchema } from '../../shared/schemas/onboarding'

describe('onboardingSchema', () => {
  it('accepts valid onboarding input', () => {
    const valid = {
      farmName: 'Sunrise Pastures',
      eggsPerTray: 30,
      currency: 'PHP',
    }
    const result = onboardingSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.farmName).toBe('Sunrise Pastures')
      expect(result.data.eggsPerTray).toBe(30)
      expect(result.data.currency).toBe('PHP')
    }
  })

  it('applies defaults when eggsPerTray and currency are omitted', () => {
    const partial = {
      farmName: 'My Farm',
    }
    const result = onboardingSchema.safeParse(partial)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.eggsPerTray).toBe(30)
      expect(result.data.currency).toBe('PHP')
    }
  })

  it('rejects empty or whitespace-only farmName', () => {
    const invalid = { farmName: '   ' }
    const result = onboardingSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects farmName exceeding 100 characters', () => {
    const invalid = { farmName: 'a'.repeat(101) }
    const result = onboardingSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('rejects invalid eggsPerTray values (0 or negative or > 100)', () => {
    expect(onboardingSchema.safeParse({ farmName: 'Farm', eggsPerTray: 0 }).success).toBe(false)
    expect(onboardingSchema.safeParse({ farmName: 'Farm', eggsPerTray: -5 }).success).toBe(false)
    expect(onboardingSchema.safeParse({ farmName: 'Farm', eggsPerTray: 101 }).success).toBe(false)
    expect(onboardingSchema.safeParse({ farmName: 'Farm', eggsPerTray: 3.5 }).success).toBe(false)
  })

  it('rejects currencies that are not 3 letters', () => {
    expect(onboardingSchema.safeParse({ farmName: 'Farm', currency: 'US' }).success).toBe(false)
    expect(onboardingSchema.safeParse({ farmName: 'Farm', currency: 'USDT' }).success).toBe(false)
    expect(onboardingSchema.safeParse({ farmName: 'Farm', currency: 'USD' }).success).toBe(true)
  })
})
