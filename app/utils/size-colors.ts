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

export interface SeriesColor {
  class: string
  /** Slots 10+ reuse the palette, so they draw dashed (and a hollow legend dot) to stay distinct. */
  dashed: boolean
}

export function sizeColor(slot: number): SeriesColor {
  const s = Number.isInteger(slot) && slot >= 0 ? slot : 0
  return { class: SIZE_PALETTE[s % SIZE_PALETTE.length]!, dashed: s >= SIZE_PALETTE.length }
}
