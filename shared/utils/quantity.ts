// The ONE trays <-> eggs helper (docs/features/01-production-logging.md §3.4, UX R1).
// Eggs are the stored unit; trays exist only at input and display. Every conversion and every
// quantity string in the app goes through here. eggsPerTray always comes from the farm
// (useFarm().eggsPerTray); no tray size is ever hardcoded. Pure, so tests import it directly.

function assertEggsPerTray(eggsPerTray: number): void {
  if (!Number.isInteger(eggsPerTray) || eggsPerTray < 1) {
    throw new RangeError(`eggsPerTray must be a whole number of at least 1: ${eggsPerTray}`)
  }
}

function assertWholeCount(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole number of at least 0: ${value}`)
  }
}

/** Trays + loose -> eggs. Blank inputs should be passed as 0. */
export function toEggs(trays: number, loose: number, eggsPerTray: number): number {
  assertEggsPerTray(eggsPerTray)
  assertWholeCount(trays, 'trays')
  assertWholeCount(loose, 'loose')
  return trays * eggsPerTray + loose
}

/** Eggs -> whole trays + loose remainder (loose is always below eggsPerTray). */
export function splitEggs(eggs: number, eggsPerTray: number): { trays: number, loose: number } {
  assertEggsPerTray(eggsPerTray)
  assertWholeCount(eggs, 'eggs')
  return { trays: Math.floor(eggs / eggsPerTray), loose: eggs % eggsPerTray }
}

/**
 * UX R1, the only quantity format: `0 eggs`, `1 egg`, `5 eggs`, `1 tray`, `2 trays`,
 * `1 tray + 12`, `16 trays + 14`, `1,200 trays`. The loose part never has a unit.
 * Thousands separators follow `locale` (the device locale when omitted).
 */
export function formatQty(eggs: number, eggsPerTray: number, locale?: string): string {
  const { trays, loose } = splitEggs(eggs, eggsPerTray)
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  if (trays === 0) return `${nf.format(loose)} ${loose === 1 ? 'egg' : 'eggs'}`
  const traysPart = `${nf.format(trays)} ${trays === 1 ? 'tray' : 'trays'}`
  return loose === 0 ? traysPart : `${traysPart} + ${nf.format(loose)}`
}

export type QuantityLabel = 'Good' | 'Rejects'

/** Label first, then the R1 amount: `Good: 16 trays + 14`, `Rejects: 5 eggs`. */
export function formatLabelledQty(label: QuantityLabel, eggs: number, eggsPerTray: number, locale?: string): string {
  return `${label}: ${formatQty(eggs, eggsPerTray, locale)}`
}
