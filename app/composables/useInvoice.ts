// The invoice page's one owner of the load (feature 07 §3.4). `state` is a LOCAL shallowRef, deliberately not
// useState: nothing goes into the SSR payload or storage and nothing outlives the page (AC18, AC23). The client's
// name is joined here in the browser from the client list; it never rides on a sale response.
import type { SaleResponse } from '#shared/types/api'
import { resolveInvoice } from '~/utils/invoice-load'
import type { InvoiceState } from '~/utils/invoice-load'

export function useInvoice(id: string) {
  const api = useApi()
  const me = useMe()
  const { farm } = useFarm()
  const clients = useClients()

  const state = shallowRef<InvoiceState>({ status: 'loading' })
  // A slower earlier call, or a second tap on Try again, is dropped.
  let seq = 0

  async function load(opts: { force?: boolean } = {}) {
    const mine = ++seq
    state.value = { status: 'loading' }
    const next = await resolveInvoice(id, {
      ensureFarm: async () => {
        if (opts.force || !farm.value) await me.ensure({ force: opts.force })
        return farm.value !== null
      },
      getSale: sid => api<SaleResponse>(`/api/sales/${encodeURIComponent(sid)}`),
      loadClients: () => clients.load({ silent: clients.hasList.value }),
      clients: () => clients.clients.value,
    })
    if (mine === seq) state.value = next
  }

  const retry = () => load({ force: true })

  return { state, load, retry }
}
