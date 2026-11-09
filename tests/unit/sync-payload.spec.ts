/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { normalizeFarmSnapshot, normalizeMutationForRpc } from '../../core/utils/sync-payload'
import { farmSnapshotSchema } from '../../server/api/sync/snapshot.post'

describe('normalizeMutationForRpc', () => {
  describe('log_production & replace_production_day', () => {
    it('normalizes log_production with good array', () => {
      const payload = {
        submissionId: 'sub-prod-1',
        date: '2026-11-01',
        good: [
          { sizeId: 'sz-sm', eggs: 60 },
          { sizeId: 'sz-md', eggs: 120 },
        ],
        rejects: 4,
      }
      expect(normalizeMutationForRpc('log_production', payload)).toEqual({
        p_submission_id: 'sub-prod-1',
        p_day: '2026-11-01',
        p_size_ids: ['sz-sm', 'sz-md'],
        p_eggs: [60, 120],
        p_rejects: 4,
      })
    })

    it('normalizes replace_production_day with day fallback and defaults rejects to 0', () => {
      const payload = {
        submissionId: 'sub-prod-2',
        day: '2026-11-02',
        sizeIds: ['sz-lg'],
        eggs: [90],
      }
      expect(normalizeMutationForRpc('replace_production_day', payload)).toEqual({
        p_submission_id: 'sub-prod-2',
        p_day: '2026-11-02',
        p_size_ids: ['sz-lg'],
        p_eggs: [90],
        p_rejects: 0,
      })
    })
  })

  describe('create_sale & update_sale', () => {
    it('normalizes create_sale with lines array and default client null and confirm_shortfall true', () => {
      const payload = {
        id: 'sale-1',
        submissionId: 'sub-sale-1',
        type: 'delivery',
        saleDate: '2026-11-03',
        lines: [
          { sizeId: 'sz-md', eggs: 30, pricePerTray: 220 },
          { sizeId: 'sz-lg', eggs: 60, pricePerTray: 240 },
        ],
        saleNumber: 'D1-0001',
      }
      expect(normalizeMutationForRpc('create_sale', payload)).toEqual({
        p_sale_id: 'sale-1',
        p_submission_id: 'sub-sale-1',
        p_type: 'delivery',
        p_sale_date: '2026-11-03',
        p_client_id: null,
        p_version: 1,
        p_size_ids: ['sz-md', 'sz-lg'],
        p_eggs: [30, 60],
        p_prices: [220, 240],
        p_sale_number: 'D1-0001',
        p_confirm_shortfall: true,
      })
    })

    it('normalizes update_sale with saleId and direct sizeIds/eggs/prices arrays', () => {
      const payload = {
        saleId: 'sale-2',
        submissionId: 'sub-sale-2',
        type: 'on_site',
        saleDate: '2026-11-04',
        clientId: 'cli-1',
        version: 2,
        sizeIds: ['sz-sm'],
        eggs: [30],
        prices: [180],
        saleNumber: 'D1-0002',
      }
      expect(normalizeMutationForRpc('update_sale', payload)).toEqual({
        p_sale_id: 'sale-2',
        p_submission_id: 'sub-sale-2',
        p_type: 'on_site',
        p_sale_date: '2026-11-04',
        p_client_id: 'cli-1',
        p_version: 2,
        p_size_ids: ['sz-sm'],
        p_eggs: [30],
        p_prices: [180],
        p_sale_number: 'D1-0002',
        p_confirm_shortfall: true,
      })
    })
  })

  describe('create_order & update_order', () => {
    it('normalizes create_order with lines and wantedBy null', () => {
      const payload = {
        id: 'ord-1',
        submissionId: 'sub-ord-1',
        clientId: 'cli-1',
        orderDate: '2026-11-05',
        lines: [{ sizeId: 'sz-md', eggs: 90, pricePerTray: 215 }],
        orderNumber: 'D1-0001',
      }
      expect(normalizeMutationForRpc('create_order', payload)).toEqual({
        p_order_id: 'ord-1',
        p_submission_id: 'sub-ord-1',
        p_client_id: 'cli-1',
        p_order_date: '2026-11-05',
        p_wanted_by: null,
        p_version: 1,
        p_size_ids: ['sz-md'],
        p_eggs: [90],
        p_prices: [215],
        p_order_number: 'D1-0001',
      })
    })

    it('normalizes update_order with orderId and explicit wantedBy and version', () => {
      const payload = {
        orderId: 'ord-2',
        submissionId: 'sub-ord-2',
        clientId: 'cli-2',
        orderDate: '2026-11-05',
        wantedBy: '2026-11-08',
        version: 3,
        sizeIds: ['sz-lg'],
        eggs: [120],
        prices: [250],
        orderNumber: 'D1-0002',
      }
      expect(normalizeMutationForRpc('update_order', payload)).toEqual({
        p_order_id: 'ord-2',
        p_submission_id: 'sub-ord-2',
        p_client_id: 'cli-2',
        p_order_date: '2026-11-05',
        p_wanted_by: '2026-11-08',
        p_version: 3,
        p_size_ids: ['sz-lg'],
        p_eggs: [120],
        p_prices: [250],
        p_order_number: 'D1-0002',
      })
    })
  })

  describe('add_client & update_client', () => {
    it('normalizes add_client with defaults for phone and defaultPrice', () => {
      const payload = {
        id: 'cli-new',
        submissionId: 'sub-cli-1',
        name: 'Maria Santos',
      }
      expect(normalizeMutationForRpc('add_client', payload)).toEqual({
        p_client_id: 'cli-new',
        p_submission_id: 'sub-cli-1',
        p_name: 'Maria Santos',
        p_phone: null,
        p_default_price: null,
        p_version: 1,
      })
    })

    it('normalizes update_client with clientId and existing values', () => {
      const payload = {
        clientId: 'cli-exist',
        submissionId: 'sub-cli-2',
        name: 'Maria Santos Bakery',
        phone: '09171234567',
        defaultPrice: 210,
        version: 4,
      }
      expect(normalizeMutationForRpc('update_client', payload)).toEqual({
        p_client_id: 'cli-exist',
        p_submission_id: 'sub-cli-2',
        p_name: 'Maria Santos Bakery',
        p_phone: '09171234567',
        p_default_price: 210,
        p_version: 4,
      })
    })
  })

  describe('archive_client & restore_client', () => {
    it('normalizes archive_client with id', () => {
      expect(normalizeMutationForRpc('archive_client', { id: 'c-1' })).toEqual({
        p_client_id: 'c-1',
      })
    })

    it('normalizes restore_client with clientId', () => {
      expect(normalizeMutationForRpc('restore_client', { clientId: 'c-2' })).toEqual({
        p_client_id: 'c-2',
      })
    })
  })

  describe('sizes mutations', () => {
    it('normalizes add_size with id and defaultPrice null fallback', () => {
      expect(normalizeMutationForRpc('add_size', { id: 'sz-1', name: 'Jumbo' })).toEqual({
        p_size_id: 'sz-1',
        p_name: 'Jumbo',
        p_default_price: null,
      })
    })

    it('normalizes rename_size with sizeId and defaultPrice', () => {
      expect(normalizeMutationForRpc('rename_size', { sizeId: 'sz-2', name: 'Extra Large', defaultPrice: 230 })).toEqual({
        p_size_id: 'sz-2',
        p_name: 'Extra Large',
        p_default_price: 230,
      })
    })

    it('normalizes archive_size and restore_size', () => {
      expect(normalizeMutationForRpc('archive_size', { id: 'sz-1' })).toEqual({
        p_size_id: 'sz-1',
      })
      expect(normalizeMutationForRpc('restore_size', { sizeId: 'sz-2' })).toEqual({
        p_size_id: 'sz-2',
      })
    })
  })

  describe('update_farm_settings', () => {
    it('normalizes update_farm_settings', () => {
      const payload = {
        farmName: 'Sunrise Poultry',
        eggsPerTray: 30,
        currency: 'PHP',
      }
      expect(normalizeMutationForRpc('update_farm_settings', payload)).toEqual({
        p_farm_name: 'Sunrise Poultry',
        p_eggs_per_tray: 30,
        p_currency: 'PHP',
      })
    })
  })

  describe('default fallback & other actions', () => {
    it('returns payload unmodified for unrecognized mutation types', () => {
      const customPayload = { foo: 'bar', answer: 42 }
      expect(normalizeMutationForRpc('custom_action', customPayload)).toBe(customPayload)
    })

    it('handles empty or missing payload safely', () => {
      expect(normalizeMutationForRpc('archive_client', {} as any)).toEqual({
        p_client_id: undefined,
      })
    })
  })
})

