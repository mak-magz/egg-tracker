// Pure helpers for the Settings > Sizes screen (feature 02 §3.4): grouping the farm's list and working out
// a move. Relative imports: tests/unit imports this file outside Nuxt.
import type { FarmSize, MeResponse } from '../../shared/types/api'

export interface GroupedSizes<T extends Pick<FarmSize, 'active'>> {
  /** Offered for new entries, in the farm's order. */
  active: T[]
  /** Retired, in their last order. */
  archived: T[]
}

/** Splits the farm's list into active and archived. Stable: each group keeps the list's own order. */
export function groupSizes<T extends Pick<FarmSize, 'active'>>(sizes: readonly T[]): GroupedSizes<T> {
  return {
    active: sizes.filter(s => s.active),
    archived: sizes.filter(s => !s.active),
  }
}

export type MoveDirection = 'up' | 'down'

/**
 * The wanted FULL order of the active sizes after moving `id` one place, or null when there is nothing to do
 * (the first size can't go up, the last can't go down, or `id` isn't in the list: AC10). The API takes the
 * whole order, never a step, so a retry can't move a size twice (feature 02 D4).
 */
export function moveInOrder(activeIds: readonly string[], id: string, direction: MoveDirection): string[] | null {
  const from = activeIds.indexOf(id)
  if (from === -1) return null
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= activeIds.length) return null
  const next = [...activeIds]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/**
 * `me` with the farm's size list replaced (useMe().setSizes). Returns `me` itself, untouched, when there is
 * no farm to put them on, and never changes anything else (status, email, eggs-per-tray).
 */
export function replaceFarmSizes(me: MeResponse | null, sizes: FarmSize[]): MeResponse | null {
  if (!me?.farm) return me
  return { ...me, farm: { ...me.farm, sizes } }
}

/** A farm always keeps one active size (AC14): only archive when another active size would remain. */
export function canArchive(activeCount: number): boolean {
  return activeCount > 1
}
