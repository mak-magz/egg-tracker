// Pure maths for the "Production trend by size" chart (feature 01 AC20, AC38; §2.5 "Chart details").
// X axis = the days that HAVE production in the filter (Q4), oldest left, evenly spaced. One series per
// farm size (active, or present in the range) in the farm's order, then Rejects. A logged day with no
// entry for a size plots 0. Relative imports: tests/unit imports this file outside Nuxt.
import type { FarmSize, IsoDate, ProductionDay } from '#shared/types/api'
import { REJECT_COLOR, sizeColor } from './size-colors'

export interface ChartSeries {
  key: string
  name: string
  colorClass: string
  dashed: boolean
  /** One value (eggs) per chart day, oldest first. */
  values: number[]
}

export interface ChartModel {
  /** Oldest first. */
  dates: IsoDate[]
  series: ChartSeries[]
  max: number
}

export const REJECTS_SERIES_KEY = 'rejects'

/**
 * `sizes` is the farm's full list in its order (useFarm().sizes). Active sizes always plot (a line at 0 when
 * the range has none), in the farm's order; archived sizes plot only when the range has eggs of them and
 * come AFTER the active ones, before Rejects (feature 02 S4, AC12), the same order as Edit day.
 */
export function buildChartModel(daysNewestFirst: readonly ProductionDay[], sizes: readonly FarmSize[]): ChartModel {
  const days = [...daysNewestFirst].reverse()
  const present = new Set(days.flatMap(d => d.good.filter(g => g.eggs > 0).map(g => g.sizeId)))
  const shown = [
    ...sizes.filter(s => s.active),
    ...sizes.filter(s => !s.active && present.has(s.id)),
  ]

  const series: ChartSeries[] = shown.map((s) => {
    const color = sizeColor(s.colorSlot)
    return {
      key: s.id,
      name: s.name,
      colorClass: color.class,
      dashed: color.dashed,
      values: days.map(d => d.good.find(g => g.sizeId === s.id)?.eggs ?? 0),
    }
  })
  series.push({
    key: REJECTS_SERIES_KEY,
    name: 'Rejects',
    colorClass: REJECT_COLOR,
    dashed: false,
    values: days.map(d => d.rejects),
  })

  const max = Math.max(1, ...series.flatMap(s => s.values))
  return { dates: days.map(d => d.date), series, max }
}

/** Horizontal position in % (a single day is centred). */
export function xPercent(index: number, count: number): number {
  return count <= 1 ? 50 : (index / (count - 1)) * 100
}

/** Vertical position in % from the top, leaving 10% headroom and a 10% floor. */
export function yPercent(value: number, max: number): number {
  return 90 - (value / Math.max(1, max)) * 80
}

/** Indices of the labels to show: at most `maxLabels`, evenly thinned, always first and last. */
export function thinLabelIndices(count: number, maxLabels: number): number[] {
  if (count <= 0) return []
  if (count <= maxLabels || maxLabels < 2) return count <= maxLabels ? [...Array(count).keys()] : [0, count - 1]
  const step = (count - 1) / (maxLabels - 1)
  return [...new Set(Array.from({ length: maxLabels }, (_, k) => Math.round(k * step)))]
}

/** The nearest day index for a pointer at `fraction` (0..1) across the plot. */
export function nearestIndex(fraction: number, count: number): number {
  if (count <= 1) return 0
  return Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))))
}
