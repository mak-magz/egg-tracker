// Size colours for the trend chart (UX R2, AC20, AC38). A colour belongs to a size through its stable
// `colorSlot`, never its position, so reorders and renames keep colours. Slots 0-3 are the design's
// Small/Medium/Large/Jumbo colours (info/warning/success/neutral); 4-9 extend the palette without red;
// 10+ repeat 0-9 with a dashed line. Rejects are always red (the `error` token). Light mode uses the
// 600 shade (owner decision O3), dark mode 400.
// The class strings are static literals so Tailwind's scanner generates them. Apply the class to an
// element and draw with `currentColor` (SVG stroke/fill, `bg-current`).

export const SIZE_PALETTE = [
  'text-blue-600 dark:text-blue-400', // 0 blue (info), seeded Small
  'text-yellow-600 dark:text-yellow-400', // 1 yellow (warning), seeded Medium
  'text-green-600 dark:text-green-400', // 2 green (success, the brand scale), seeded Large
  'text-slate-600 dark:text-slate-400', // 3 slate (neutral), seeded Jumbo
  'text-violet-600 dark:text-violet-400', // 4
  'text-cyan-600 dark:text-cyan-400', // 5
  'text-orange-600 dark:text-orange-400', // 6
  'text-pink-600 dark:text-pink-400', // 7
  'text-lime-700 dark:text-lime-400', // 8
  'text-indigo-600 dark:text-indigo-400', // 9
] as const

/** Rejects are always red and no size is ever red. */
export const REJECT_COLOR = 'text-error'

export const SIZE_HEX_LIGHT = [
  '#2563eb', // 0 blue-600
  '#ca8a04', // 1 yellow-600
  '#16a34a', // 2 green-600
  '#475569', // 3 slate-600
  '#7c3aed', // 4 violet-600
  '#0891b2', // 5 cyan-600
  '#ea580c', // 6 orange-600
  '#db2777', // 7 pink-600
  '#4d7c0f', // 8 lime-700
  '#4f46e5', // 9 indigo-600
] as const

export const SIZE_HEX_DARK = [
  '#60a5fa', // 0 blue-400
  '#facc15', // 1 yellow-400
  '#4ade80', // 2 green-400
  '#94a3b8', // 3 slate-400
  '#a78bfa', // 4 violet-400
  '#22d3ee', // 5 cyan-400
  '#fb923c', // 6 orange-400
  '#f472b6', // 7 pink-400
  '#a3e635', // 8 lime-400
  '#818cf8', // 9 indigo-400
] as const

export const REJECT_HEX_LIGHT = '#dc2626' // red-600
export const REJECT_HEX_DARK = '#f87171' // red-400

export interface SeriesColorHex {
  hex: string
  dashed: boolean
}

export function sizeColorHex(slot: number, isDark = false): SeriesColorHex {
  const s = Number.isInteger(slot) && slot >= 0 ? slot : 0
  const palette = isDark ? SIZE_HEX_DARK : SIZE_HEX_LIGHT
  return {
    hex: palette[s % palette.length]!,
    dashed: s >= palette.length,
  }
}

export function rejectColorHex(isDark = false): string {
  return isDark ? REJECT_HEX_DARK : REJECT_HEX_LIGHT
}

export interface SeriesColor {
  class: string
  /** Slots 10+ reuse the palette, so they draw dashed (and a hollow legend dot) to stay distinct. */
  dashed: boolean
}

export function sizeColor(slot: number): SeriesColor {
  const s = Number.isInteger(slot) && slot >= 0 ? slot : 0
  return { class: SIZE_PALETTE[s % SIZE_PALETTE.length]!, dashed: s >= SIZE_PALETTE.length }
}
