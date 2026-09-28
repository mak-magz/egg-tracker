// Sale writes (feature 04 §3.4): create, update, mark delivered, mark as pending, void, delete. A thin
// wrapper: the logic (guards, the submission-id rule, applying the reply) is in app/utils/sale-mutations.ts.
// Each call resolves to { ok, data } | { ok: false, error } | null (null: that change is already running).
// On success the reply is put into (or removed from) the shared list (useSales), so every reader follows
// with no reload.
import type { SaleApi } from '~/utils/sale-mutations'

export function useSaleMutations() {
  const api = useApi()
  const { upsert, remove, reload } = useSales()
  return createSaleMutations({ api: api as SaleApi, upsert, removeFromList: remove, reload })
}

/** For components that receive a single shared instance as a prop (list, detail, dialogs). */
export type SaleMutations = ReturnType<typeof useSaleMutations>
