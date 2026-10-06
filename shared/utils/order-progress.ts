// Order progress text (docs/features/05-orders.md §2.5 O-R4, AC2, AC7). Built on formatQty, the one quantity
// format; the tray size always comes from the farm (useFarm().eggsPerTray), never a literal. Pure.
import { formatQty, splitEggs } from './quantity'

function numberFormat(locale?: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
}

/**
 * `{delivered} of {ordered} trays` when both sides are whole trays (`20 of 30 trays`, `0 of 10 trays`, `1 of 3 trays`,
 * `0 of 1 tray`). When the order is under a tray, plain egg counts (`0 of 5 eggs`). Otherwise the ordered side is in
 * full formatQty and the delivered side too, except that nothing delivered reads `0` (`8 trays + 1 of 12 trays`,
 * `0 of 12 trays + 6`). The bar beside it is decorative; this text carries the meaning.
 */
export function formatProgress(deliveredEggs: number, orderedEggs: number, eggsPerTray: number, locale?: string): string {
  const delivered = splitEggs(deliveredEggs, eggsPerTray)
  const ordered = splitEggs(orderedEggs, eggsPerTray)
  const nf = numberFormat(locale)
  if (ordered.trays === 0) {
    return `${nf.format(deliveredEggs)} of ${nf.format(orderedEggs)} ${orderedEggs === 1 ? 'egg' : 'eggs'}`
  }
  if (delivered.loose === 0 && ordered.loose === 0) {
    return `${nf.format(delivered.trays)} of ${nf.format(ordered.trays)} ${ordered.trays === 1 ? 'tray' : 'trays'}`
  }
  const deliveredText = deliveredEggs === 0 ? '0' : formatQty(deliveredEggs, eggsPerTray, locale)
  return `${deliveredText} of ${formatQty(orderedEggs, eggsPerTray, locale)}`
}
