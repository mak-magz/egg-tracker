import { describe, expect, it } from 'vitest'
import { FetchError } from 'ofetch'
import { mapProductionError } from '../../app/utils/production-errors'

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

describe('mapProductionError', () => {
  it('maps no response to network (AC13)', () => {
    expect(mapProductionError(fetchError())).toEqual({ kind: 'network' })
    expect(mapProductionError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' })
    expect(mapProductionError(fetchError(503))).toEqual({ kind: 'network' })
  })

  it('maps a client timeout on a hung write to network (QA N4)', async () => {
    const { createServer } = await import('node:http')
    const { $fetch } = await import('ofetch')
    const server = createServer(() => { /* never responds */ })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    try {
      const err = await $fetch(`http://127.0.0.1:${port}/api/production/entries`, { method: 'POST', body: {}, timeout: 50, retry: 0 })
        .then(() => null, (e: unknown) => e)
      expect(mapProductionError(err)).toEqual({ kind: 'network' })
    }
    finally {
      server.closeAllConnections()
      server.close()
    }
  })

  it('maps 404 to not_found', () => {
    expect(mapProductionError(fetchError(404, { data: { code: 'not_found' } }))).toEqual({ kind: 'not_found' })
  })

  it('maps 400 with a sizes field to stale_sizes', () => {
    const e = fetchError(400, { data: { code: 'validation_failed', fields: { sizes: 'Your sizes have changed.' } } })
    expect(mapProductionError(e).kind).toBe('stale_sizes')
  })

  it('maps other 400s to validation with the fields', () => {
    const e = fetchError(400, { data: { code: 'validation_failed', fields: { date: 'Pick a date.' } } })
    expect(mapProductionError(e)).toEqual({ kind: 'validation', fields: { date: 'Pick a date.' } })
    expect(mapProductionError(fetchError(400))).toEqual({ kind: 'validation', fields: {} })
  })

  it('maps anything else to unknown', () => {
    expect(mapProductionError(fetchError(500, { data: { code: 'internal' } }))).toEqual({ kind: 'unknown' })
    expect(mapProductionError('boom')).toEqual({ kind: 'unknown' })
  })
})
