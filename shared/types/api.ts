// Shared API contract (docs/features/00-project-scaffold.md §3.4). The frontend builds against these
// exact shapes; change them only together with the feature doc.

// 'conflict' (409) is new in feature 02 (docs/features/02-farm-settings.md §3.3).
export type ApiErrorCode = 'unauthenticated' | 'no_farm' | 'validation_failed' | 'not_found' | 'conflict' | 'internal'

/** Why a 'conflict' (409) happened. The UI has copy for each (feature 02 §2.5 "Copy"). */
export type ApiErrorReason = 'name_taken' | 'last_active_size' | 'sizes_changed'

/** The size that already has the name being saved (AC4). `archived` picks "Restore it instead". */
export interface SizeNameMatch { id: string, name: string, archived: boolean }

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
  /** With reason 'name_taken'. */
  existing?: SizeNameMatch
  /** With 'conflict' and a 404 on a size: the farm's CURRENT sizes, so the screen refreshes with no second request. Absent if that read failed. */
  sizes?: FarmSize[]
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
