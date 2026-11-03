import { describe, expect, it } from 'vitest'
import type { InventorySize, ProductionDay, Sale } from '../../shared/types/api'
import { formatQty, formatQtySigned } from '../../shared/utils/quantity'
import { formatPrice } from '../../shared/utils/price'
import { inventoryTotals } from '../../shared/utils/inventory'
import { buildDashboardBarDays } from '../../app/utils/production-chart'

describe('Dashboard Data & Metrics (Feature: Farm Overview)', () => {
  const EGGS_PER_TRAY = 30
  const CURRENCY = 'PHP'

  it('aggregates today production correctly with size chips and rejects', () => {
    const today: ProductionDay = {
      date: '2026-11-01',
      good: [
        { sizeId: 's-large', eggs: 60 },
        { sizeId: 's-medium', eggs: 45 },
      ],
      goodTotal: 105,
      rejects: 4,
    }

    const todayQty = formatQty(today.goodTotal, EGGS_PER_TRAY)
    expect(todayQty).toBe('3 trays + 15')
    expect(today.rejects).toBe(4)

    const sizeLabels = today.good.map(g => ({
      sizeId: g.sizeId,
      qty: formatQty(g.eggs, EGGS_PER_TRAY),
    }))
    expect(sizeLabels).toEqual([
      { sizeId: 's-large', qty: '2 trays' },
      { sizeId: 's-medium', qty: '1 tray + 15' },
    ])
  })

  it('computes live on-hand inventory and owed on orders from inventory totals', () => {
    const mockSizes: InventorySize[] = [
      { id: 's-large', name: 'Large', sortOrder: 0, colorSlot: 0, active: true, onHandEggs: 120, owedEggs: 30 },
      { id: 's-medium', name: 'Medium', sortOrder: 1, colorSlot: 1, active: true, onHandEggs: -15, owedEggs: 15 },
    ]

    const totals = inventoryTotals(mockSizes)
    expect(totals.onHandEggs).toBe(105)
    expect(totals.owedEggs).toBe(45)

    expect(formatQtySigned(totals.onHandEggs, EGGS_PER_TRAY)).toBe('3 trays + 15')
    expect(formatQty(totals.owedEggs, EGGS_PER_TRAY)).toBe('1 tray + 15')
    expect(formatQtySigned(mockSizes[1]!.onHandEggs, EGGS_PER_TRAY)).toBe('-15 eggs')
  })

  it('maps recent sales with customer names and formatted prices', () => {
    const mockClients = [
      { id: 'c-1', name: 'Aling Nena', phone: null, defaultPrice: 210, archivedAt: null, version: 1 },
    ]

    const mockSales: Sale[] = [
      {
        id: 'sale-1',
        saleNumber: 'D1-0001',
        clientId: 'c-1',
        type: 'delivery',
        saleDate: '2026-11-01',
        saleTotal: 420,
        voidedAt: null,
        version: 1,
        lines: [{ sizeId: 's-large', eggs: 60, pricePerTray: 210, lineTotal: 420 }],
      },
      {
        id: 'sale-2',
        saleNumber: 'D1-0002',
        clientId: null,
        type: 'on_site',
        saleDate: '2026-11-01',
        saleTotal: 100,
        voidedAt: null,
        version: 1,
        lines: [{ sizeId: 's-medium', eggs: 15, pricePerTray: 200, lineTotal: 100 }],
      },
    ]

    const recent = mockSales.map((s) => {
      const clientName = s.clientId ? mockClients.find(c => c.id === s.clientId)?.name ?? 'Customer' : 'On-site sale'
      const totalEggs = s.lines.reduce((acc, l) => acc + l.eggs, 0)
      return {
        client: clientName,
        qty: formatQty(totalEggs, EGGS_PER_TRAY),
        price: formatPrice(s.saleTotal, CURRENCY),
      }
    })

    expect(recent).toEqual([
      { client: 'Aling Nena', qty: '2 trays', price: '₱420.00' },
      { client: 'On-site sale', qty: '15 eggs', price: '₱100.00' },
    ])
  })

  it('correctly determines whether farm has any activity to show cards vs placeholder', () => {
    const hasActivity = (productionCount: number, inventoryCount: number, salesCount: number) => {
      return productionCount > 0 || inventoryCount > 0 || salesCount > 0
    }

    expect(hasActivity(0, 0, 0)).toBe(false)
    expect(hasActivity(1, 0, 0)).toBe(true)
    expect(hasActivity(0, 1, 0)).toBe(true)
    expect(hasActivity(0, 0, 1)).toBe(true)
  })

  it('computes 7-day volume trend bar data ending on today for Chart.js', () => {
    const days: ProductionDay[] = [
      { date: '2026-11-01', good: [{ sizeId: 's-large', eggs: 90 }], goodTotal: 90, rejects: 0 },
      { date: '2026-10-31', good: [{ sizeId: 's-large', eggs: 60 }], goodTotal: 60, rejects: 0 },
    ]
    const bars = buildDashboardBarDays(days, '2026-11-01')
    expect(bars).toHaveLength(7)
    expect(bars[6]?.isToday).toBe(true)
    expect(bars[6]?.eggs).toBe(90)
    expect(bars[5]?.isToday).toBe(false)
    expect(bars[5]?.eggs).toBe(60)
    expect(bars[0]?.eggs).toBe(0)
  })
})
