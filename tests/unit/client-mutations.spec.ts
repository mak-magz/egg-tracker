import { describe, expect, it, vi } from 'vitest'
import { FetchError } from 'ofetch'
import {
  CLIENT_WRITE_TIMEOUT_MS,
  createClientMutations,
  createClientSubmissionTracker,
} from '../../app/utils/client-mutations'
import type { ClientApi, ClientInput } from '../../app/utils/client-mutations'
import type { Client } from '../../shared/types/api'

const client = (id: string, name: string, version = 1, active = true): Client =>
  ({ id, name, phone: null, defaultPrice: null, active, version })

const input = (over: Partial<ClientInput> = {}): ClientInput => ({ name: 'Maple Street Market', phone: null, defaultPrice: null, ...over })

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
  const calls: { url: string, opts: Parameters<ClientApi>[1], resolve: (v: unknown) => void, reject: (e: unknown) => void }[] = []
  const api = ((url: string, opts?: Parameters<ClientApi>[1]) => new Promise((resolve, reject) => {
    calls.push({ url, opts, resolve, reject })
  })) as ClientApi
  return { api, calls }
}

function build(api: ClientApi, ids: string[] = ['id-1', 'id-2', 'id-3', 'id-4']) {
  const upsert = vi.fn()
  const reload = vi.fn(async () => 'ok' as const)
  let n = 0
  const mutations = createClientMutations({ api, upsert, reload, newId: () => ids[n++] ?? `id-extra-${n}` })
  return { mutations, upsert, reload }
}

describe('createClientSubmissionTracker (add retry rule)', () => {
  it('reuses the id for a retry of the same normalised payload and replaces it when name, phone or price changes', () => {
    let n = 0
    const t = createClientSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor(input())
    expect(t.idFor(input({ name: '  Maple   Street Market ' }))).toBe(first) // same normalised name
    expect(t.idFor(input({ phone: ' ' }))).toBe(first) // a blank phone is no phone
    const withPhone = t.idFor(input({ phone: '(555) 201-3348' }))
    expect(withPhone).not.toBe(first)
    expect(t.idFor(input({ phone: '(555) 201-3348' }))).toBe(withPhone)
    const withPrice = t.idFor(input({ phone: '(555) 201-3348', defaultPrice: 6.5 }))
    expect(withPrice).not.toBe(withPhone)
    expect(t.idFor(input({ phone: '(555) 201-3348', defaultPrice: 6.5 }))).toBe(withPrice)
    expect(t.idFor(input({ name: 'Other', phone: '(555) 201-3348', defaultPrice: 6.5 }))).not.toBe(withPrice)
  })

  it('gets a fresh id when the form is opened again', () => {
    let n = 0
    const t = createClientSubmissionTracker(() => `id-${++n}`)
    const first = t.idFor(input())
    t.reset()
    expect(t.idFor(input())).not.toBe(first)
  })
})

describe('createClientMutations: add and update (one in-flight guard)', () => {
  it('add: POSTs the fields with a submission id, upserts the returned client, and resolves ok (AC14)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.add(input({ phone: '0917 123 4567', defaultPrice: 6.5 }))
    expect(mutations.saving.value).toBe(true)
    expect(calls[0]).toMatchObject({
      url: '/api/clients',
      opts: { method: 'POST', body: { submissionId: 'id-1', name: 'Maple Street Market', phone: '0917 123 4567', defaultPrice: 6.5 }, timeout: CLIENT_WRITE_TIMEOUT_MS },
    })
    const reply = { client: client('c1', 'Maple Street Market'), replayed: false }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.client)
    expect(mutations.saving.value).toBe(false)
  })

  it('many taps send one request: a call made while one runs resolves to null (AC15)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.add(input())
    expect(await mutations.add(input())).toBeNull()
    expect(await mutations.update(client('c1', 'X'), input())).toBeNull()
    expect(calls).toHaveLength(1)
    calls[0]!.resolve({ client: client('c1', 'Maple Street Market'), replayed: false })
    await first
    // Free again afterwards.
    const next = mutations.add(input({ name: 'Other' }))
    expect(calls).toHaveLength(2)
    calls[1]!.resolve({ client: client('c2', 'Other'), replayed: false })
    await next
  })

  it('a retry of the same add after a failure reuses the submission id; a changed payload gets a new one; a reopened form too', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const a = mutations.add(input())
    calls[0]!.reject(fetchError())
    expect(await a).toEqual({ ok: false, error: { kind: 'network' } })
    const b = mutations.add(input())
    calls[1]!.reject(fetchError(503))
    await b
    const c = mutations.add(input({ defaultPrice: 6.5 }))
    calls[2]!.reject(fetchError())
    await c
    const id = (i: number) => (calls[i]!.opts!.body as { submissionId: string }).submissionId
    expect(id(0)).toBe('id-1')
    expect(id(1)).toBe('id-1')
    expect(id(2)).toBe('id-2')
    mutations.resetAdd()
    const d = mutations.add(input({ defaultPrice: 6.5 }))
    calls[3]!.reject(fetchError())
    await d
    expect(id(3)).toBe('id-3')
  })

  it('update: PUTs the three fields with the version the form was opened with, and upserts the reply', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.update(client('a/b', 'Old', 4), input({ name: 'New', phone: null, defaultPrice: null }))
    expect(calls[0]).toMatchObject({
      url: '/api/clients/a%2Fb',
      opts: { method: 'PUT', body: { version: 4, name: 'New', phone: null, defaultPrice: null }, timeout: CLIENT_WRITE_TIMEOUT_MS },
    })
    const reply = { client: client('a/b', 'New', 5), changed: true }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.client)
  })

  it('never sends a tenant id, a status or a timestamp', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const a = mutations.add(input({ phone: '1', defaultPrice: 1 }))
    calls[0]!.reject(fetchError())
    await a
    const u = mutations.update(client('c', 'X'), input())
    calls[1]!.reject(fetchError())
    await u
    expect(calls).toHaveLength(2)
    expect(JSON.stringify(calls.map(c => c.opts))).not.toMatch(/tenant|active|archived|created|updated/i)
  })

  it('a failed write changes nothing: no client is upserted, and the error is mapped', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const p = mutations.update(client('c', 'X'), input())
    calls[0]!.reject(fetchError(500, { data: { code: 'internal' } }))
    expect(await p).toEqual({ ok: false, error: { kind: 'unknown' } })
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(mutations.saving.value).toBe(false)
  })

  it('a stale edit (client_changed) upserts the returned client and reloads (AC19)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const current = client('c', 'Renamed elsewhere', 9)
    const p = mutations.update(client('c', 'X', 4), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'client_changed', client: current } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'changed', client: current } })
    expect(upsert).toHaveBeenCalledWith(current)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('client_changed with no client reloads on its own', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const p = mutations.update(client('c', 'X'), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'client_changed' } }))
    await p
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a name clash is returned to the form with the existing client and reloads in the background without waiting', async () => {
    const { api, calls } = deferredApi()
    const upsert = vi.fn()
    let releaseReload: () => void = () => undefined
    const reload = vi.fn(() => new Promise<void>((resolve) => {
      releaseReload = resolve
    }))
    const mutations = createClientMutations({ api, upsert, reload })
    const existing = { id: 'o', name: 'Oakhill Bakery', archived: true }
    const p = mutations.add(input({ name: 'oakhill bakery' }))
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'name_taken', existing } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'name_taken', existing } }) // resolved while the reload is still pending
    expect(reload).toHaveBeenCalledTimes(1)
    releaseReload()
  })

  it('the 500-client limit is its own kind and reloads nothing', async () => {
    const { api, calls } = deferredApi()
    const { mutations, reload } = build(api)
    const p = mutations.add(input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'client_limit' } }))
    expect(await p).toEqual({ ok: false, error: { kind: 'limit' } })
    expect(reload).not.toHaveBeenCalled()
  })

  it('a failed reload after a conflict still resolves (never throws)', async () => {
    const { api, calls } = deferredApi()
    const mutations = createClientMutations({ api, upsert: vi.fn(), reload: () => Promise.reject(new Error('down')) })
    const p = mutations.update(client('c', 'X'), input())
    calls[0]!.reject(fetchError(409, { data: { code: 'conflict', reason: 'client_changed' } }))
    expect(await p).toMatchObject({ ok: false, error: { kind: 'changed' } })
  })
})

