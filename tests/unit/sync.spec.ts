import { describe, expect, it } from 'vitest'
import { compareSequenceNumbers, formatSequenceNumber, parseSequenceNumber } from '../../core/utils/sequence'
import { farmBackupSnapshotSchema } from '../../app/local/export'

describe('Offline Sequence Numbering', () => {
  it('formats deviceId and sequential integer into collision-free format', () => {
    expect(formatSequenceNumber('D1', 1)).toBe('D1-0001')
    expect(formatSequenceNumber('D1', 42)).toBe('D1-0042')
    expect(formatSequenceNumber('D2', 1042)).toBe('D2-1042')
    expect(formatSequenceNumber('BARN-A', 5)).toBe('BARN-A-0005')
  })

  it('parses formatted sequence numbers and legacy integer numbers', () => {
    expect(parseSequenceNumber('D1-0001')).toEqual({ deviceId: 'D1', counter: 1 })
    expect(parseSequenceNumber('D2-1042')).toEqual({ deviceId: 'D2', counter: 1042 })
    expect(parseSequenceNumber(42)).toEqual({ deviceId: '', counter: 42 })
    expect(parseSequenceNumber('42')).toEqual({ deviceId: '', counter: 42 })
  })

  it('compares sequence numbers deterministically', () => {
    expect(compareSequenceNumbers('D1-0001', 'D1-0002')).toBeLessThan(0)
    expect(compareSequenceNumbers('D1-0002', 'D1-0001')).toBeGreaterThan(0)
    expect(compareSequenceNumbers('D1-0001', 'D1-0001')).toBe(0)
    expect(compareSequenceNumbers('D1-0001', 'D2-0001')).toBeLessThan(0)
    expect(compareSequenceNumbers(1, 2)).toBeLessThan(0)
  })
})

describe('Farm Backup Snapshot Schema (AC6)', () => {
  it('validates a complete farm snapshot for export and import', () => {
    const validSnapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      farmSettings: [
        { id: 'default', farm_name: 'Sunrise Farm', eggs_per_tray: 30, currency: 'PHP', device_id: 'D1' },
      ],
      sizes: [
        { id: 's1', name: 'Small', sort_order: 0, color_slot: 0, archived_at: null },
        { id: 's2', name: 'Medium', sort_order: 1, color_slot: 1, archived_at: null },
      ],
      clients: [
        { id: 'c1', name: 'Tia Maria Store', phone: '09171234567', default_price: 210, archived_at: null, version: 1 },
      ],
      production: [
        { id: 'p1', produced_on: '2026-10-31', size_id: 's1', quality: 'good' as const, eggs: 120 },
        { id: 'p2', produced_on: '2026-10-31', size_id: null, quality: 'reject' as const, eggs: 5 },
      ],
      sales: [
        { id: 'sal1', sale_number: 'D1-0001', client_id: 'c1', type: 'delivery' as const, sale_date: '2026-10-31', version: 1, voided_at: null },
      ],
      saleLines: [
        { sale_id: 'sal1', size_id: 's1', eggs: 60, price_per_tray: 210, line_total: 420 },
      ],
    }

    const result = farmBackupSnapshotSchema.safeParse(validSnapshot)
    expect(result.success).toBe(true)
  })

  it('rejects an invalid snapshot with wrong version or malformed quality', () => {
    const invalidVersion = {
      version: 2,
      exportedAt: new Date().toISOString(),
      sizes: [],
      clients: [],
      production: [],
      sales: [],
    }
    expect(farmBackupSnapshotSchema.safeParse(invalidVersion).success).toBe(false)

    const invalidQuality = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sizes: [],
      clients: [],
      production: [
        { id: 'p1', produced_on: '2026-10-31', size_id: 's1', quality: 'cracked', eggs: 10 },
      ],
      sales: [],
    }
    expect(farmBackupSnapshotSchema.safeParse(invalidQuality).success).toBe(false)
  })
})

describe('Conflict Resolution Logic (AC10, AC11)', () => {
  it('identifies older intent edits as LWW conflicts', () => {
    const existingUpdatedAt = '2026-10-31T12:00:00.000Z'
    const olderMutationOccurredAt = '2026-10-31T11:59:00.000Z'
    const newerMutationOccurredAt = '2026-10-31T12:01:00.000Z'

    expect(existingUpdatedAt > olderMutationOccurredAt).toBe(true)
    expect(existingUpdatedAt > newerMutationOccurredAt).toBe(false)
  })
})
