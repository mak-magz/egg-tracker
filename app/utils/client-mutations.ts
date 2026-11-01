// The logic behind useClientMutations() (feature 03 §3.4), kept free of Nuxt auto-imports so tests/unit can
// drive it with a stubbed `$api`. Every call is one request; each returns { ok, data } or { ok: false, error }
// and never throws.
//
// Guards (UX R1, AC15):
//   - add and update share ONE in-flight guard per form instance: a call made while one runs resolves to null,
//     so many taps on Save send one request.
//   - archive and restore are guarded PER CLIENT ID, because other rows stay usable while one runs.
// Add retry rule (feature 01 §3.4, feature 02): one submission id per form opening, reused on a retry of the
// SAME normalised payload (name, phone AND price), replaced when any changes. The server compares
// the whole payload, so reusing an id for a changed payload would be refused.
import { ref, readonly } from 'vue'
import type {
  AddClientRequest,
  AddClientResponse,
  Client,
  ClientChangeResponse,
  UpdateClientRequest,
} from '#shared/types/api'
import { normalizeClientName, normalizeClientPhone } from '#shared/utils/client-name'
import { mapClientError } from './client-errors'
import type { ClientError } from './client-errors'

/**
 * Client timeout for writes. A hung request fails into the normal "Couldn't save" + retry path instead of
 * spinning forever; a retry is safe (add reuses its submissionId; edit and mark are idempotent: §3.1).
 */
export const CLIENT_WRITE_TIMEOUT_MS = 20_000

/** The part of `$api` (a `$fetch` instance) these calls use. */
export type ClientApi = <T>(url: string, opts?: { method?: string, body?: unknown, timeout?: number }) => Promise<T>

export type ClientResult<T> = { ok: true, data: T } | { ok: false, error: ClientError } | null

/** The editable fields, as the form hands them over: already tidied and parsed. `null` = none. */
export interface ClientInput {
  name: string
  phone: string | null
  defaultPrice?: number | null
}

export interface ClientMutationDeps {
  api: ClientApi
  /** Puts a client the server just returned into the list (useClients().upsert). */
  upsert: (client: Client) => void
  /** A quiet re-read of the whole list (useClients().load({ silent: true })). */
  reload: () => Promise<unknown>
  /** Test seam; defaults to crypto.randomUUID. */
  newId?: () => string
}

/** Two payloads are the same intent when the tidied name, phone and price (to the cent) are equal. */
function payloadKey(input: ClientInput): string {
  return JSON.stringify([
    normalizeClientName(input.name),
    normalizeClientPhone(input.phone),
    input.defaultPrice == null ? null : Math.round(input.defaultPrice * 100),
  ])
}

export function createClientSubmissionTracker(newId: () => string = () => crypto.randomUUID()) {
  let id = newId()
  let key: string | null = null
  return {
    reset() {
      id = newId()
      key = null
    },
    idFor(input: ClientInput): string {
      const next = payloadKey(input)
      if (key !== null && key !== next) id = newId()
      key = next
      return id
    },
  }
}

export function createClientMutations(deps: ClientMutationDeps) {
  const { api, upsert, reload } = deps
  const submissions = createClientSubmissionTracker(deps.newId)
  /** An add or an update is being saved (one per form). */
  const saving = ref(false)
  /** Ids of the clients whose mark inactive / active is running. */
  const pendingIds = ref<readonly string[]>([])

  /** What to do after a failed write besides telling the owner: keep the list honest (feature 03 §3.4). */
  function afterFailure(error: ClientError) {
    // Never awaited: the owner's message must not wait on a second request, and a failed read changes nothing.
    if (error.kind === 'changed') {
      // The reply carries the client as it is now: show it at once, then read the rest.
      if (error.client) upsert(error.client)
      void reload().catch(() => undefined)
    }
    else if (error.kind === 'name_taken') {
      // The list catches up: the client that holds the name may have been made elsewhere (feature 02 QA N5).
      void reload().catch(() => undefined)
    }
    else if (error.kind === 'not_found') {
      // Clients can't be deleted, so nothing is removed; just read the list again.
      void reload().catch(() => undefined)
    }
  }

  async function runForm<T extends { client: Client }>(call: () => Promise<T>): Promise<ClientResult<T>> {
    if (saving.value) return null
    saving.value = true
    try {
      const data = await call()
      upsert(data.client)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapClientError(e)
      afterFailure(error)
      return { ok: false, error }
    }
    finally {
      saving.value = false
    }
  }

  async function runForClient(id: string, call: () => Promise<ClientChangeResponse>): Promise<ClientResult<ClientChangeResponse>> {
    if (pendingIds.value.includes(id)) return null
    pendingIds.value = [...pendingIds.value, id]
    try {
      const data = await call()
      upsert(data.client)
      return { ok: true, data }
    }
    catch (e) {
      const error = mapClientError(e)
      afterFailure(error)
      return { ok: false, error }
    }
    finally {
      pendingIds.value = pendingIds.value.filter(x => x !== id)
    }
  }

  const path = (id: string) => `/api/clients/${encodeURIComponent(id)}`

  return {
    saving: readonly(saving),
    pendingIds: readonly(pendingIds),
    /** Call when a form opens: the next add gets a fresh submission id. */
    resetAdd: () => submissions.reset(),
    add(input: ClientInput) {
      const body: AddClientRequest = {
        submissionId: submissions.idFor(input),
        name: input.name,
        phone: input.phone,
        defaultPrice: input.defaultPrice ?? null,
      }
      return runForm<AddClientResponse>(() => api<AddClientResponse>('/api/clients', { method: 'POST', body, timeout: CLIENT_WRITE_TIMEOUT_MS }))
    },
    /** Replaces the fields of `client`, sending back the version the form was opened with (AC19). */
    update(client: Pick<Client, 'id' | 'version'>, input: ClientInput) {
      const body: UpdateClientRequest = {
        version: client.version,
        name: input.name,
        phone: input.phone,
        defaultPrice: input.defaultPrice ?? null,
      }
      return runForm<ClientChangeResponse>(() => api<ClientChangeResponse>(path(client.id), { method: 'PUT', body, timeout: CLIENT_WRITE_TIMEOUT_MS }))
    },
    archive(id: string) {
      return runForClient(id, () => api<ClientChangeResponse>(`${path(id)}/archive`, { method: 'POST', timeout: CLIENT_WRITE_TIMEOUT_MS }))
    },
    restore(id: string) {
      return runForClient(id, () => api<ClientChangeResponse>(`${path(id)}/restore`, { method: 'POST', timeout: CLIENT_WRITE_TIMEOUT_MS }))
    },
  }
}
