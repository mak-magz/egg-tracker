/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { formatQty } from '#shared/utils/quantity'
import { localWorker } from './client'

export const farmBackupSnapshotSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  farmSettings: z.array(z.record(z.string(), z.any())).optional(),
  localCounters: z.array(z.record(z.string(), z.any())).optional(),
  sizes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    sort_order: z.number().optional(),
    sortOrder: z.number().optional(),
    color_slot: z.number().optional(),
    colorSlot: z.number().optional(),
    archived_at: z.string().nullable().optional(),
    archivedAt: z.string().nullable().optional(),
    default_price: z.number().nullable().optional(),
    defaultPrice: z.number().nullable().optional(),
  })),
  clients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    phone: z.string().nullable().optional(),
    default_price: z.number().nullable().optional(),
    defaultPrice: z.number().nullable().optional(),
    archived_at: z.string().nullable().optional(),
    archivedAt: z.string().nullable().optional(),
    version: z.number().optional(),
  })),
  production: z.array(z.object({
    id: z.string(),
    produced_on: z.string().optional(),
    producedOn: z.string().optional(),
    size_id: z.string().nullable().optional(),
    sizeId: z.string().nullable().optional(),
    quality: z.enum(['good', 'reject']),
    eggs: z.number(),
  })),
  sales: z.array(z.object({
    id: z.string(),
    sale_number: z.string().optional(),
    saleNumber: z.string().optional(),
    client_id: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
    type: z.enum(['delivery', 'on_site']),
    sale_date: z.string().optional(),
    saleDate: z.string().optional(),
    order_id: z.string().nullable().optional(),
    orderId: z.string().nullable().optional(),
    order_number: z.string().nullable().optional(),
    orderNumber: z.string().nullable().optional(),
    version: z.number().optional(),
    voided_at: z.string().nullable().optional(),
    voidedAt: z.string().nullable().optional(),
  })),
  saleLines: z.array(z.object({
    sale_id: z.string().optional(),
    saleId: z.string().optional(),
    size_id: z.string().optional(),
    sizeId: z.string().optional(),
    eggs: z.number(),
    price_per_tray: z.number().optional(),
    pricePerTray: z.number().optional(),
    line_total: z.number().optional(),
    lineTotal: z.number().optional(),
  })).optional(),
  orders: z.array(z.record(z.string(), z.any())).optional(),
  orderLines: z.array(z.record(z.string(), z.any())).optional(),
})

export type FarmBackupSnapshot = z.infer<typeof farmBackupSnapshotSchema>

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCsvCell(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  const str = String(cell)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function exportFarmDataToJson(): Promise<void> {
  const data = await localWorker.exportData()
  const json = JSON.stringify(data, null, 2)
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(json, `tamago-backup-${dateStr}.json`, 'application/json')
}

export async function exportProductionCsv(eggsPerTray = 30): Promise<void> {
  const data = await localWorker.exportData()
  const customEggsPerTray = Number(data.farmSettings?.[0]?.eggs_per_tray ?? data.farmSettings?.[0]?.eggsPerTray ?? eggsPerTray) || 30
  const sizeMap = new Map<string, string>()
  for (const s of data.sizes || []) {
    sizeMap.set(s.id, s.name)
  }

  const rows: string[][] = [
    ['Date', 'Size', 'Quality', 'Eggs', 'Quantity (Trays + Loose)'],
  ]

  for (const p of data.production || []) {
    const sizeName = p.size_id ? (sizeMap.get(p.size_id) || 'Unknown') : 'Unsized'
    const eggs = Number(p.eggs)
    rows.push([
      p.produced_on,
      sizeName,
      p.quality,
      String(eggs),
      formatQty(eggs, customEggsPerTray),
    ])
  }

  const csv = rows.map(r => r.map(escapeCsvCell).join(',')).join('\n')
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(csv, `tamago-production-${dateStr}.csv`, 'text/csv;charset=utf-8;')
}

export async function exportSalesCsv(): Promise<void> {
  const data = await localWorker.exportData()
  const clientMap = new Map<string, string>()
  for (const c of data.clients || []) {
    clientMap.set(c.id, c.name)
  }
  const sizeMap = new Map<string, string>()
  for (const s of data.sizes || []) {
    sizeMap.set(s.id, s.name)
  }

  const saleLinesMap = new Map<string, any[]>()
  for (const sl of data.saleLines || []) {
    const list = saleLinesMap.get(sl.sale_id) || []
    list.push(sl)
    saleLinesMap.set(sl.sale_id, list)
  }

  const rows: string[][] = [
    ['Sale Number', 'Date', 'Type', 'Client', 'Size', 'Eggs', 'Price Per Tray', 'Line Total', 'Voided At'],
  ]

  for (const s of data.sales || []) {
    const lines = saleLinesMap.get(s.id) || []
    const clientName = s.client_id ? (clientMap.get(s.client_id) || 'Unknown') : 'On-Site'

    if (lines.length === 0) {
      rows.push([
        s.sale_number,
        s.sale_date,
        s.type,
        clientName,
        '-',
        '0',
        '0.00',
        '0.00',
        s.voided_at || '',
      ])
    }
    else {
      for (const line of lines) {
        rows.push([
          s.sale_number,
          s.sale_date,
          s.type,
          clientName,
          sizeMap.get(line.size_id) || 'Unknown',
          String(line.eggs),
          Number(line.price_per_tray).toFixed(2),
          Number(line.line_total).toFixed(2),
          s.voided_at || '',
        ])
      }
    }
  }

  const csv = rows.map(r => r.map(escapeCsvCell).join(',')).join('\n')
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(csv, `tamago-sales-${dateStr}.csv`, 'text/csv;charset=utf-8;')
}

export async function exportClientsCsv(): Promise<void> {
  const data = await localWorker.exportData()
  const rows: string[][] = [
    ['Name', 'Phone', 'Default Price Per Tray', 'Status'],
  ]

  for (const c of data.clients || []) {
    rows.push([
      c.name,
      c.phone || '',
      c.default_price !== null && c.default_price !== undefined ? Number(c.default_price).toFixed(2) : '',
      c.archived_at ? 'Archived' : 'Active',
    ])
  }

  const csv = rows.map(r => r.map(escapeCsvCell).join(',')).join('\n')
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(csv, `tamago-clients-${dateStr}.csv`, 'text/csv;charset=utf-8;')
}

export async function importFarmSnapshotFromJson(jsonString: string): Promise<void> {
  const parsed = JSON.parse(jsonString)
  const validated = farmBackupSnapshotSchema.parse(parsed)
  await localWorker.importSnapshot(validated, undefined, { tier: 'free' })
}
