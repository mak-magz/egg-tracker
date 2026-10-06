// UI copy for the Inventory screen (feature 06 §2.5 "Copy"). One place, so every part says the same thing.

export const INVENTORY_COPY = {
  title: 'Inventory',
  totalTitle: 'Total on hand',
  owedTotal: 'Owed on open orders',
  owedSize: 'Owed on orders',
  inactiveBadge: 'Inactive size',
  shortBy: (qty: string) => `Short by ${qty}`,
  negativeNote: 'Sales are ahead of logged production',
  footnote: 'On hand is good eggs produced minus eggs sold. Owed eggs are shown for information and are not taken off.',
  emptyTitle: 'No inventory yet',
  emptyBody: 'Log production to see stock.',
  emptyAction: 'Go to Production',
  errorTitle: 'Couldn\'t load your stock.',
  errorBody: 'Check your connection and try again.',
  retry: 'Retry',
  groupLabel: (name: string, qty: string) => `${name}, ${qty} on hand`,
  totalGroupLabel: (qty: string) => `Total on hand, ${qty}`,
} as const

/** "360 eggs on hand" / "1 egg on hand" / "-60 eggs on hand" (AC2, AC13). Whole numbers only. */
export function eggsOnHandLine(eggs: number, locale?: string): string {
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(eggs)
  return `${n} ${Math.abs(eggs) === 1 ? 'egg' : 'eggs'} on hand`
}
