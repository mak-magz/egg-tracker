// Order writes (feature 05 §3.5): create, update, status move, cancel, close short, deliver. A thin wrapper: the
// logic (guards, the submission-id rule, applying the reply) is in app/utils/order-mutations.ts. Each call
// resolves to { ok, data } | { ok: false, error } | null (null: that change is already running). On success the
// reply is put into the shared list (useOrders), so every reader follows with no reload.
//
// Ordering never changes stock (AC10), so only a DELIVERY touches the on-hand cache and the Sales list: it creates a
// real sale. `afterDelivery` does both quietly (a Sales list that was never opened has nothing to refresh).
import type { OrderApi } from '~/utils/order-mutations'

export function useOrderMutations() {
  const api = useApi()
  const { upsert, reload } = useOrders()
  return createOrderMutations({ api: api as OrderApi, upsert, reload })
}

/** For components that receive a single shared instance as a prop (list, detail, dialogs). */
export type OrderMutations = ReturnType<typeof useOrderMutations>

/** After a delivery (or a void of a delivery): the touched sizes' on-hand figures and the Sales list are stale. */
export function useAfterDelivery() {
  const onHand = useOnHand()
  const sales = useSales()
  return function afterDelivery(sizeIds: readonly string[]) {
    void onHand.invalidate(sizeIds)
    if (sales.hasList.value) void sales.reload()
  }
}
