// The top-bar subtitle, as one pure function so the server render and the client's first render cannot disagree.
//
// Why this exists: the layout draws the top bar BEFORE the page's setup runs (the page is a child of the layout, and
// the header slot renders ahead of the body slot). So on the server the layout reads the subtitle before the page has
// set anything, and the server never re-renders. A subtitle a page sets from its setup (Clients: "5 customers", which
// needs client-only data) therefore can't be part of the first render on either side. The page says so up front with
// `definePageMeta({ ownSubtitle: true })`; that flag is known to both sides at layout render time.
//
// Rule: a page that owns its subtitle shows NOTHING until it has set one, on the server and on the client's first
// render alike; it never falls back to the static nav text (that text would be server-rendered, then dropped).

import type { AppNavItem } from './nav'

export interface SubtitleOverride {
  /** Who set it, so one page's cleanup can never wipe the next page's subtitle. */
  owner: number
  /** `null` = show no subtitle (still loading). */
  text: string | null
}

export interface ShellSubtitleInput {
  /** `route.meta.ownSubtitle`: the page sets its own subtitle from client-side data. */
  ownSubtitle: boolean
  override: SubtitleOverride | null
  item: AppNavItem | undefined
  /** `route.meta.subtitle` (pages that aren't nav destinations). */
  metaSubtitle: string | null | undefined
  /** "Today, Sep 25"; `null` until mounted (never rendered on the server). */
  today: string | null
}

export function resolveShellSubtitle({ ownSubtitle, override, item, metaSubtitle, today }: ShellSubtitleInput): string | null {
  if (ownSubtitle) return override?.text ?? null
  if (!item) return metaSubtitle ?? null
  return item.subtitleIsToday ? today : item.subtitle
}

/** The override after `owner` lets go of it: only the owner's own value is dropped. */
export function releaseSubtitle(current: SubtitleOverride | null, owner: number): SubtitleOverride | null {
  return current?.owner === owner ? null : current
}
