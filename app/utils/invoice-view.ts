// Pure builder for the invoice (feature 07 §3.4). Every figure is the saved sale's own: quantities are the stored egg
// counts, prices and totals are the frozen line values, and nothing is recomputed (AC10). Only names are current.
// Relative imports: tests/unit imports this file outside Nuxt.
import type { Sale } from '#shared/types/api'
import { formatQtyWithEggs } from '#shared/utils/quantity'
import { formatFullDate } from './day-label'
import { SALE_COPY } from './sale-copy'

export interface InvoiceContext {
  farmName: string
  /** null only when the sale has no client. */
  clientName: string | null
  eggsPerTray: number
  sizeName: (sizeId: string) => string
  formatPrice: (amount: number) => string
}

export interface InvoiceView {
  farmName: string
  number: number
  voided: boolean
  dateText: string
  typeText: string
  billTo: string | null
  walkIn: boolean
  lines: { size: string, quantity: string, price: string, total: string }[]
  total: string
}

export function buildInvoiceView(sale: Sale, ctx: InvoiceContext): InvoiceView {
  const walkIn = sale.clientId === null
  return {
    farmName: ctx.farmName,
    number: sale.saleNumber,
    voided: sale.voidedAt !== null,
    dateText: formatFullDate(sale.saleDate),
    typeText: sale.type === 'delivery' ? SALE_COPY.typeDelivery : SALE_COPY.typeOnSite,
    billTo: walkIn ? null : ctx.clientName,
    walkIn,
    lines: sale.lines.map(l => ({
      size: ctx.sizeName(l.sizeId),
      quantity: formatQtyWithEggs(l.eggs, ctx.eggsPerTray),
      price: ctx.formatPrice(l.pricePerTray),
      total: ctx.formatPrice(l.lineTotal),
    })),
    total: ctx.formatPrice(sale.saleTotal),
  }
}

/** Page title and Save-as-PDF file name: the number only, never a name (AC22). */
export function invoiceTitle(n: number): string {
  return `Invoice ${n}`
}

/** The visible heading: `Invoice #1042`, plus ` - VOID` for a voided sale. */
export function invoiceHeading(n: number, voided: boolean): string {
  return `Invoice #${n}${voided ? ' - VOID' : ''}`
}
