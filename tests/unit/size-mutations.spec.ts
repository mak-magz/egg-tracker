import { describe, expect, it, vi } from 'vitest'
import { FetchError } from 'ofetch'
import {
  SIZE_WRITE_TIMEOUT_MS,
  createSizeMutations,
  createSubmissionTracker,
  fetchSizes,
} from '../../app/utils/size-mutations'
import type { SizeApi } from '../../app/utils/size-mutations'
import type { FarmSize } from '../../shared/types/api'

const size = (id: string, name: string, sortOrder: number, active = true): FarmSize =>
  ({ id, name, sortOrder, colorSlot: sortOrder, active })

const LIST = [size('s', 'Small', 0), size('m', 'Medium', 1)]

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

/** A stubbed `$api` whose calls we settle by hand. */
function deferredApi() {
  const calls: { url: string, opts: Parameters<SizeApi>[1], resolve: (v: unknown) => void, reject: (e: unknown) => void }[] = []
  const api = ((url: string, opts?: Parameters<SizeApi>[1]) => new Promise((resolve, reject) => {
    calls.push({ url, opts, resolve, reject })
  })) as SizeApi
  return { api, calls }
}

function build(api: SizeApi, ids: string[] = ['id-1', 'id-2', 'id-3']) {
  const applySizes = vi.fn()
  const refresh = vi.fn(async () => 'ok' as const)
  let n = 0
  const mutations = createSizeMutations({ api, applySizes, refresh, newId: () => ids[n++] ?? `id-extra-${n}` })
  return { mutations, applySizes, refresh }
}

describe('createSubmissionTracker (add retry rule)', () => {
  it('reuses the id for a retry of the same normalised name and replaces it when the name changes', () => {
    let n = 0
    const t = createSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor('Peewee')
    expect(t.idFor('  Peewee ')).toBe(first) // same normalised name: a retry
    expect(t.idFor('Peewee')).toBe(first)
    const second = t.idFor('Peewee 2')
    expect(second).not.toBe(first)
    expect(t.idFor('Peewee 2')).toBe(second)
    // Going back to the first name is a new intent too.
    expect(t.idFor('Peewee')).not.toBe(first)
  })

  it('gets a fresh id when the form is opened again', () => {
    let n = 0
    const t = createSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor('Peewee')
    t.reset()
    expect(t.idFor('Peewee')).not.toBe(first)
  })
})

