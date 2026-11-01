import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'

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

describe('toCloneable helper', () => {
  it('handles primitive values', () => {
    expect(toCloneable('hello')).toBe('hello')
    expect(toCloneable(123)).toBe(123)
    expect(toCloneable(true)).toBe(true)
    expect(toCloneable(null)).toBe(null)
    expect(toCloneable(undefined)).toBe(undefined)
  })

  it('unwraps Vue reactive proxy objects into plain cloneable objects', () => {
    const reactiveState = reactive({
      farmName: 'Pastures Green',
      eggsPerTray: 30,
      currency: 'PHP',
    })

    const cloneable = toCloneable(reactiveState)
    // Verify structuredClone succeeds
    expect(() => structuredClone(cloneable)).not.toThrow()
    expect(cloneable).toEqual({
      farmName: 'Pastures Green',
      eggsPerTray: 30,
      currency: 'PHP',
    })
  })

  it('unwraps Vue ref objects when nested', () => {
    const form = reactive({
      title: ref('My Farm'),
      count: 24,
    })

    const cloneable = toCloneable(form)
    expect(() => structuredClone(cloneable)).not.toThrow()
    expect(cloneable).toEqual({
      title: 'My Farm',
      count: 24,
    })
  })
})