describe('createClientMutations: archive and restore (guarded per client)', () => {
  it('hit the contract routes with no body, and upsert the reply', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const a = mutations.archive('c1')
    calls[0]!.resolve({ client: client('c1', 'X', 2, false), changed: true })
    await a
    const r = mutations.restore('c1')
    calls[1]!.resolve({ client: client('c1', 'X', 3, true), changed: true })
    await r
    expect(calls.map(c => [c.opts!.method, c.url])).toEqual([
      ['POST', '/api/clients/c1/archive'],
      ['POST', '/api/clients/c1/restore'],
    ])
    expect(calls[0]!.opts!.body).toBeUndefined()
    expect(calls[0]!.opts!.timeout).toBe(CLIENT_WRITE_TIMEOUT_MS)
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('a second tap on the same row resolves to null; another row runs at once (UX R1)', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const first = mutations.archive('c1')
    expect(mutations.pendingIds.value).toEqual(['c1'])
    expect(await mutations.archive('c1')).toBeNull()
    expect(await mutations.restore('c1')).toBeNull()
    const other = mutations.archive('c2')
    expect(calls).toHaveLength(2)
    expect(mutations.pendingIds.value).toEqual(['c1', 'c2'])
    calls[1]!.resolve({ client: client('c2', 'Y', 2, false), changed: true })
    await other
    expect(mutations.pendingIds.value).toEqual(['c1'])
    calls[0]!.resolve({ client: client('c1', 'X', 2, false), changed: true })
    await first
    expect(mutations.pendingIds.value).toEqual([])
  })

  it('an add in flight does not block marking a row, and the other way round', async () => {
    const { api, calls } = deferredApi()
    const { mutations } = build(api)
    const add = mutations.add(input())
    const mark = mutations.archive('c1')
    expect(calls).toHaveLength(2)
    calls[0]!.resolve({ client: client('n', 'Maple Street Market'), replayed: false })
    calls[1]!.resolve({ client: client('c1', 'X', 2, false), changed: true })
    await Promise.all([add, mark])
  })

  it('already in the wanted state (changed: false) is a success, not an error', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert } = build(api)
    const p = mutations.restore('c1')
    const reply = { client: client('c1', 'X', 2, true), changed: false }
    calls[0]!.resolve(reply)
    expect(await p).toEqual({ ok: true, data: reply })
    expect(upsert).toHaveBeenCalledWith(reply.client)
  })

  it('a failure frees the row, maps the error, and a 404 reloads the list (nothing is removed)', async () => {
    const { api, calls } = deferredApi()
    const { mutations, upsert, reload } = build(api)
    const p = mutations.archive('c1')
    calls[0]!.reject(fetchError(404, { data: { code: 'not_found' } }))
    expect(await p).toEqual({ ok: false, error: { kind: 'not_found' } })
    expect(mutations.pendingIds.value).toEqual([])
    expect(upsert).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
    const q = mutations.archive('c1')
    calls[1]!.reject(fetchError())
    expect(await q).toEqual({ ok: false, error: { kind: 'network' } })
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
