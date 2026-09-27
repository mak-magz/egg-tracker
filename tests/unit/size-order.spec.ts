import { describe, expect, it } from 'vitest'
import { canArchive, groupSizes, moveInOrder, replaceFarmSizes } from '../../app/utils/size-order'
import type { FarmSize, MeResponse } from '../../shared/types/api'

const size = (id: string, name: string, sortOrder: number, active = true): FarmSize =>
  ({ id, name, sortOrder, colorSlot: sortOrder, active })

describe('groupSizes (AC2, AC15)', () => {
  it('splits into active and archived, keeping each group in the list order', () => {
    const list = [size('a', 'Small', 0), size('b', 'Peewee', 1, false), size('c', 'Large', 2), size('d', 'Old', 3, false)]
    const g = groupSizes(list)
    expect(g.active.map(s => s.id)).toEqual(['a', 'c'])
    expect(g.archived.map(s => s.id)).toEqual(['b', 'd'])
  })

  it('handles an empty list and an all-active list', () => {
    expect(groupSizes([])).toEqual({ active: [], archived: [] })
    expect(groupSizes([size('a', 'Small', 0)]).archived).toEqual([])
  })
})

describe('moveInOrder (AC8, AC10)', () => {
  const ids = ['s', 'm', 'l', 'j']

  it('moves a size up or down one place and returns the whole order', () => {
    expect(moveInOrder(ids, 'l', 'up')).toEqual(['s', 'l', 'm', 'j'])
    expect(moveInOrder(ids, 'm', 'down')).toEqual(['s', 'l', 'm', 'j'])
    expect(moveInOrder(ids, 'j', 'up')).toEqual(['s', 'm', 'j', 'l'])
  })

  it('does nothing at the ends: the first can\'t go up, the last can\'t go down', () => {
    expect(moveInOrder(ids, 's', 'up')).toBeNull()
    expect(moveInOrder(ids, 'j', 'down')).toBeNull()
  })

  it('does nothing for an id that isn\'t in the list, or a single size', () => {
    expect(moveInOrder(ids, 'zz', 'up')).toBeNull()
    expect(moveInOrder(['only'], 'only', 'up')).toBeNull()
    expect(moveInOrder(['only'], 'only', 'down')).toBeNull()
  })

  it('does not change its input', () => {
    const before = [...ids]
    moveInOrder(ids, 'm', 'up')
    expect(ids).toEqual(before)
  })

  it('is one step per call, so repeating it walks a size to the top (3 taps for four sizes)', () => {
    let order: string[] = ids
    for (let i = 0; i < 3; i++) order = moveInOrder(order, 'j', 'up')!
    expect(order).toEqual(['j', 's', 'm', 'l'])
    expect(moveInOrder(order, 'j', 'up')).toBeNull()
  })
})

describe('canArchive (AC14)', () => {
  it('needs another active size to remain', () => {
    expect(canArchive(0)).toBe(false)
    expect(canArchive(1)).toBe(false)
    expect(canArchive(2)).toBe(true)
    expect(canArchive(4)).toBe(true)
  })
})

describe('replaceFarmSizes (useMe().setSizes)', () => {
  const me: MeResponse = { email: 'a@b.c', farm: { id: 'f', name: 'Farm', eggsPerTray: 30, currency: 'PHP', sizes: [size('a', 'Small', 0)] } }

  it('swaps only the size list', () => {
    const next = replaceFarmSizes(me, [size('b', 'Big', 0)])!
    expect(next.farm!.sizes.map(s => s.name)).toEqual(['Big'])
    expect(next.farm!.eggsPerTray).toBe(30)
    expect(next.farm!.name).toBe('Farm')
    expect(next.email).toBe('a@b.c')
    expect(me.farm!.sizes[0]!.name).toBe('Small') // the old value isn't mutated
  })

  it('does nothing without a farm or without me', () => {
    const noFarm: MeResponse = { email: 'a@b.c', farm: null }
    expect(replaceFarmSizes(noFarm, [size('b', 'Big', 0)])).toBe(noFarm)
    expect(replaceFarmSizes(null, [])).toBeNull()
  })
})
