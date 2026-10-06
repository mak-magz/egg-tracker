import { describe, expect, it } from 'vitest'
import { inventoryTotals, shortByEggs } from '../../shared/utils/inventory'
import { formatQtySigned } from '../../shared/utils/quantity'
import { INVENTORY_COPY, eggsOnHandLine } from '../../app/utils/inventory-copy'

describe('inventoryTotals', () => {
  it('sums the rows shown (PM example: 750 on hand, 390 owed)', () => {
    const rows = [
      { onHandEggs: 0, owedEggs: 0 },
      { onHandEggs: 300, owedEggs: 90 },
      { onHandEggs: 360, owedEggs: 300 },
      { onHandEggs: 90, owedEggs: 0 },
    ]
    expect(inventoryTotals(rows)).toEqual({ onHandEggs: 750, owedEggs: 390 })
  })

  it('sums true negatives and handles no rows', () => {
    expect(inventoryTotals([{ onHandEggs: -60, owedEggs: 0 }, { onHandEggs: 100, owedEggs: 0 }]).onHandEggs).toBe(40)
    expect(inventoryTotals([])).toEqual({ onHandEggs: 0, owedEggs: 0 })
  })
})

describe('shortByEggs', () => {
  it('is zero when stock covers what is owed', () => {
    expect(shortByEggs(360, 300)).toBe(0)
    expect(shortByEggs(300, 300)).toBe(0)
  })
  it('is the gap when owed exceeds on hand (240 on hand, 300 owed = 60)', () => {
    expect(shortByEggs(240, 300)).toBe(60)
  })
  it('never exceeds what is owed when on hand is negative', () => {
    expect(shortByEggs(-60, 300)).toBe(300)
    expect(shortByEggs(-60, 0)).toBe(0)
  })
})

describe('formatQtySigned', () => {
  it('matches formatQty for zero and positives', () => {
    expect(formatQtySigned(0, 30)).toBe('0 eggs')
    expect(formatQtySigned(360, 30)).toBe('12 trays')
    expect(formatQtySigned(45, 30)).toBe('1 tray + 15')
  })
  it('prefixes a minus instead of throwing on negatives', () => {
    expect(formatQtySigned(-60, 30)).toBe('-2 trays')
    expect(formatQtySigned(-1, 30)).toBe('-1 egg')
    expect(formatQtySigned(-45, 30)).toBe('-1 tray + 15')
  })
})

describe('inventory copy', () => {
  it('uses the exact UX strings', () => {
    expect(INVENTORY_COPY.totalTitle).toBe('Total on hand')
    expect(INVENTORY_COPY.owedTotal).toBe('Owed on open orders')
    expect(INVENTORY_COPY.owedSize).toBe('Owed on orders')
    expect(INVENTORY_COPY.inactiveBadge).toBe('Inactive size')
    expect(INVENTORY_COPY.shortBy('2 trays')).toBe('Short by 2 trays')
    expect(INVENTORY_COPY.negativeNote).toBe('Sales are ahead of logged production')
    expect(INVENTORY_COPY.footnote).toBe('On hand is good eggs produced minus eggs sold. Owed eggs are shown for information and are not taken off.')
    expect(INVENTORY_COPY.emptyTitle).toBe('No inventory yet')
    expect(INVENTORY_COPY.emptyBody).toBe('Log production to see stock.')
    expect(INVENTORY_COPY.emptyAction).toBe('Go to Production')
    expect(INVENTORY_COPY.errorTitle).toBe('Couldn\'t load your stock.')
    expect(INVENTORY_COPY.errorBody).toBe('Check your connection and try again.')
  })

  it('says "egg" for exactly one and groups thousands; negatives keep the sign', () => {
    expect(eggsOnHandLine(1, 'en-US')).toBe('1 egg on hand')
    expect(eggsOnHandLine(0, 'en-US')).toBe('0 eggs on hand')
    expect(eggsOnHandLine(1200, 'en-US')).toBe('1,200 eggs on hand')
    expect(eggsOnHandLine(-60, 'en-US')).toBe('-60 eggs on hand')
    expect(eggsOnHandLine(-1, 'en-US')).toBe('-1 egg on hand')
  })
})
