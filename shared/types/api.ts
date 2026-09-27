// Shared API contract (docs/features/00-project-scaffold.md §3.4). The frontend builds against these
// exact shapes; change them only together with the feature doc.

// 'conflict' (409) is new in feature 02 (docs/features/02-farm-settings.md §3.3).
export type ApiErrorCode = 'unauthenticated' | 'no_farm' | 'validation_failed' | 'not_found' | 'conflict' | 'internal'

/** Why a 'conflict' (409) happened. The UI has copy for each (feature 02 §2.5 "Copy"). */
export type ApiErrorReason = 'name_taken' | 'last_active_size' | 'sizes_changed' | 'client_limit' | 'client_changed'

/**
 * The row that already has the name being saved (sizes, feature 02 AC4; clients, feature 03 AC11).
 * `archived` picks "Restore it instead" for a size, and "marked inactive, mark it active" for a client.
 */
export interface NameMatch { id: string, name: string, archived: boolean }
/** Kept so feature 02 code still imports it. */
export type SizeNameMatch = NameMatch

/**
 * The `data` payload of every error our server routes throw:
 * `createError({ statusCode, statusMessage, data: ApiErrorData })`.
 * On the client, read it from `FetchError.data.data` (Nitro nests `data` inside the error body).
 */
export interface ApiErrorData {
  code: ApiErrorCode
  /** Per-field messages when `code === 'validation_failed'`. */
  fields?: Record<string, string>
  /** With code 'conflict'. */
  reason?: ApiErrorReason
  /** With reason 'name_taken'. Absent if the lookup failed. */
  existing?: NameMatch
  /** With 'conflict' and a 404 on a size: the farm's CURRENT sizes, so the screen refreshes with no second request. Absent if that read failed. */
  sizes?: FarmSize[]
  /** With reason 'client_changed' (feature 03 AC19): the client as it is NOW, so the row updates with no second request. Absent if that read failed. */
  client?: Client
}

/**
 * A farm's egg size (per-farm data, feature 01 D10). Colour comes from `colorSlot` (UX R2), never from position.
 * `sortOrder` is compact (0..n-1) with active sizes first (feature 02 D7).
 */
export interface FarmSize {
  id: string
  name: string
  sortOrder: number
  colorSlot: number
  /** false once archived (feature 02). Archived sizes still label past days; the Log form offers active ones only. */
  active: boolean
}

export interface FarmSummary {
  id: string
  name: string
  /** Per-farm setting (>= 1). Never hardcode 30 in the app; read it from here. */
  eggsPerTray: number
  /** ALL of the farm's sizes (active + archived), sorted by sortOrder, name. New in feature 01. */
  sizes: FarmSize[]
  /**
   * The farm's currency, an ISO 4217 code such as 'PHP' (feature 03 AC35). Any three capital letters may arrive;
   * show prices through `formatPrice(amount, currency)` (shared/utils/price.ts), which treats an unknown code as PHP.
   */
  currency: string
}

/** `GET /api/me`. `farm` is null when the signed-in user has no farm membership (AC12). */
export interface MeResponse {
  email: string
  farm: FarmSummary | null
}

// ---- Production (docs/features/01-production-logging.md §3.3) ----
// Quantities are always egg counts. Trays exist only in the UI (shared/utils/quantity.ts).

/** 'YYYY-MM-DD', the owner's local calendar date. */
export type IsoDate = string

export interface ProductionSizeAmount { sizeId: string, eggs: number }

/** One day's production. `good` has only sizes with eggs > 0, in the farm's size order. */
export interface ProductionDay {
  date: IsoDate
  good: ProductionSizeAmount[]
  /** Sum of `good[].eggs`. Rejects are NOT included (AC16). */
  goodTotal: number
  /** Unsized rejects for the day; 0 when none. */
  rejects: number
}

