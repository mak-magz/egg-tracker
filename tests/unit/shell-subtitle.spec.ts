import { describe, expect, it } from 'vitest'
import { APP_NAV, findActiveNavItem } from '../../app/utils/nav'
import { releaseSubtitle, resolveShellSubtitle } from '../../app/utils/shell-subtitle'
import type { ShellSubtitleInput } from '../../app/utils/shell-subtitle'

const clients = findActiveNavItem('/clients')
const base: ShellSubtitleInput = { ownSubtitle: false, override: null, item: undefined, metaSubtitle: undefined, today: null }

describe('resolveShellSubtitle', () => {
  it('a page that owns its subtitle shows nothing until it sets one (server render == first client render)', () => {
    // The server never has an override, and the client's first render has none either.
    expect(resolveShellSubtitle({ ...base, ownSubtitle: true, item: clients })).toBeNull()
    // Never the nav's static text ("Your customers"): that would be server-rendered, then dropped.
    expect(clients?.subtitle).toBe('Your customers')
  })

  it('a page-owned null keeps the subtitle hidden while loading, then shows the text', () => {
    expect(resolveShellSubtitle({ ...base, ownSubtitle: true, item: clients, override: { owner: 1, text: null } })).toBeNull()
    expect(resolveShellSubtitle({ ...base, ownSubtitle: true, item: clients, override: { owner: 1, text: '5 customers' } })).toBe('5 customers')
  })

  it('a leftover override is ignored on a page that does not own its subtitle', () => {
    const production = APP_NAV.find(i => i.key === 'production')
    expect(resolveShellSubtitle({ ...base, item: production, override: { owner: 1, text: '5 customers' } })).toBe('Logged by day, most recent first')
  })

  it('other screens are unchanged: static text, the client-only date, the page meta subtitle', () => {
    const dashboard = APP_NAV.find(i => i.key === 'dashboard')
    expect(resolveShellSubtitle({ ...base, item: dashboard, today: null })).toBeNull()
    expect(resolveShellSubtitle({ ...base, item: dashboard, today: 'Today, Sep 26' })).toBe('Today, Sep 26')
    expect(resolveShellSubtitle({ ...base, metaSubtitle: 'Farm settings' })).toBe('Farm settings')
    expect(resolveShellSubtitle({ ...base })).toBeNull()
  })
})

describe('releaseSubtitle', () => {
  it('drops the owner\'s own value', () => {
    expect(releaseSubtitle({ owner: 1, text: 'x' }, 1)).toBeNull()
  })

  it('leaves a newer page\'s value alone (the new page sets before the old one unmounts)', () => {
    const next = { owner: 2, text: '3 customers' }
    expect(releaseSubtitle(next, 1)).toBe(next)
    expect(releaseSubtitle(null, 1)).toBeNull()
  })
})
