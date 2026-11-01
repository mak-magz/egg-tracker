// Shared API contract (docs/features/00-project-scaffold.md §3.4). The frontend builds against these
// exact shapes; change them only together with the feature doc.

// 'conflict' (409) is new in feature 02 (docs/features/02-farm-settings.md §3.3).
export type ApiErrorCode = 'unauthenticated' | 'no_farm' | 'validation_failed' | 'not_found' | 'conflict' | 'internal'

/** Why a 'conflict' (409) happened. The UI has copy for each (feature 02 §2.5 "Copy"; feature 04 §3.3 for the sales reasons). */
export type ApiErrorReason
  = | 'name_taken' | 'last_active_size' | 'sizes_changed' | 'client_limit' | 'client_changed'
  // Feature 04 (docs/features/04-sales.md §3.3).
    | 'sale_changed' | 'stock_short' | 'voided'
  // Feature 05 (docs/features/05-orders.md §3.3). 'not_pending' and 'not_complete' were retired with pending sales.
    | 'order_changed' | 'order_closed' | 'has_delivery' | 'not_partial' | 'over_delivery' | 'sale_locked'

/**
 * The row that already has the name being saved (sizes, feature 02 AC4; clients, feature 03 AC11).
 * `archived` picks "Restore it instead" for a size, and "marked inactive, mark it active" for a client.
 */
export interface NameMatch { id: string, name: string, archived: boolean }
/** Kept so feature 02 code still imports it. */
export type SizeNameMatch = NameMatch

/** A size short of stock (feature 04 AC26, AC35, AC42): what's on hand now and what this save needs. */
export interface ShortfallLine { sizeId: string, onHandEggs: number, neededEggs: number }

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
  /** With reason 'sale_changed' (feature 04 AC43): the sale as it is NOW. Absent if that read failed. */
  sale?: Sale
  /** With reason 'stock_short' (feature 04 AC26, AC35, AC42): only the SHORT sizes, farm order. Never empty when reason is 'stock_short'. */
  shortfall?: ShortfallLine[]
  /** With the order_* / has_delivery / not_partial / over_delivery reasons (feature 05): the order as it is NOW, so the screen refreshes with no second request. Absent if that read failed. */
  order?: OrderDetail
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
  deviceId?: string
  isFree?: boolean
  onboardingCompleted?: boolean
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

// ---- Sales (docs/features/04-sales.md §3.3) ----
export type SaleType = 'delivery' | 'on_site'

/** One line: a size, its eggs, its price PER TRAY, and its FROZEN total (never recomputed once saved, AC55). */
export interface SaleLine { sizeId: string, eggs: number, pricePerTray: number, lineTotal: number }
/** A line as sent in a request: no lineTotal (the server computes and freezes it). */
export interface SaleLineInput { sizeId: string, eggs: number, pricePerTray: number }

export interface Sale {
  id: string
  saleNumber: number | string
  type: SaleType
  clientId: string | null
  /** The one date: the day the eggs left the farm (feature 05 AC38, decision U1). */
  saleDate: IsoDate
  /** Set when this sale is a delivery made from an order (feature 05 AC27); null for a direct sale. */
  orderId: string | null
  /** The linked order's number (for "From order #n", AC39); null for a direct sale. */
  orderNumber: number | string | null
  lines: SaleLine[]
  /** Sum of lines[].lineTotal. Never stored; always agrees with the lines shown (AC22). */
  saleTotal: number
  /** Changes on every real edit or void. Send it back with an edit (AC43). */
  version: number
  /** Set once, never cleared (AC67, owner correction 2026-09-27). Non-null means this sale no longer counts toward
   * on-hand and accepts no further change. */
  voidedAt: IsoDate | null
}

/** GET /api/sales?from&to&type&clientId&limit&offset&includeVoided (all optional; includeVoided default false, AC68) */
export interface SalesListResponse {
  /** Whether the farm has ANY sale at all, ignoring every filter (AC46 vs AC10). */
  hasAny: boolean
  /** Total matches for the filters, ignoring limit/offset ("Showing x of n"). */
  total: number
  sales: Sale[]
}
export interface SaleResponse { sale: Sale }

/** POST /api/sales: a direct sale. Every sale has already left the farm on `saleDate` (feature 05 AC37, AC38). */
export interface CreateSaleRequest {
  submissionId: string
  type: SaleType
  saleDate: IsoDate
  clientId?: string | null
  lines: SaleLineInput[]
  /** true = "Record anyway" after a 409 stock_short (AC26). */
  confirmShortfall?: boolean
}
export interface CreateSaleResponse { sale: Sale, replayed: boolean }

/** PUT /api/sales/:id. Replaces the WHOLE sale (header + every line) -- the whole sale is always sent (AC40, AC64-66). */
export interface UpdateSaleRequest {
  version: number
  type: SaleType
  saleDate: IsoDate
  clientId?: string | null
  lines: SaleLineInput[]
  confirmShortfall?: boolean
}
/** `changed` false = nothing to do (already in that state / already matches what was asked, AC37, AC40, AC67). */
export interface SaleChangeResponse { sale: Sale, changed: boolean }
/** POST /api/sales/:id/void (AC67, AC68). One-way; never a shortfall check. Sales are void-only: there is no delete (feature 05 AC40). */
export interface VoidSaleRequest { version: number }
/** `order` is the linked order as it is NOW (recomputed in the same change, feature 05 AC35), or null for a direct sale. */
export interface VoidSaleResponse { sale: Sale, changed: boolean, order: OrderDetail | null }