describe('normalizeFarmSnapshot', () => {
  it('normalizes raw SQLite WASM export (snake_case columns and farmSettings array) into valid farmSnapshotSchema payload', () => {
    const rawExport = {
      exportedAt: '2026-11-08T12:00:00.000Z',
      farmSettings: [
        {
          id: 'default',
          farm_name: 'Sunrise Poultry Farm',
          eggs_per_tray: 30,
          currency: 'PHP',
          device_id: 'D-BARN-1',
          onboarding_completed: 1,
        },
      ],
      localCounters: [
        { id: 'sales', next_number: 14, updated_at: '2026-11-08T12:00:00.000Z' },
        { id: 'orders', next_number: 8, updated_at: '2026-11-08T12:00:00.000Z' },
      ],
      sizes: [
        { id: 'sz-sm', name: 'Small', sort_order: 0, color_slot: 0, archived_at: null },
        { id: 'sz-md', name: 'Medium', sort_order: 1, color_slot: 1, archived_at: null },
      ],
      clients: [
        { id: 'c1', name: 'Aling Nena Bakery', phone: '09181234567', default_price: 215, archived_at: null, version: 2 },
      ],
      production: [
        { id: 'p1', produced_on: '2026-11-08', size_id: 'sz-sm', quality: 'good', eggs: 150 },
        { id: 'p2', produced_on: '2026-11-08', size_id: null, quality: 'reject', eggs: 7 },
      ],
      orders: [
        {
          id: 'o1',
          order_number: 'D-BARN-1-0001',
          client_id: 'c1',
          order_date: '2026-11-08',
          wanted_by: '2026-11-10',
          status: 'confirmed',
          cancelled_at: null,
          closed_short_at: null,
          converted_from_sale_number: null,
          version: 1,
        },
      ],
      orderLines: [
        { order_id: 'o1', size_id: 'sz-sm', eggs: 90, price_per_tray: 215, line_total: 645, dropped_eggs: 0 },
      ],
      sales: [
        {
          id: 'sal1',
          sale_number: 'D-BARN-1-0001',
          client_id: 'c1',
          type: 'delivery',
          sale_date: '2026-11-08',
          order_id: 'o1',
          order_number: 'D-BARN-1-0001',
          version: 1,
          voided_at: null,
        },
      ],
      saleLines: [
        { sale_id: 'sal1', size_id: 'sz-sm', eggs: 90, price_per_tray: 215, line_total: 645 },
      ],
    }

    const normalized = normalizeFarmSnapshot(rawExport)

    expect(normalized.deviceId).toBe('D-BARN-1')
    expect(normalized.farmSettings).toEqual({
      name: 'Sunrise Poultry Farm',
      eggsPerTray: 30,
      currency: 'PHP',
    })
    expect(normalized.sizes).toEqual([
      { id: 'sz-sm', name: 'Small', sortOrder: 0, colorSlot: 0, archivedAt: null },
      { id: 'sz-md', name: 'Medium', sortOrder: 1, colorSlot: 1, archivedAt: null },
    ])
    expect(normalized.clients).toEqual([
      { id: 'c1', name: 'Aling Nena Bakery', phone: '09181234567', defaultPrice: 215, archivedAt: null, version: 2 },
    ])
    expect(normalized.production).toEqual([
      { id: 'p1', producedOn: '2026-11-08', sizeId: 'sz-sm', quality: 'good', eggs: 150 },
      { id: 'p2', producedOn: '2026-11-08', sizeId: null, quality: 'reject', eggs: 7 },
    ])
    expect(normalized.orders).toEqual([
      {
        id: 'o1',
        orderNumber: 'D-BARN-1-0001',
        clientId: 'c1',
        orderDate: '2026-11-08',
        wantedBy: '2026-11-10',
        status: 'confirmed',
        cancelledAt: null,
        closedShortAt: null,
        convertedFromSaleNumber: null,
        version: 1,
      },
    ])
    expect(normalized.orderLines).toEqual([
      { orderId: 'o1', sizeId: 'sz-sm', eggs: 90, pricePerTray: 215, lineTotal: 645, droppedEggs: 0 },
    ])
    expect(normalized.sales).toEqual([
      {
        id: 'sal1',
        saleNumber: 'D-BARN-1-0001',
        clientId: 'c1',
        type: 'delivery',
        saleDate: '2026-11-08',
        orderId: 'o1',
        orderNumber: 'D-BARN-1-0001',
        version: 1,
        voidedAt: null,
      },
    ])
    expect(normalized.saleLines).toEqual([
      { saleId: 'sal1', sizeId: 'sz-sm', eggs: 90, pricePerTray: 215, lineTotal: 645 },
    ])
    expect(normalized.localCounters).toEqual([
      { id: 'sales', nextNumber: 14 },
      { id: 'orders', nextNumber: 8 },
    ])

    const parsed = farmSnapshotSchema.safeParse(normalized)
    expect(parsed.success).toBe(true)
  })

  it('preserves already camelCase data cleanly and is idempotent', () => {
    const camelCaseSnapshot = {
      deviceId: 'D2',
      farmSettings: {
        name: 'Valley View Eggs',
        eggsPerTray: 36,
        currency: 'USD',
      },
      sizes: [
        { id: 'sz-lg', name: 'Large', sortOrder: 2, colorSlot: 2, archivedAt: null },
      ],
      clients: [
        { id: 'c2', name: 'Downtown Diner', phone: '555-0199', defaultPrice: 240, archivedAt: null, version: 1 },
      ],
      production: [
        { id: 'p3', producedOn: '2026-11-08', sizeId: 'sz-lg', quality: 'good' as const, eggs: 360 },
      ],
      orders: [],
      orderLines: [],
      sales: [
        {
          id: 'sal2',
          saleNumber: 'D2-0001',
          clientId: 'c2',
          type: 'on_site' as const,
          saleDate: '2026-11-08',
          orderId: null,
          orderNumber: null,
          version: 1,
          voidedAt: null,
        },
      ],
      saleLines: [
        { saleId: 'sal2', sizeId: 'sz-lg', eggs: 180, pricePerTray: 240, lineTotal: 1200 },
      ],
      localCounters: [
        { id: 'sales', nextNumber: 2 },
      ],
    }

    const firstPass = normalizeFarmSnapshot(camelCaseSnapshot)
    expect(farmSnapshotSchema.safeParse(firstPass).success).toBe(true)

    const secondPass = normalizeFarmSnapshot(firstPass)
    expect(secondPass).toEqual(firstPass)
  })

  it('handles fallback deviceId D1 and snake_case table aliases order_lines, sale_lines, local_counters', () => {
    const inputWithAliases = {
      farm_settings: {
        farm_name: 'Solo Farm',
        eggs_per_tray: '30',
        currency: 'PHP',
      },
      order_lines: [
        { order_id: 'o9', size_id: 'sz-1', eggs: '30', price_per_tray: '200', line_total: '200', dropped_eggs: '0' },
      ],
      sale_lines: [
        { sale_id: 's9', size_id: 'sz-1', eggs: '30', price_per_tray: '200', line_total: '200' },
      ],
      local_counters: [
        { id: 'sales', next_number: '5' },
      ],
    }

    const normalized = normalizeFarmSnapshot(inputWithAliases)
    expect(normalized.deviceId).toBe('D1')
    expect(normalized.farmSettings?.eggsPerTray).toBe(30)
    expect(normalized.orderLines?.[0]?.eggs).toBe(30)
    expect(normalized.orderLines?.[0]?.pricePerTray).toBe(200)
    expect(normalized.saleLines?.[0]?.pricePerTray).toBe(200)
    expect(normalized.localCounters?.[0]?.nextNumber).toBe(5)

    const parsed = farmSnapshotSchema.safeParse(normalized)
    expect(parsed.success).toBe(true)
  })
})
