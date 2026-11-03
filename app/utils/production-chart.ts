// Pure maths for the "Production trend by size" chart (feature 01 AC20, AC38; §2.5 "Chart details").
// X axis = the days that HAVE production in the filter (Q4), oldest left, evenly spaced. One series per
// farm size (active, or present in the range) in the farm's order, then Rejects. A logged day with no
// entry for a size plots 0. Relative imports: tests/unit imports this file outside Nuxt.
import type { FarmSize, IsoDate, ProductionDay } from '#shared/types/api'
import { addDays } from '#shared/utils/local-date'
import { REJECT_COLOR, rejectColorHex, sizeColor, sizeColorHex } from './size-colors'

export interface ChartSeries {
  key: string
  name: string
  colorClass: string
  colorSlot?: number
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
      colorSlot: s.colorSlot,
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

export interface ChartJsDataset {
  label: string
  data: number[]
  borderColor: string
  backgroundColor: string
  borderDash?: number[]
  borderWidth: number
  tension: number
  pointRadius: number
  pointHoverRadius: number
  pointBackgroundColor: string
  pointBorderColor: string
  pointHitRadius: number
  spanGaps: boolean
}

/**
 * Maps a ChartModel into tree-shaken Chart.js line datasets with theme-aware hex colors.
 */
export function toChartJsDatasets(model: ChartModel, isDark = false): ChartJsDataset[] {
  return model.series.map((s) => {
    const isRejects = s.key === REJECTS_SERIES_KEY
    const color = isRejects
      ? { hex: rejectColorHex(isDark), dashed: false }
      : sizeColorHex(s.colorSlot ?? 0, isDark)
    const isDashed = s.dashed || color.dashed

    return {
      label: s.name,
      data: s.values,
      borderColor: color.hex,
      backgroundColor: color.hex,
      borderDash: isDashed ? [5, 4] : undefined,
      borderWidth: 2,
      tension: 0.3, // Monotone smooth curve
      pointRadius: 2,
      pointHoverRadius: 5,
      pointHitRadius: 10,
      pointBackgroundColor: color.hex,
      pointBorderColor: color.hex,
      spanGaps: false,
    }
  })
}

export interface DashboardBarDay {
  date: IsoDate
  day: string
  eggs: number
  isToday: boolean
}

/**
 * Builds the last 7 calendar days up to `today` for the dashboard production volume trend bar chart.
 */
export function buildDashboardBarDays(days: readonly ProductionDay[], today: IsoDate): DashboardBarDay[] {
  const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const res: DashboardBarDay[] = []
  for (let i = 6; i >= 0; i--) {
    const dateStr = addDays(today, -i)
    const dayData = days.find(d => d.date === dateStr)
    const eggs = dayData?.goodTotal ?? 0
    const [y, m, d] = dateStr.split('-').map(Number)
    const localDate = new Date(y!, m! - 1, d!)
    const dayLabel = WEEKDAY_NAMES[localDate.getDay()]!
    res.push({
      date: dateStr,
      day: dayLabel,
      eggs,
      isToday: i === 0,
    })
  }
  return res
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
