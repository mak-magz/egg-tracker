import { describe, expect, it } from 'vitest'
import { createError } from 'h3'
import { apiError, isApiError, toApiError } from '../../server/utils/errors'
import type { FarmSize } from '../../shared/types/api'

const SIZES: FarmSize[] = [{ id: 'a', name: 'Small', sortOrder: 0, colorSlot: 0, active: true }]

describe('apiError', () => {
  it('builds a plain error with just the code', () => {
    const e = apiError(404, 'not_found')
    expect(e.statusCode).toBe(404)
    expect(e.statusMessage).toBe('Not Found')
    expect(e.data).toEqual({ code: 'not_found' })
  })

  it('keeps fields', () => {
    expect(apiError(400, 'validation_failed', { name: 'x' }).data).toEqual({ code: 'validation_failed', fields: { name: 'x' } })
  })

  it('has a 409 conflict with the "Conflict" status message', () => {
    const e = apiError(409, 'conflict', undefined, { reason: 'last_active_size' })
    expect(e.statusCode).toBe(409)
    expect(e.statusMessage).toBe('Conflict')
    expect(e.data).toEqual({ code: 'conflict', reason: 'last_active_size' })
  })

  it('carries reason, existing and sizes when given, and only those', () => {
    const existing = { id: 'j', name: 'Jumbo', archived: true }
    expect(apiError(409, 'conflict', { name: 'Jumbo is archived. Restore it instead.' }, { reason: 'name_taken', existing }).data).toEqual({
      code: 'conflict',
      fields: { name: 'Jumbo is archived. Restore it instead.' },
      reason: 'name_taken',
      existing,
    })
    const withSizes = apiError(409, 'conflict', undefined, { reason: 'sizes_changed', sizes: SIZES }).data!
    expect(withSizes.sizes).toEqual(SIZES)
    expect(Object.keys(withSizes).sort()).toEqual(['code', 'reason', 'sizes'])
  })

  it('leaves out extras that are undefined (the sizes read failed)', () => {
    const data = apiError(409, 'conflict', undefined, { reason: 'sizes_changed', sizes: undefined }).data!
    expect(Object.keys(data)).toEqual(['code', 'reason'])
  })

  it('carries sizes on a 404', () => {
    expect(apiError(404, 'not_found', undefined, { sizes: SIZES }).data).toEqual({ code: 'not_found', sizes: SIZES })
  })
})

describe('isApiError / toApiError with conflict', () => {
  it('recognises a conflict error and passes it through unchanged', () => {
    const e = apiError(409, 'conflict', undefined, { reason: 'sizes_changed' })
    expect(isApiError(e)).toBe(true)
    expect(toApiError(e)).toBe(e)
  })

  it('does not treat an unknown code as ours', () => {
    expect(isApiError(createError({ statusCode: 409, data: { code: 'nope' } }))).toBe(false)
  })
})