/** GET /api/production/days */
export interface ProductionDaysResponse {
  /** Whether the farm has any production at all, ignoring the range (AC27 vs AC28). */
  hasAny: boolean
  /** Days in range that have production, newest first. */
  days: ProductionDay[]
}

/** GET /api/production/days/:date */
export interface ProductionDayResponse { day: ProductionDay | null }

/** The amounts in one save. Zero lines may be sent and are ignored. */
export interface ProductionAmounts {
  good: ProductionSizeAmount[]
  rejects: number
}

/** POST /api/production/entries (add to the day). */
export interface LogProductionRequest extends ProductionAmounts {
  /** A UUID generated per form opening and reused on retries of the SAME payload (§3.4 "Retry rule"). */
  submissionId: string
  date: IsoDate
}
export interface LogProductionResponse {
  day: ProductionDay
  /** The date already had production before this save ("Added to…" vs "Logged…" toast). */
  hadProductionBefore: boolean
  /** true when this submissionId had already been applied; nothing new was added. */
  replayed: boolean
}

/** PUT /api/production/days/:date (Edit day: replaces the day). */
export type ReplaceProductionDayRequest = ProductionAmounts
export interface ReplaceProductionDayResponse { day: ProductionDay }

/** DELETE /api/production/days/:date */
export interface DeleteProductionDayResponse { removed: ProductionDay }

// ---- Sizes (docs/features/02-farm-settings.md §3.3) ----
// No egg counts here. Validation limits and messages are in shared/constants/sizes.ts.

/** GET /api/sizes: ALL sizes, active first then archived, each group in the farm's order. */
export interface SizesResponse { sizes: FarmSize[] }
/** POST /api/sizes (add at the end of the active list). `submissionId`: a UUID per form opening, reused on a retry of the SAME name. */
export interface AddSizeRequest { submissionId: string, name: string }
/** PATCH /api/sizes/:id */
export interface RenameSizeRequest { name: string }
/** PUT /api/sizes/order: `order` is the wanted FULL order of the active sizes, `sizeId` the one that was moved. Never a step. */
export interface ReorderSizesRequest { sizeId: string, order: string[] }
/**
 * Every mutation (add, rename, reorder, archive, restore) returns the whole updated list and the id of the
 * size that changed (for the highlight and the toast). For add, a replayed submissionId returns the first size.
 */
export interface SizeChangeResponse { sizes: FarmSize[], changedId: string }

// ---- Clients (docs/features/03-clients.md §3.3) ----
// No egg counts here. Limits and messages are in shared/constants/clients.ts. Prices are shown through shared/utils/price.ts.

/** One customer of the farm. The price is the number the owner typed, PER TRAY, in the farm's currency. Never a tenant id. */
export interface Client {
  id: string
  name: string
  phone: string | null
  defaultPrice: number | null
  /** false = "Inactive" in the UI (archived_at is set). Inactive clients keep their past sales. */
  active: boolean
  /** Changes on every real edit or status change. Send it back with an edit (AC19). */
  version: number
}

/** GET /api/clients: ALL clients, active and inactive, in NO promised order (sort with `compareClients`). */
export interface ClientsResponse { clients: Client[] }
/** POST /api/clients. `submissionId`: a UUID per form opening, reused on a retry of the SAME name, phone and price. Omitted phone or price means none. */
export interface AddClientRequest { submissionId: string, name: string, phone?: string | null, defaultPrice?: number | null }
export interface AddClientResponse {
  client: Client
  /** true when this submissionId had already been applied; nothing new was created and `client` is the first one. */
  replayed: boolean
}
/** PUT /api/clients/:id: replaces the three fields (all keys required; null clears). `version` is the client's version when the form opened. */
export interface UpdateClientRequest { version: number, name: string, phone: string | null, defaultPrice: number | null }
/** PUT, archive and restore: `changed` is false when there was nothing to do (already in that state, or the same values). */
export interface ClientChangeResponse { client: Client, changed: boolean }