export interface OnHandLine { sizeId: string, eggs: number }
/** GET /api/sales/on-hand?sizeId=...&sizeId=... (repeated) -- omit to get every size of the farm. */
export interface OnHandResponse { onHand: OnHandLine[] }

// ---- Inventory (docs/features/06-inventory.md §3.3) ----
/**
 * One size on the Inventory screen: the farm size (so the screen needs no join) plus its two figures, in eggs.
 * `onHandEggs` can be NEGATIVE (sales ahead of logged production). `owedEggs` is always >= 0.
 */
export interface InventorySize extends FarmSize { onHandEggs: number, owedEggs: number }
/**
 * GET /api/inventory. `sizes`: every ACTIVE size (farm order), then ARCHIVED sizes only if on-hand or owed is non-zero.
 * `hasAny` is false when the farm has no good production and no non-voided sale (the empty state).
 */
export interface InventoryResponse { hasAny: boolean, sizes: InventorySize[] }

// ---- Orders (docs/features/05-orders.md §3.3) ----
export type OrderStatus = 'requested' | 'confirmed' | 'ready' | 'partially_fulfilled' | 'fulfilled' | 'cancelled'
/** The three statuses an owner may set by hand (AC21). Everything else is set by deliveries, Close short or Cancel. */
export type OrderManualStatus = 'requested' | 'confirmed' | 'ready'
/** The list's status chips (AC4). 'open' = requested, confirmed, ready, partially_fulfilled. 'fulfilled' includes closed short. */
export type OrdersView = 'open' | 'all' | 'fulfilled' | 'cancelled'

/** One line of an order. Delivered / remaining are COMPUTED from the order's non-voided deliveries, never stored (AC32). */
export interface OrderLine {
  sizeId: string
  /** Ordered, in individual eggs. */
  orderedEggs: number
  /** Sum of this size's eggs on the order's non-voided deliveries. */
  deliveredEggs: number
  /** What is still owed. 0 on a Fulfilled, Cancelled or closed-short order. */
  remainingEggs: number
  /** Set when the order was closed short: the remainder dropped at that moment, fixed from then on (AC34, AC35). Otherwise 0. */
  droppedEggs: number
  pricePerTray: number
  /** Frozen at save (AC51). */
  lineTotal: number
}
/** A line as sent in a request: no lineTotal (the server computes and freezes it). Same shape as SaleLineInput. */
export interface OrderLineInput { sizeId: string, eggs: number, pricePerTray: number }

export interface Order {
  id: string
  orderNumber: number | string
  clientId: string
  orderDate: IsoDate
  wantedBy: IsoDate | null
  status: OrderStatus
  /** Non-null = Fulfilled (closed short): shown with that wording (AC34). One-way. */
  closedShortAt: IsoDate | null
  /** Non-null = Cancelled. One-way. */
  cancelledAt: IsoDate | null
  /** The old sale number when this order was converted from a pending sale (AC45). Null otherwise. */
  convertedFromSaleNumber: number | string | null
  lines: OrderLine[]
  /** Sum of lines[].lineTotal, computed at read time. */
  orderTotal: number
  /** Non-voided deliveries. > 0 locks the client and the delivered lines, and refuses Cancel (AC19, AC22). */
  deliveryCount: number
  /** Voided deliveries (shown in the detail; they do not count for any rule, owner decision G1). */
  voidedDeliveryCount: number
  /** Changes on every real change to the header, the lines OR the deliveries (stale check, AC20). */
  version: number
}

/** One drop of eggs against an order = one sale (AC27). */
export interface OrderDelivery {
  saleId: string
  saleNumber: number | string
  deliveredDate: IsoDate
  voidedAt: IsoDate | null
  lines: { sizeId: string, eggs: number }[]
}
export interface OrderDetail extends Order { deliveries: OrderDelivery[] }

/** GET /api/orders?view&clientId&from&to&limit&offset. view 'open' ignores limit/offset: every open order is returned (AC5). */
export interface OrdersListResponse {
  /** Whether the farm has ANY order, ignoring every filter (AC6). */
  hasAny: boolean
  /** Total matches for the filters, ignoring limit/offset. */
  total: number
  orders: Order[]
}
export interface OrderResponse { order: OrderDetail }

/** POST /api/orders */
export interface CreateOrderRequest {
  submissionId: string
  clientId: string
  orderDate: IsoDate
  wantedBy?: IsoDate | null
  lines: OrderLineInput[]
}
export interface CreateOrderResponse { order: OrderDetail, replayed: boolean }

/** PUT /api/orders/:id. Replaces the whole order (header + every line); the whole order is always sent (AC19). */
export interface UpdateOrderRequest {
  version: number
  clientId: string
  orderDate: IsoDate
  wantedBy?: IsoDate | null
  lines: OrderLineInput[]
}
/** `changed` false = nothing to do (already in that state / already matches what was asked). */
export interface OrderChangeResponse { order: OrderDetail, changed: boolean }

/** POST /api/orders/:id/status (AC21). */
export interface SetOrderStatusRequest { status: OrderManualStatus }
/** POST /api/orders/:id/close (AC34). `version` is the one the confirm dialog was built from. */
export interface CloseOrderRequest { version: number }
/** POST /api/orders/:id/cancel has no body (AC22). */

/** POST /api/orders/:id/deliver (AC24 to AC31). Lines with 0 eggs are simply left out. */
export interface DeliverOrderRequest {
  submissionId: string
  deliveredDate: IsoDate
  lines: { sizeId: string, eggs: number }[]
  /** true = "Deliver anyway" after a 409 stock_short (AC30). */
  confirmShortfall?: boolean
}
export interface DeliverOrderResponse { order: OrderDetail, sale: Sale, replayed: boolean }
