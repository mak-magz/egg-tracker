// The single ordered list of app destinations (AC15). Used by the sidebar, the bottom tabs
// and the top-bar title. Copy: docs/features/00-project-scaffold.md §2.5 "Copy"; feature 05 §2.5 flow M for the
// phone bar (four tabs + a More sheet, owner decision 2026-10-03).

export type AppNavKey = 'dashboard' | 'production' | 'orders' | 'sales' | 'inventory' | 'clients'

export interface AppNavItem {
  key: AppNavKey
  label: string
  to: string
  icon: string
  title: string
  /** Static top-bar subtitle. `null` when the subtitle is dynamic (see `subtitleIsToday`). */
  subtitle: string | null
  /** Render `Today, {Mon D}` from the device's date, client-side only (avoids SSR/UTC mismatch). */
  subtitleIsToday?: true
  /** A shorter label for the phone bar only (the sidebar and the page title keep `label`), feature 05 F1. */
  tabLabel?: string
  /** `tab`: its own tab on the phone bar. `more`: listed in the More sheet. Desktop always lists all six. */
  mobile: 'tab' | 'more'
}

export const APP_NAV: readonly AppNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', tabLabel: 'Home', to: '/', icon: 'i-lucide-layout-dashboard', title: 'Dashboard', subtitle: null, subtitleIsToday: true, mobile: 'tab' },
  { key: 'production', label: 'Production', to: '/production', icon: 'i-lucide-clipboard', title: 'Production', subtitle: 'Logged by day, most recent first', mobile: 'tab' },
  { key: 'orders', label: 'Orders', to: '/orders', icon: 'i-lucide-clipboard-list', title: 'Orders', subtitle: 'What customers are waiting for', mobile: 'tab' },
  { key: 'sales', label: 'Sales', to: '/sales', icon: 'i-lucide-shopping-cart', title: 'Sales', subtitle: 'Deliveries and on-site sales', mobile: 'tab' },
  { key: 'inventory', label: 'Inventory', to: '/inventory', icon: 'i-lucide-package', title: 'Inventory', subtitle: 'Live view, produced minus sold', mobile: 'more' },
  { key: 'clients', label: 'Clients', to: '/clients', icon: 'i-lucide-users', title: 'Clients', subtitle: 'Your customers', mobile: 'more' },
]

/** The tabs on the phone bar, in order (the More button follows them). */
export const MOBILE_TABS: readonly AppNavItem[] = APP_NAV.filter(item => item.mobile === 'tab')

/** The destinations the More sheet lists, in order. */
export const MORE_ITEMS: readonly AppNavItem[] = APP_NAV.filter(item => item.mobile === 'more')

/** The label on the phone bar: the short one when there is one. */
export function navTabLabel(item: AppNavItem): string {
  return item.tabLabel ?? item.label
}

/** Dashboard (`/`) matches only itself; other items also match their sub-paths (e.g. `/sales/123`). */
export function isNavItemActive(item: AppNavItem, path: string): boolean {
  if (item.to === '/') return path === '/'
  return path === item.to || path.startsWith(`${item.to}/`)
}

export function findActiveNavItem(path: string): AppNavItem | undefined {
  return APP_NAV.find(item => isNavItemActive(item, path))
}

/** The More sheet's destination that `path` is under (Inventory or Clients, any path beneath them), or undefined. */
export function findActiveMoreItem(path: string): AppNavItem | undefined {
  return MORE_ITEMS.find(item => isNavItemActive(item, path))
}

/** True when the current screen lives behind the More tab (feature 05 flow M: it then shows the active state). */
export function isMoreActive(path: string): boolean {
  return findActiveMoreItem(path) !== undefined
}

/** "Today, Sep 25" in the device's time zone. Call on the client only. */
export function formatTodaySubtitle(now: Date): string {
  return `Today, ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(now)}`
}
