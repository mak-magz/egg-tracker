import { describe, expect, it } from 'vitest'
import {
  buildChartModel,
  buildDashboardBarDays,
  nearestIndex,
  thinLabelIndices,
  toChartJsDatasets,
  xPercent,
  yPercent,
} from '../../app/utils/production-chart'
import { REJECT_HEX_DARK, REJECT_HEX_LIGHT, SIZE_HEX_DARK, SIZE_HEX_LIGHT } from '../../app/utils/size-colors'
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

  it('puts archived-with-eggs after the active sizes, before Rejects, whatever their stored order (feature 02 S4)', () => {
    // Archived Medium sits between two active sizes in the list; it still plots after all the active ones.
    const sizes = [size('s', 'Small', 0, 0), size('m', 'Medium', 1, 1, false), size('l', 'Large', 2, 2), size('j', 'Jumbo', 3, 3)]
    const m = buildChartModel([day('2026-09-25', [['m', 12], ['l', 30]])], sizes)
    expect(m.series.map(s => s.name)).toEqual(['Small', 'Large', 'Jumbo', 'Medium', 'Rejects'])
    expect(m.series.find(s => s.key === 'm')!.values).toEqual([12])
  })

  it('keeps its own colour slot and plots 0 on range days without its eggs', () => {
    const sizes = [size('s', 'Small', 0, 0), size('old', 'Old', 1, 6, false)]
    const m = buildChartModel([day('2026-09-25', [['s', 30]]), day('2026-09-24', [['old', 5]])], sizes)
    const old = m.series.find(s => s.key === 'old')!
    expect(old.values).toEqual([5, 0])
    expect(old.colorClass).toBe(buildChartModel([day('2026-09-24', [['old', 5]])], sizes).series.find(s => s.key === 'old')!.colorClass)
  })

  it('omits an archived size with no eggs in the range but still shows active sizes at 0', () => {
    const sizes = [size('s', 'Small', 0, 0), size('m', 'Medium', 1, 1), size('old', 'Old', 2, 4, false)]
    const m = buildChartModel([day('2026-09-25', [['s', 30]])], sizes)
    expect(m.series.map(s => s.name)).toEqual(['Small', 'Medium', 'Rejects'])
    expect(m.series.find(s => s.key === 'm')!.values).toEqual([0])
  })

  it('handles no days and one day without errors', () => {
    expect(buildChartModel([], SIZES).max).toBe(1)
    expect(xPercent(0, 1)).toBe(50)
  })
})

describe('toChartJsDatasets (Chart.js integration)', () => {
  it('converts ChartModel to Chart.js datasets with correct theme hex colors', () => {
    const m = buildChartModel([day('2026-09-25', [['s', 30], ['l', 60]], 4)], SIZES)
    const lightDatasets = toChartJsDatasets(m, false)
    expect(lightDatasets).toHaveLength(5) // Small, Medium, Large, Jumbo, Rejects
    expect(lightDatasets[0]?.label).toBe('Small')
    expect(lightDatasets[0]?.borderColor).toBe(SIZE_HEX_LIGHT[0])
    expect(lightDatasets[0]?.tension).toBe(0.3)
    expect(lightDatasets[0]?.borderDash).toBeUndefined()

    // Rejects is last and red
    const rejectsLight = lightDatasets[4]!
    expect(rejectsLight.label).toBe('Rejects')
    expect(rejectsLight.borderColor).toBe(REJECT_HEX_LIGHT)

    // Dark mode
    const darkDatasets = toChartJsDatasets(m, true)
    expect(darkDatasets[0]?.borderColor).toBe(SIZE_HEX_DARK[0])
    expect(darkDatasets[4]?.borderColor).toBe(REJECT_HEX_DARK)
  })

  it('handles dashed lines for slots 10+', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => size(`s${i}`, `Size ${i}`, i, i))
    const m = buildChartModel([day('2026-09-25', [['s10', 10]])], twelve)
    const datasets = toChartJsDatasets(m, false)
    const slot10 = datasets.find(d => d.label === 'Size 10')
    expect(slot10?.borderDash).toEqual([5, 4])
  })
})

describe('buildDashboardBarDays (Dashboard 7-day trend)', () => {
  it('returns exactly 7 days ending on today with correct weekday names', () => {
    const today = '2026-09-25' as const // Friday
    const days = [
      day('2026-09-25', [['s', 100]]),
      day('2026-09-24', [['s', 80]]),
      day('2026-09-23', [['s', 70]]),
    ]
    const barDays = buildDashboardBarDays(days, today)
    expect(barDays).toHaveLength(7)
    expect(barDays[6]?.date).toBe('2026-09-25')
    expect(barDays[6]?.isToday).toBe(true)
    expect(barDays[6]?.eggs).toBe(100)
    expect(barDays[5]?.date).toBe('2026-09-24')
    expect(barDays[5]?.isToday).toBe(false)
    expect(barDays[5]?.eggs).toBe(80)
    expect(barDays[0]?.date).toBe('2026-09-19')
    expect(barDays[0]?.eggs).toBe(0)
    expect(barDays[6]?.day).toBe('Fri')
    expect(barDays[5]?.day).toBe('Thu')
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
