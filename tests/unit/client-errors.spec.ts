import { describe, expect, it } from 'vitest'
import { FetchError } from 'ofetch'
import { mapClientError } from '../../app/utils/client-errors'
import type { Client } from '../../shared/types/api'

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

const client: Client = { id: 'c1', name: 'Maple Street Market', phone: null, defaultPrice: 6.5, active: true, version: 3 }

describe('mapClientError', () => {
  it('maps no response, a gateway error and a bare TypeError to network (AC16)', () => {
    expect(mapClientError(fetchError())).toEqual({ kind: 'network' })
    expect(mapClientError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' })
    expect(mapClientError(fetchError(502))).toEqual({ kind: 'network' })
    expect(mapClientError(fetchError(503))).toEqual({ kind: 'network' })
    expect(mapClientError(fetchError(504))).toEqual({ kind: 'network' })
  })

  it('maps a 400 to invalid with the server field messages', () => {
    const fields = { name: 'Enter a name.', defaultPrice: 'Use 2 decimals at most, like 6.50.' }
    expect(mapClientError(fetchError(400, { data: { code: 'validation_failed', fields } }))).toEqual({ kind: 'invalid', fields })
  })

  it('maps a 400 with no body to invalid with no fields', () => {
    expect(mapClientError(fetchError(400))).toEqual({ kind: 'invalid', fields: {} })
  })

  it('maps a bad id or version to changed (the client the form was opened on is out of date)', () => {
    expect(mapClientError(fetchError(400, { data: { code: 'validation_failed', fields: { version: 'x' } } }))).toEqual({ kind: 'changed' })
    expect(mapClientError(fetchError(400, { data: { code: 'validation_failed', fields: { id: 'x' } } }))).toEqual({ kind: 'changed' })
  })

  it('maps 409 name_taken with the existing client (inactive or not) and the server message', () => {
    const existing = { id: 'o', name: 'Oakhill Bakery', archived: true }
    const fields = { name: 'That name already exists.' }
    const out = mapClientError(fetchError(409, { data: { code: 'conflict', reason: 'name_taken', existing, fields } }))
    expect(out).toEqual({ kind: 'name_taken', existing, fields })
  })

  it('maps 409 name_taken with no existing row (the server lookup failed) without inventing one', () => {
    const out = mapClientError(fetchError(409, { data: { code: 'conflict', reason: 'name_taken' } }))
    expect(out).toEqual({ kind: 'name_taken' })
    expect('existing' in out).toBe(false)
  })

  it('maps 409 client_limit to limit (AC33)', () => {
    expect(mapClientError(fetchError(409, { data: { code: 'conflict', reason: 'client_limit' } }))).toEqual({ kind: 'limit' })
  })

  it('maps 409 client_changed to changed, carrying the current client when the server sent it (AC19)', () => {
    expect(mapClientError(fetchError(409, { data: { code: 'conflict', reason: 'client_changed', client } }))).toEqual({ kind: 'changed', client })
    expect(mapClientError(fetchError(409, { data: { code: 'conflict', reason: 'client_changed' } }))).toEqual({ kind: 'changed' })
  })

  it('maps any 404 to not_found, and an unknown 409 or 500 to unknown', () => {
    expect(mapClientError(fetchError(404, { data: { code: 'not_found' } }))).toEqual({ kind: 'not_found' })
    expect(mapClientError(fetchError(409, { data: { code: 'conflict', reason: 'sizes_changed' } }))).toEqual({ kind: 'unknown' })
    expect(mapClientError(fetchError(409))).toEqual({ kind: 'unknown' })
    expect(mapClientError(fetchError(500, { data: { code: 'internal' } }))).toEqual({ kind: 'unknown' })
    expect(mapClientError('boom')).toEqual({ kind: 'unknown' })
  })
})
