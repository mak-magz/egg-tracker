// Pure Inventory helpers (feature 06 §3.4). Eggs in, eggs out: trays only ever come from formatQty.

export interface InventoryFigures {
  onHandEggs: number
  owedEggs: number
}

/** Plain sums of the rows shown, so the Total card equals the size cards exactly (AC3). */
export function inventoryTotals(sizes: readonly InventoryFigures[]): InventoryFigures {
  return sizes.reduce<InventoryFigures>(
    (acc, s) => ({ onHandEggs: acc.onHandEggs + s.onHandEggs, owedEggs: acc.owedEggs + s.owedEggs }),
    { onHandEggs: 0, owedEggs: 0 },
  )
}

/**
 * How many owed eggs the on-hand stock cannot cover (AC6): owed - max(onHand, 0), never below 0 and never
 * more than what is owed. A negative on-hand has its own note.
 */
export function shortByEggs(onHandEggs: number, owedEggs: number): number {
  return Math.max(owedEggs - Math.max(onHandEggs, 0), 0)
}
