/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getLocalDeviceId } from '../../app/utils/device'

describe('getLocalDeviceId', () => {
  const originalLocalStorage = globalThis.localStorage
  const originalWindow = (globalThis as any).window

  beforeEach(() => {
    (globalThis as any).window = globalThis
    const store = new Map<string, string>()
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    (globalThis as any).window = originalWindow
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('generates a new device ID prefixed with D- when storage is empty', () => {
    const id = getLocalDeviceId()
    expect(id).toMatch(/^D-[A-Z0-9]{4}$/)
    expect(globalThis.localStorage.getItem('tamago_device_id')).toBe(id)
  })

  it('reuses the existing device ID from localStorage', () => {
    globalThis.localStorage.setItem('tamago_device_id', 'D-TEST')
    const id = getLocalDeviceId()
    expect(id).toBe('D-TEST')
  })
})
