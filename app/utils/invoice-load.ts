// The invoice page's load rules (feature 07 §3.4 "useInvoice"), pure so tests drive them with fakes.
// 404 and 400 (a bad id) are both "not found" (AC16). A sale with a client whose name can't be resolved is an
// error, never "Walk-in sale" (D13). Never logs, never throws.
import type { Client, Sale, SaleResponse } from '#shared/types/api'

export type InvoiceState
  = | { status: 'loading' }
    | { status: 'ready', sale: Sale, clientName: string | null }
    | { status: 'not_found' }
    | { status: 'error' }

export interface InvoiceDeps {
  /** Resolves true when the farm summary is available. */
  ensureFarm: () => Promise<boolean>
  getSale: (id: string) => Promise<SaleResponse>
  /** Loads the client list; 'ok' only on a fresh successful read. */
  loadClients: () => Promise<'ok' | 'error' | 'stale'>
  clients: () => readonly Pick<Client, 'id' | 'name'>[]
}

function statusOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const err = e as { statusCode?: unknown, status?: unknown }
  const code = err.statusCode ?? err.status
  return typeof code === 'number' ? code : undefined
}

export async function resolveInvoice(id: string, deps: InvoiceDeps): Promise<InvoiceState> {
  try {
    if (!(await deps.ensureFarm())) return { status: 'error' }
    let res: SaleResponse
    try {
      res = await deps.getSale(id)
    }
    catch (e) {
      const code = statusOf(e)
      return code === 404 || code === 400 ? { status: 'not_found' } : { status: 'error' }
    }
    const sale = res?.sale
    if (!sale || !Array.isArray(sale.lines) || sale.lines.length === 0) return { status: 'error' }
    if (sale.clientId === null) return { status: 'ready', sale, clientName: null }
    if ((await deps.loadClients()) !== 'ok') return { status: 'error' }
    const client = deps.clients().find(c => c.id === sale.clientId)
    return client ? { status: 'ready', sale, clientName: client.name } : { status: 'error' }
  }
  catch {
    return { status: 'error' }
  }
}
