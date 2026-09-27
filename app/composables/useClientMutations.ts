// Client writes (feature 03 §3.4): add, edit, mark inactive, mark active. A thin wrapper: the logic (in-flight
// guards, the add retry rule, applying the reply, refreshing after a conflict) is in app/utils/client-mutations.ts,
// where tests can drive it with a stubbed `$api`. Each call resolves to { ok, data } | { ok: false, error } | null
// (null: that change is already running). On success the reply is put into the shared list (useClients), so every
// reader, this screen and later the Sales picker, follows with no reload.
import type { ClientApi } from '~/utils/client-mutations'

export function useClientMutations() {
  const api = useApi()
  const { upsert, load } = useClients()
  return createClientMutations({ api: api as ClientApi, upsert, reload: () => load({ silent: true }) })
}
