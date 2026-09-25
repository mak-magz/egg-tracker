import { describe, expect, it } from 'vitest'
import {
  createProductionFormSchema,
  createProductionFormState,
  isEmptyAmounts,
  toProductionAmounts,
} from '../../shared/schemas/production-form'
import type { ProductionFormState } from '../../shared/schemas/production-form'

const TODAY = '2026-09-25'
const S = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'
const L = '33333333-3333-4333-8333-333333333333'
const J = '44444444-4444-4444-8444-444444444444'
const SIZES = [S, M, L, J]

function state(lines: Partial<Record<string, [number | null, number | null]>>, rejects: [number | null, number | null] = [null, null], date = TODAY): ProductionFormState {
  return {
    date,
    lines: Object.fromEntries(SIZES.map(id => [id, { trays: lines[id]?.[0] ?? null, loose: lines[id]?.[1] ?? null }])),
    rejects: { trays: rejects[0], loose: rejects[1] },
  }
}

function issues(eggsPerTray: number, s: ProductionFormState, mode: 'log' | 'edit' = 'log') {
  const r = createProductionFormSchema({ eggsPerTray, sizeIds: SIZES, today: TODAY, mode }).safeParse(s)
  return r.success ? [] : r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
}

describe('production form schema at 30 per tray', () => {
  it('accepts the AC3 morning and converts it to eggs', () => {
    const s = state({ [S]: [1, 12], [M]: [4, 28], [L]: [8, 24], [J]: [1, 10] }, [0, 5])
    expect(issues(30, s)).toEqual([])
    expect(toProductionAmounts(s, 30, SIZES)).toEqual({
      good: [{ sizeId: S, eggs: 42 }, { sizeId: M, eggs: 148 }, { sizeId: L, eggs: 264 }, { sizeId: J, eggs: 40 }],
      rejects: 5,
    })
  })

  it('treats blank as 0 and leaves empty sizes out (AC3, AC9)', () => {
    const s = state({ [L]: [8, null] })
    expect(issues(30, s)).toEqual([])
    expect(toProductionAmounts(s, 30, SIZES)).toEqual({ good: [{ sizeId: L, eggs: 240 }], rejects: 0 })
  })

  it('allows loose 29 and rejects loose 30 on that field (AC9)', () => {
    expect(issues(30, state({ [L]: [0, 29] }))).toEqual([])
    expect(issues(30, state({ [L]: [0, 30] }))).toEqual([
      { path: `lines.${L}.loose`, message: 'Loose eggs must be under 30. Add a tray instead.' },
    ])
    expect(issues(30, state({}, [0, 30]))).toEqual([
      { path: 'rejects.loose', message: 'Loose eggs must be under 30. Add a tray instead.' },
    ])
  })

  it('rejects negative and fractional numbers with the whole-number message', () => {
    for (const bad of [-1, 1.5]) {
      expect(issues(30, state({ [S]: [bad, 0], [M]: [1, 0] }))).toEqual([
        { path: `lines.${S}.trays`, message: 'Enter a whole number, like 12.' },
      ])
    }
    const withText = state({ [M]: [1, 0] })
    ;(withText.lines[S] as unknown as { trays: unknown }).trays = 'abc'
    expect(issues(30, withText)).toEqual([{ path: `lines.${S}.trays`, message: 'Enter a whole number, like 12.' }])
  })

  it('needs at least one amount in Log mode (AC10) but not in Edit mode (AC24)', () => {
    expect(issues(30, state({}))).toEqual([{ path: 'amounts', message: 'Enter at least one amount.' }])
    expect(issues(30, state({ [S]: [0, 0] }, [0, 0]))).toEqual([{ path: 'amounts', message: 'Enter at least one amount.' }])
    expect(issues(30, state({}), 'edit')).toEqual([])
  })

  it('blocks a future date and a missing date; any past date is fine (AC11)', () => {
    expect(issues(30, state({ [S]: [1, 0] }, undefined, '2026-09-26'))).toEqual([
      { path: 'date', message: 'You can\'t log a future date. Pick today or earlier.' },
    ])
    expect(issues(30, state({ [S]: [1, 0] }, undefined, ''))).toEqual([{ path: 'date', message: 'Pick a date.' }])
    expect(issues(30, state({ [S]: [1, 0] }, undefined, '2024-09-25'))).toEqual([])
  })
})

describe('production form schema at 24 per tray (AC6)', () => {
  it('records 1 tray + 5 as 29 eggs', () => {
    expect(toProductionAmounts(state({ [S]: [1, 5] }), 24, SIZES).good).toEqual([{ sizeId: S, eggs: 29 }])
  })

  it('caps loose at 23', () => {
    expect(issues(24, state({ [S]: [0, 23] }))).toEqual([])
    expect(issues(24, state({ [S]: [0, 24] }))).toEqual([
      { path: `lines.${S}.loose`, message: 'Loose eggs must be under 24. Add a tray instead.' },
    ])
  })
})

describe('form state helpers', () => {
  it('pre-fills an edited day split at the current tray size; empty sizes stay blank', () => {
    const day = { date: '2026-09-24', good: [{ sizeId: L, eggs: 264 }, { sizeId: S, eggs: 30 }], goodTotal: 294, rejects: 5 }
    const s = createProductionFormState({ date: day.date, sizeIds: SIZES, eggsPerTray: 30, day })
    expect(s.lines[L]).toEqual({ trays: 8, loose: 24 })
    expect(s.lines[S]).toEqual({ trays: 1, loose: null })
    expect(s.lines[M]).toEqual({ trays: null, loose: null })
    expect(s.rejects).toEqual({ trays: null, loose: 5 })
    // Round trip: the pre-filled form saves the same amounts.
    expect(toProductionAmounts(s, 30, SIZES)).toEqual({ good: [{ sizeId: S, eggs: 30 }, { sizeId: L, eggs: 264 }], rejects: 5 })
  })

  it('AC23: Large 8 trays + 24 -> 7 trays + 24 changes the total to 464', () => {
    const s = state({ [S]: [1, 12], [M]: [4, 28], [L]: [7, 24], [J]: [1, 10] }, [0, 5])
    const a = toProductionAmounts(s, 30, SIZES)
    expect(a.good.reduce((n, g) => n + g.eggs, 0)).toBe(464)
  })

  it('knows when every amount is zero', () => {
    expect(isEmptyAmounts(toProductionAmounts(state({}), 30, SIZES))).toBe(true)
    expect(isEmptyAmounts(toProductionAmounts(state({}, [0, 1]), 30, SIZES))).toBe(false)
  })
})
