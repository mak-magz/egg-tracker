// Pure list updates for the client list kept by useClients() (feature 03 §3.4). No Nuxt auto-imports, so
// tests/unit can drive them directly. The list has no promised order (the screen sorts it with compareClients).
import type { Client } from '#shared/types/api'

/**
 * Puts one client into the list: replaces the row with the same id, or appends it. A reply that is OLDER than the
 * row already held (a smaller `version`, e.g. a slow mark-inactive reply that lands after a refresh) is ignored,
 * so the list never goes back in time. Returns a new array.
 */
export function upsertClient(list: readonly Client[], client: Client): Client[] {
  const index = list.findIndex(c => c.id === client.id)
  if (index === -1) return [...list, client]
  const held = list[index]!
  if (held.version > client.version) return [...list]
  const next = [...list]
  next[index] = client
  return next
}

/**
 * The list a read returned, with the clients this screen saved WHILE that read was in flight put back: a read that
 * started before an add can come back without the new client, and must not make it vanish.
 */
export function mergeRecent(fromServer: readonly Client[], recent: readonly Client[]): Client[] {
  let merged: Client[] = [...fromServer]
  for (const client of recent) merged = upsertClient(merged, client)
  return merged
}
