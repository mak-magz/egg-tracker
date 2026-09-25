import { describe, expect, it } from 'vitest'
import { buildChartModel, nearestIndex, thinLabelIndices, xPercent, yPercent } from '../../app/utils/production-chart'
import type { FarmSize, ProductionDay } from '../../shared/types/api'

const size = (id: string, name: string, sortOrder: number, colorSlot: number, active = true): FarmSize =>
  ({ id, name, sortOrder, colorSlot, active })

const SIZES = [size('s', 'Small', 0, 0), size('m', 'Medium', 1, 1), size('l', 'Large', 2, 2), size('j', 'Jumbo', 3, 3)]

const day = (date: string, good: [string, number][], rejects = 0): ProductionDay =>
  ({ date, good: good.map(([sizeId, eggs]) => ({ sizeId, eggs })), goodTotal: good.reduce((n, [, e]) => n + e, 0), rejects })

describe('buildChartModel (AC20)', () => {
  it('orders days oldest first, one series per size in farm order, then Rejects', () => {
    const m = buildChartModel([day('2026-09-25', [['l', 264]], 5), day('2026-09-24', [['s', 42]])], SIZES)
    expect(m.dates).toEqual(['2026-09-24', '2026-09-25'])
    expect(m.series.map(s => s.name)).toEqual(['Small', 'Medium', 'Large', 'Jumbo', 'Rejects'])
    expect(m.series.find(s => s.key === 'l')!.values).toEqual([0, 264]) // no entry plots 0
    expect(m.series.at(-1)!.values).toEqual([0, 5])
    expect(m.series.at(-1)!.colorClass).toBe('text-error')
    expect(m.max).toBe(264)
  })

  it('shows any number of sizes, each in its own slot colour (AC38)', () => {
    const six = [size('p', 'Peewee', 0, 4), size('s', 'Small', 1, 0), size('m', 'Medium', 2, 1), size('l', 'Large', 3, 2), size('x', 'Extra Large', 4, 5), size('j', 'Jumbo', 5, 3)]
    const m = buildChartModel([day('2026-09-25', [['p', 30], ['x', 12]])], six)
    expect(m.series).toHaveLength(7)
    expect(new Set(m.series.map(s => s.colorClass)).size).toBe(7)
  })

  it('keeps an archived size only while it has eggs in range', () => {
    const sizes = [...SIZES, size('old', 'Old', 4, 4, false)]
    expect(buildChartModel([day('2026-09-25', [['s', 1]])], sizes).series.map(s => s.key)).not.toContain('old')
    expect(buildChartModel([day('2026-09-25', [['old', 1]])], sizes).series.map(s => s.key)).toContain('old')
  })

  it('handles no days and one day without errors', () => {
    expect(buildChartModel([], SIZES).max).toBe(1)
    expect(xPercent(0, 1)).toBe(50)
  })
})

describe('positions and labels', () => {
  it('spaces days evenly and scales values inside the plot', () => {
    expect([0, 1, 2].map(i => xPercent(i, 3))).toEqual([0, 50, 100])
    expect(yPercent(0, 100)).toBe(90)
    expect(yPercent(100, 100)).toBe(10)
  })

  it('thins labels to the maximum, keeping the first and last', () => {
    expect(thinLabelIndices(5, 7)).toEqual([0, 1, 2, 3, 4])
    const t = thinLabelIndices(30, 7)
    expect(t).toHaveLength(7)
    expect(t[0]).toBe(0)
    expect(t.at(-1)).toBe(29)
    expect(thinLabelIndices(30, 14)).toHaveLength(14)
    expect(thinLabelIndices(0, 7)).toEqual([])
  })

  it('finds the nearest day for a pointer position', () => {
    expect(nearestIndex(0, 7)).toBe(0)
    expect(nearestIndex(0.49, 7)).toBe(3)
    expect(nearestIndex(1.2, 7)).toBe(6)
    expect(nearestIndex(0.7, 1)).toBe(0)
  })
})
