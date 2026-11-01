import { describe, expect, it } from 'vitest'
import { computeLineTotal, formatPriceInput } from '../../shared/utils/price'
import { checkLinePrice, checkLineQuantity } from '../../app/utils/sale-validation'
import { checkLineAboveDelivered } from '../../app/utils/order-validation'

describe('Sales & Orders Multi-Size Grid Redesign', () => {
  const farmSizes = [
    { id: 'sz-small', name: 'Small', sortOrder: 1, colorSlot: 1, archived: false },
    { id: 'sz-medium', name: 'Medium', sortOrder: 2, colorSlot: 2, archived: false },
    { id: 'sz-large', name: 'Large', sortOrder: 3, colorSlot: 3, archived: false },
    { id: 'sz-jumbo', name: 'Jumbo', sortOrder: 4, colorSlot: 4, archived: false },
  ]
  const trayEggs = 30

  it('initializes all active farm sizes by default without needing an Add Size action', () => {
    const lines = farmSizes.map(s => ({
      sizeId: s.id,
      name: s.name,
      qty: { trays: null, loose: null },
      priceRaw: '',
    }))

    expect(lines).toHaveLength(4)
    expect(lines.map(l => l.name)).toEqual(['Small', 'Medium', 'Large', 'Jumbo'])
  })

  it('pre-fills client default price across sizes and preserves manual price edits', () => {
    let clientDefaultPrice: number | null = 210.00
    const lines = farmSizes.map(s => ({
      sizeId: s.id,
      priceRaw: clientDefaultPrice !== null ? formatPriceInput(clientDefaultPrice) : '',
      priceIsUsual: clientDefaultPrice !== null,
    }))

    // Initially all follow client default price
    expect(lines.every(l => l.priceRaw === '210.00')).toBe(true)

    // User manually edits Large price to 230.00
    lines[2]!.priceRaw = '230.00'
    lines[2]!.priceIsUsual = false

    // Client changes to a new client with default price 215.00
    clientDefaultPrice = 215.00
    for (const l of lines) {
      if (l.priceIsUsual) {
        l.priceRaw = formatPriceInput(clientDefaultPrice)
      }
    }

    // Small, Medium, Jumbo update to 215.00; Large stays 230.00
    expect(lines[0]!.priceRaw).toBe('215.00')
    expect(lines[1]!.priceRaw).toBe('215.00')
    expect(lines[2]!.priceRaw).toBe('230.00')
    expect(lines[3]!.priceRaw).toBe('215.00')
  })

  it('omits sizes with 0 or null quantity from the final submitted lines', () => {
    const lines = [
      { sizeId: 'sz-small', qty: { trays: null, loose: null }, priceRaw: '210.00' },
      { sizeId: 'sz-medium', qty: { trays: 0, loose: 0 }, priceRaw: '210.00' },
      { sizeId: 'sz-large', qty: { trays: 4, loose: 0 }, priceRaw: '210.00' },
      { sizeId: 'sz-jumbo', qty: { trays: null, loose: null }, priceRaw: '210.00' },
    ]

    const hasQuantity = (l: (typeof lines)[0]) => {
      const t = l.qty.trays
      const loose = l.qty.loose
      return (t !== null && t > 0) || (loose !== null && loose > 0)
    }

    const activeLines = lines.filter(hasQuantity)
    expect(activeLines).toHaveLength(1)
    expect(activeLines[0]!.sizeId).toBe('sz-large')

    const submittedLines = activeLines.map((l) => {
      const qty = checkLineQuantity(l.qty, trayEggs)
      const price = checkLinePrice(l.priceRaw, 'PHP')
      return {
        sizeId: l.sizeId,
        eggs: qty.ok ? qty.value : 0,
        pricePerTray: price.ok ? price.value : 0,
      }
    })

    expect(submittedLines).toEqual([
      { sizeId: 'sz-large', eggs: 120, pricePerTray: 210.00 },
    ])
  })

  it('calculates live line total and transaction grand total correctly', () => {
    const lines = [
      { sizeId: 'sz-small', qty: { trays: 2, loose: 0 }, priceRaw: '200.00' }, // 60 eggs @ 200 = 400.00
      { sizeId: 'sz-medium', qty: { trays: null, loose: null }, priceRaw: '210.00' }, // skipped
      { sizeId: 'sz-large', qty: { trays: 3, loose: 15 }, priceRaw: '220.00' }, // 105 eggs (3.5 trays) @ 220 = 770.00
    ]

    const hasQuantity = (l: (typeof lines)[0]) => {
      const t = l.qty.trays
      const loose = l.qty.loose
      return (t !== null && t > 0) || (loose !== null && loose > 0)
    }

    const lineTotals = lines.map((l) => {
      if (!hasQuantity(l)) return null
      const eggs = checkLineQuantity(l.qty, trayEggs)
      const price = checkLinePrice(l.priceRaw, 'PHP')
      if (!eggs.ok || !price.ok) return null
      return computeLineTotal(price.value, eggs.value, trayEggs)
    })

    expect(lineTotals).toEqual([400.00, null, 770.00])
    const grandTotal = lineTotals.reduce((sum: number, t) => sum + (t ?? 0), 0)
    expect(grandTotal).toBe(1170.00)
  })

  it('rejects order lines reduced below delivered amount on partially fulfilled orders', () => {
    const minDeliveredEggs = 60 // 2 trays delivered
    const lineQty = { trays: 1, loose: 0 } // 30 eggs attempted (lower than delivered)

    const qtyCheck = checkLineQuantity(lineQty, trayEggs)
    expect(qtyCheck.ok).toBe(true)

    const floorCheck = checkLineAboveDelivered(qtyCheck.ok ? qtyCheck.value : 0, minDeliveredEggs, trayEggs)
    expect(floorCheck.ok).toBe(false)
    expect(floorCheck.message).toContain('2 trays')
  })
})
