import { describe, expect, it } from 'vitest'
import { mergeRecent, upsertClient } from '../../app/utils/client-store'
import type { Client } from '../../shared/types/api'

const c = (id: string, name: string, version = 1, active = true): Client =>
  ({ id, name, phone: null, defaultPrice: null, active, version })

describe('upsertClient', () => {
  it('appends a client that is not in the list, and does not change the input', () => {
    const list = [c('a', 'Alpha')]
    const next = upsertClient(list, c('b', 'Beta'))
    expect(next.map(x => x.id)).toEqual(['a', 'b'])
    expect(list).toHaveLength(1)
  })

  it('replaces the row with the same id', () => {
    const next = upsertClient([c('a', 'Alpha'), c('b', 'Beta')], c('a', 'Alpha 2', 2))
    expect(next).toEqual([c('a', 'Alpha 2', 2), c('b', 'Beta')])
  })

  it('accepts an equal version (a replayed add returns the same client)', () => {
    const next = upsertClient([c('a', 'Alpha', 2)], c('a', 'Alpha', 2, false))
    expect(next[0]!.active).toBe(false)
  })

  it('ignores an OLDER reply, so the list never goes back in time', () => {
    const next = upsertClient([c('a', 'Alpha 2', 5, false)], c('a', 'Alpha', 4))
    expect(next).toEqual([c('a', 'Alpha 2', 5, false)])
  })
})

describe('mergeRecent', () => {
  it('puts a client saved while the read was in flight back into the result', () => {
    const merged = mergeRecent([c('a', 'Alpha')], [c('n', 'New one')])
    expect(merged.map(x => x.id)).toEqual(['a', 'n'])
  })

  it('keeps the server row when it is newer than the recent one, and the recent one when it is newer', () => {
    expect(mergeRecent([c('a', 'Alpha', 3)], [c('a', 'Old', 2)])[0]!.name).toBe('Alpha')
    expect(mergeRecent([c('a', 'Alpha', 3)], [c('a', 'Newer', 4)])[0]!.name).toBe('Newer')
  })

  it('returns the server list unchanged when nothing was saved meanwhile', () => {
    const server = [c('a', 'Alpha'), c('b', 'Beta')]
    expect(mergeRecent(server, [])).toEqual(server)
  })
})