describe('createSizeMutations', () => {
  it('add: POSTs the name with a submission id, applies the returned list, and resolves ok', async () => {
    const { api, calls } = deferredApi()
    const { mutations, applySizes } = build(api)
    const p = mutations.add('Peewee')
    expect(mutations.pending.value).toEqual({ action: 'add', sizeId: null })
    expect(calls[0]).toMatchObject({ url: '/api/sizes', opts: { method: 'POST', body: { submissionId: 'id-1', name: 'Peewee' }, timeout: SIZE_WRITE_TIMEOUT_MS } })
    calls[0]!.resolve({ sizes: LIST, changedId: 'm' })
    expect(await p).toEqual({ ok: true, data: { sizes: LIST, changedId: 'm' } })
    expect(applySizes).toHaveBeenCalledWith(LIST)
    expect(mutations.pending.value).toBeNull()
  })

  it('a double tap sends one request: a call made while one is running resolves to null (AC18)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.add('Peewee')
    expect(await mutations.add('Peewee')).toBeNull()
    expect(await mutations.move('s', ['m', 's'])).toBeNull()
    expect(calls).toHaveLength(1)
    calls[0]!.resolve({ sizes: LIST, changedId: 'm' })
    await first
    // Free again afterwards.
    const next = mutations.archive('m')
    expect(calls).toHaveLength(2)
    calls[1]!.resolve({ sizes: LIST, changedId: 'm' })
    await next
  })

  it('a retry of the same add after a failure reuses the submission id; a changed name gets a new one', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const a = mutations.add('Peewee')
    calls[0]!.reject(fetchError())
    expect(await a).toEqual({ ok: false, error: { kind: 'network' } })
    const b = mutations.add('Peewee')
    calls[1]!.reject(fetchError(503))
    await b
    const c = mutations.add('Peewee X')
    calls[2]!.reject(fetchError())
    await c
    expect((calls[0]!.opts!.body as { submissionId: string }).submissionId).toBe('id-1')
    expect((calls[1]!.opts!.body as { submissionId: string }).submissionId).toBe('id-1')
    expect((calls[2]!.opts!.body as { submissionId: string }).submissionId).toBe('id-2')
    // Closing and reopening the form: new id.
    mutations.resetAdd()
    const d = mutations.add('Peewee X')
    calls[3]!.reject(fetchError())
    await d
    expect((calls[3]!.opts!.body as { submissionId: string }).submissionId).toBe('id-3')
  })

  it('rename, move, archive and restore hit the contract routes', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const reply = { sizes: LIST, changedId: 's' }
    const run = async (start: () => Promise<unknown>, i: number) => {
      const p = start()
      calls[i]!.resolve(reply)
      await p
    }
    await run(() => mutations.rename('s', 'Tiny'), 0)
    await run(() => mutations.move('s', ['m', 's']), 1)
    await run(() => mutations.archive('s'), 2)
    await run(() => mutations.restore('s'), 3)
    expect(calls.map(c => [c.opts!.method, c.url])).toEqual([
      ['PATCH', '/api/sizes/s'],
      ['PUT', '/api/sizes/order'],
      ['POST', '/api/sizes/s/archive'],
      ['POST', '/api/sizes/s/restore'],
    ])
    expect(calls[0]!.opts!.body).toEqual({ name: 'Tiny' })
    expect(calls[1]!.opts!.body).toEqual({ sizeId: 's', order: ['m', 's'] })
    expect(calls[2]!.opts!.body).toBeUndefined()
  })

  it('never sends a tenant id, a colour or a step, and encodes the size id in the path', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const p = mutations.rename('a/b', 'X')
    expect(calls[0]!.url).toBe('/api/sizes/a%2Fb')
    calls[0]!.resolve({ sizes: LIST, changedId: 's' })
    await p
    expect(JSON.stringify(calls[0]!.opts)).not.toMatch(/tenant|color|step/i)
  })

  it('a failed write changes nothing: no list is applied, and the error is mapped', async () => {
    const { api, calls } = deferredApi()
    const { mutations, applySizes, refresh } = build(api)
    const p = mutations.move('s', ['m', 's'])
    calls[0]!.reject(fetchError(500, { data: { code: 'internal' } }))
    expect(await p).toEqual({ ok: false, error: { kind: 'unknown' } })
    expect(applySizes).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(mutations.pending.value).toBeNull()
  })

  it('a conflict reply with the list applies it (AC20) and does not refresh again', async () => {
    const { api, calls } = deferredApi()
    const { mutations, applySizes, refresh } = build(api)
    const p = mutations.rename('s', 'X')
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'sizes_changed', sizes: LIST } }))
    const res = await p
    expect(res).toMatchObject({ ok: false, error: { kind: 'stale' } })
    expect(applySizes).toHaveBeenCalledWith(LIST)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('a stale or last-size refusal without a list refreshes on its own', async () => {
    const { api, calls } = deferredApi()
    const { mutations, applySizes, refresh } = build(api)
    const p = mutations.archive('s')
    calls[0]!.reject(fetchError(404, { data: { code: 'not_found' } }))
    await p
    expect(refresh).toHaveBeenCalledTimes(1)
    const q = mutations.archive('s')
    calls[1]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'last_active_size' } }))
    expect(await q).toMatchObject({ ok: false, error: { kind: 'last_active' } })
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(applySizes).not.toHaveBeenCalled()
  })

  it('a failed refresh after a conflict still resolves (never throws)', async () => {
    const { api, calls } = deferredApi()
    const applySizes = vi.fn()
    const mutations = createSizeMutations({ api, applySizes, refresh: () => Promise.reject(new Error('down')) })
    const p = mutations.restore('s')
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'sizes_changed' } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'stale' } })
  })

  it('a name clash is returned to the form (with the existing size) and quietly refreshes the list', async () => {
    const { api, calls } = deferredApi()
    const { mutations, refresh } = build(api)
    const p = mutations.add('jumbo')
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'name_taken', existing: { id: 'j', name: 'Jumbo', archived: true }, fields: { name: 'x' } } }))
    const res = await p
    expect(res).toMatchObject({ ok: false, error: { kind: 'name_taken', existing: { id: 'j', archived: true } } })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a name clash does not wait for the refresh, and a failed refresh is swallowed', async () => {
    const { api, calls } = deferredApi()
    const applySizes = vi.fn()
    const refresh = vi.fn(() => new Promise<never>(() => undefined)) // never settles
    const mutations = createSizeMutations({ api, applySizes, refresh })
    const p = mutations.rename('s', 'Jumbo')
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'name_taken', fields: { name: 'x' } } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'name_taken' } })
    expect(refresh).toHaveBeenCalledTimes(1)

    const failing = createSizeMutations({ api, applySizes, refresh: () => Promise.reject(new Error('down')) })
    const q = failing.rename('s', 'Jumbo')
    calls[1]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'name_taken', fields: { name: 'x' } } }))
    expect(await q).toMatchObject({ ok: false, error: { kind: 'name_taken' } })
  })
})

describe('fetchSizes (the quiet refresh)', () => {
  it('applies the list and resolves ok', async () => {
    const apply = vi.fn()
    const api = (async () => ({ sizes: LIST })) as unknown as SizeApi
    expect(await fetchSizes(api, { apply })).toBe('ok')
    expect(apply).toHaveBeenCalledWith(LIST)
  })

  it('resolves error and applies nothing when the request fails, however it fails', async () => {
    const apply = vi.fn()
    for (const e of [fetchError(), fetchError(500), fetchError(401), new TypeError('x')]) {
      const api = (() => Promise.reject(e)) as unknown as SizeApi
      expect(await fetchSizes(api, { apply })).toBe('error')
    }
    expect(apply).not.toHaveBeenCalled()
  })

  it('resolves error for a malformed reply', async () => {
    const apply = vi.fn()
    expect(await fetchSizes((async () => ({})) as unknown as SizeApi, { apply })).toBe('error')
    expect(await fetchSizes((async () => null) as unknown as SizeApi, { apply })).toBe('error')
    expect(apply).not.toHaveBeenCalled()
  })

  it('drops a reply that arrives after a newer list was applied', async () => {
    const apply = vi.fn()
    let version = 0
    const started = version
    const { api, calls } = deferredApi()
    const p = fetchSizes(api, { apply, superseded: () => version !== started })
    version++ // a change on this screen applied its own list meanwhile
    calls[0]!.resolve({ sizes: LIST })
    expect(await p).toBe('ok')
    expect(apply).not.toHaveBeenCalled()
  })

  it('reads GET /api/sizes with the write timeout', async () => {
    const { api, calls } = deferredApi()
    const p = fetchSizes(api, { apply: () => undefined })
    expect(calls[0]).toMatchObject({ url: '/api/sizes', opts: { timeout: SIZE_WRITE_TIMEOUT_MS } })
    expect(calls[0]!.opts!.method).toBeUndefined()
    calls[0]!.resolve({ sizes: LIST })
    await p
  })
})
