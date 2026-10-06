import { describe, expect, it } from 'vitest'
import {
  APP_NAV,
  findActiveMoreItem,
  findActiveNavItem,
  isMoreActive,
  isNavItemActive,
  MORE_ITEMS,
  MOBILE_TABS,
  navTabLabel,
} from '../../app/utils/nav'

describe('APP_NAV (feature 05 AC1, owner decision Q2)', () => {
  it('lists six destinations, in the sidebar order', () => {
    expect(APP_NAV.map(i => i.key)).toEqual(['dashboard', 'production', 'orders', 'sales', 'inventory', 'clients'])
    expect(APP_NAV.map(i => i.label)).toEqual(['Dashboard', 'Production', 'Orders', 'Sales', 'Inventory', 'Clients'])
  })

  it('Orders is a real destination with its title and subtitle', () => {
    const orders = APP_NAV.find(i => i.key === 'orders')
    expect(orders).toMatchObject({ to: '/orders', title: 'Orders', subtitle: 'What customers are waiting for', icon: 'i-lucide-clipboard-list' })
  })

  it('the phone bar has four tabs and Inventory and Clients live behind More', () => {
    expect(MOBILE_TABS.map(i => i.key)).toEqual(['dashboard', 'production', 'orders', 'sales'])
    expect(MORE_ITEMS.map(i => i.key)).toEqual(['inventory', 'clients'])
  })

  it('every destination is either a tab or a More item', () => {
    expect(MOBILE_TABS.length + MORE_ITEMS.length).toBe(APP_NAV.length)
  })

  it('F1: the phone bar says Home, while the sidebar and the page title keep Dashboard', () => {
    const dashboard = APP_NAV.find(i => i.key === 'dashboard')!
    expect(navTabLabel(dashboard)).toBe('Home')
    expect(dashboard.label).toBe('Dashboard')
    expect(dashboard.title).toBe('Dashboard')
    // The other tabs keep their own label.
    expect(navTabLabel(APP_NAV.find(i => i.key === 'orders')!)).toBe('Orders')
  })
})

describe('isNavItemActive / findActiveNavItem', () => {
  it('Dashboard matches only itself', () => {
    const dashboard = APP_NAV.find(i => i.key === 'dashboard')!
    expect(isNavItemActive(dashboard, '/')).toBe(true)
    expect(isNavItemActive(dashboard, '/orders')).toBe(false)
  })

  it('other items match their sub-paths but not a longer sibling', () => {
    const orders = APP_NAV.find(i => i.key === 'orders')!
    expect(isNavItemActive(orders, '/orders')).toBe(true)
    expect(isNavItemActive(orders, '/orders/12')).toBe(true)
    expect(isNavItemActive(orders, '/ordersx')).toBe(false)
    expect(findActiveNavItem('/orders')?.key).toBe('orders')
  })
})

describe('isMoreActive (flow M)', () => {
  it('is true on Inventory and Clients and any path beneath them', () => {
    expect(isMoreActive('/inventory')).toBe(true)
    expect(isMoreActive('/clients')).toBe(true)
    expect(isMoreActive('/clients/abc')).toBe(true)
    expect(findActiveMoreItem('/clients/abc')?.key).toBe('clients')
  })

  it('is false on every tab screen and on screens with no tab (Settings)', () => {
    for (const path of ['/', '/production', '/orders', '/orders/1', '/sales', '/settings', '/clientsx']) {
      expect(isMoreActive(path)).toBe(false)
    }
  })
})
