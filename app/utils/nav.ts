// The single ordered list of app destinations (AC15). Used by the sidebar, the bottom tabs
// and the top-bar title. Copy: docs/features/00-project-scaffold.md §2.5 "Copy".

export type AppNavKey = 'dashboard' | 'production' | 'sales' | 'inventory' | 'clients'

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
}

export const APP_NAV: readonly AppNavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/', icon: 'i-lucide-layout-dashboard', title: 'Dashboard', subtitle: null, subtitleIsToday: true },
  { key: 'production', label: 'Production', to: '/production', icon: 'i-lucide-clipboard', title: 'Production', subtitle: 'Logged by day, most recent first' },
  { key: 'sales', label: 'Sales', to: '/sales', icon: 'i-lucide-shopping-cart', title: 'Sales', subtitle: 'Deliveries and on-site sales' },
  { key: 'inventory', label: 'Inventory', to: '/inventory', icon: 'i-lucide-package', title: 'Inventory', subtitle: 'Live view — produced minus sold' },
  { key: 'clients', label: 'Clients', to: '/clients', icon: 'i-lucide-users', title: 'Clients', subtitle: 'Your customers' },
]

/** Dashboard (`/`) matches only itself; other items also match their sub-paths (e.g. `/sales/123`). */
export function isNavItemActive(item: AppNavItem, path: string): boolean {
  if (item.to === '/') return path === '/'
  return path === item.to || path.startsWith(`${item.to}/`)
}

export function findActiveNavItem(path: string): AppNavItem | undefined {
  return APP_NAV.find(item => isNavItemActive(item, path))
}

/** "Today, Sep 25" in the device's time zone. Call on the client only. */
export function formatTodaySubtitle(now: Date): string {
  return `Today, ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(now)}`
}
