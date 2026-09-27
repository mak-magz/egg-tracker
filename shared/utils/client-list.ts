// Sorting, searching and filtering the client list (docs/features/03-clients.md §3.3 D7, AC4 to AC6). Pure, and done
// in the browser (the list is at most 500 rows, and the search text must never leave the browser: AC30). The Sales
// client picker reuses these. Accents are ignored ONLY here, for search and sort. The uniqueness rule is
// accent-sensitive ("Cafe" and "Café" are different names), see client-name.ts.
import type { Client } from '../types/api'

export type ClientStatusFilter = 'all' | 'active' | 'inactive'
export interface ClientFilters { search: string, status: ClientStatusFilter }

/** Lower case with accents removed: "The Green Table Café" becomes "the green table cafe". Apply to BOTH sides of a search. */
export function foldForSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
}

// Case and accents ignored ("Émile" sits among the E's); punctuation is not ignored and there is no numeric collation.
const collator = new Intl.Collator('en', { sensitivity: 'base' })

/**
 * A to Z by name, ignoring case and accents. Ties (only "Cafe" and "Café" can tie, since names are unique ignoring
 * case) fall back to the exact name, then the id, so the order is total and stable.
 */
export function compareClients(a: Pick<Client, 'id' | 'name'>, b: Pick<Client, 'id' | 'name'>): number {
  const byName = collator.compare(a.name, b.name)
  if (byName !== 0) return byName
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The search box's text, ready to match: spaces collapsed and trimmed, then folded. An empty result matches everything. */
function foldedQuery(search: string): string {
  return foldForSearch(search.replace(/\s+/gu, ' ').trim())
}

function statusMatches(client: Pick<Client, 'active'>, status: ClientStatusFilter): boolean {
  return status === 'all' || (status === 'active') === client.active
}

/**
 * Whether one client passes the filters: its status matches AND its name contains the search anywhere (case, accents
 * and leading or trailing spaces ignored; a blank search matches all). Used to ask "would this filter hide the client
 * I just saved?" (AC14, UX flow B).
 */
export function clientMatchesFilters(client: Pick<Client, 'name' | 'active'>, filters: ClientFilters): boolean {
  return statusMatches(client, filters.status) && foldForSearch(client.name).includes(foldedQuery(filters.search))
}

/** The clients that pass both filters, in the order given (sort first with `compareClients`). */
export function filterClients<T extends Pick<Client, 'name' | 'active'>>(clients: readonly T[], filters: ClientFilters): T[] {
  const query = foldedQuery(filters.search) // once, not per row
  return clients.filter(c => statusMatches(c, filters.status) && foldForSearch(c.name).includes(query))
}

/**
 * Up to two capitals for the desktop avatar: the first letter or digit of each of the first two words that start
 * with one, so "Sam & Dana Coyle" gives "SD" (a lone "&" is skipped: UX U6). Decorative. Empty when no word qualifies.
 */
export function clientInitials(name: string): string {
  const initials: string[] = []
  for (const word of name.split(/\s+/u)) {
    const first = word.match(/^[\p{L}\p{N}]/u)?.[0]
    if (first) initials.push(first.toUpperCase())
    if (initials.length === 2) break
  }
  return initials.join('')
}
