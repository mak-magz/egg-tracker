import { describe, expect, it } from 'vitest'
import { FetchError } from 'ofetch'
import { mapSizeError } from '../../app/utils/size-errors'
import type { FarmSize } from '../../shared/types/api'

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

const sizes: FarmSize[] = [{ id: 's', name: 'Small', sortOrder: 0, colorSlot: 0, active: true }]

describe('mapSizeError', () => {
  it('maps no response, a gateway error and a bare TypeError to network (AC19)', () => {
    expect(mapSizeError(fetchError())).toEqual({ kind: 'network' })
    expect(mapSizeError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' })
    expect(mapSizeError(fetchError(502))).toEqual({ kind: 'network' })
    expect(mapSizeError(fetchError(503))).toEqual({ kind: 'network' })
    expect(mapSizeError(fetchError(504))).toEqual({ kind: 'network' })
  })

  it('maps a 400 on the name to name_invalid with the server message', () => {
    const e = fetchError(400, { data: { code: 'validation_failed', fields: { name: 'Use 40 characters or fewer.' } } })
    expect(mapSizeError(e)).toEqual({ kind: 'name_invalid', fields: { name: 'Use 40 characters or fewer.' }, message: 'Use 40 characters or fewer.' })
  })

  it('maps 409 name_taken with the existing size (archived or not)', () => {
    const existing = { id: 'j', name: 'Jumbo', archived: true }
    const e = fetchError(409, { data: { code: 'conflict', reason: 'name_taken', existing, fields: { name: 'Jumbo is archived. Restore it instead.' } } })
    const out = mapSizeError(e)
    expect(out.kind).toBe('name_taken')
    expect(out.existing).toEqual(existing)
    expect(out.message).toBe('Jumbo is archived. Restore it instead.')
  })

  it('maps 409 name_taken without a parsed existing size to name_taken with no existing', () => {
    const out = mapSizeError(fetchError(409, { data: { code: 'conflict', reason: 'name_taken', fields: { name: 'Taken.' } } }))
    expect(out.kind).toBe('name_taken')
    expect(out.existing).toBeUndefined()
  })

  it('maps 409 last_active_size and carries the current list', () => {
    const out = mapSizeError(fetchError(409, { data: { code: 'conflict', reason: 'last_active_size', sizes } }))
    expect(out).toEqual({ kind: 'last_active', sizes })
  })

  it('maps 409 sizes_changed to stale, with or without the list (AC20)', () => {
    expect(mapSizeError(fetchError(409, { data: { code: 'conflict', reason: 'sizes_changed', sizes } }))).toEqual({ kind: 'stale', sizes })
    expect(mapSizeError(fetchError(409, { data: { code: 'conflict', reason: 'sizes_changed' } }))).toEqual({ kind: 'stale' })
  })

  it('maps every 404 to stale (the size is gone: the list changed elsewhere)', () => {
    expect(mapSizeError(fetchError(404, { data: { code: 'not_found', sizes } }))).toEqual({ kind: 'stale', sizes })
    expect(mapSizeError(fetchError(404))).toEqual({ kind: 'stale' })
  })

  it('maps a 400 on order or id (a bad list) to stale', () => {
    expect(mapSizeError(fetchError(400, { data: { code: 'validation_failed', fields: { order: 'Your sizes were changed somewhere else.' } } })).kind).toBe('stale')
    expect(mapSizeError(fetchError(400, { data: { code: 'validation_failed', fields: { id: 'x' } } })).kind).toBe('stale')
  })

  it('maps other 400s, an unknown 409 and 500s to unknown', () => {
    expect(mapSizeError(fetchError(400, { data: { code: 'validation_failed', fields: { submissionId: 'x' } } })).kind).toBe('unknown')
    expect(mapSizeError(fetchError(400)).kind).toBe('unknown')
    expect(mapSizeError(fetchError(409, { data: { code: 'conflict' } })).kind).toBe('unknown')
    expect(mapSizeError(fetchError(500, { data: { code: 'internal' } })).kind).toBe('unknown')
    expect(mapSizeError('boom').kind).toBe('unknown')
    expect(mapSizeError(null).kind).toBe('unknown')
  })

  it('ignores a malformed sizes value', () => {
    expect(mapSizeError(fetchError(409, { data: { code: 'conflict', reason: 'sizes_changed', sizes: 'no' } }))).toEqual({ kind: 'stale' })
  })
})
