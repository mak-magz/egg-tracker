<!--
  Orders (feature 05). UX: docs/features/05-orders.md §2.5; technical design §3.4/§3.5. Filters -> the server list
  (table when wide, cards when narrow). The top-bar "Add order" button (md+) and the FAB (<md) come from the layout via
  `primaryAction`. The list is fetched on the client after mount (personal data: an order points at a client, AC53),
  lives in memory only (useOrders), and every filter is a page-local ref that never touches the URL (AC4, AC53).
  One shared useOrderMutations() instance drives every status/cancel/close/deliver action from the list, the detail
  and their dialogs, so a card and its detail never fight over whose spinner is showing (O-R1); OrderForm owns its own
  create/update saving state. Deliveries open their SALE on top of the order detail, read-only (D3/D10).
-->
<script setup lang="ts">
import { useDebounceFn, useEventListener } from '@vueuse/core'
import type { IsoDate, Order, OrderDelivery, OrderDetail as OrderDetailData, OrderManualStatus, OrderResponse, Sale, SaleResponse } from '#shared/types/api'
import { ORDER_STATUS_LABEL } from '#shared/utils/order-status'
import type { OrderDeliveredEvent } from '~/components/DeliverOrderDialog.vue'
import type { OrderSavedEvent } from '~/components/OrderForm.vue'
import { ORDER_COPY } from '~/utils/order-copy'
import { activeFilterCount as countActiveFilters, defaultOrdersFilters, isFiltering } from '~/utils/order-list'
import type { OrdersFilters } from '~/utils/order-list'
import { createTodayTracker } from '~/utils/today-tracker'

definePageMeta({
  primaryAction: { label: 'Add order', ariaLabel: 'Add order', icon: 'i-lucide-plus', fab: true },
})

const api = useApi()
const toast = useToast()
const primary = usePrimaryAction()
const list = useOrders()
const mutations = useOrderMutations()
const afterDelivery = useAfterDelivery()
const clients = useClients()
const stack = useDetailStack()

// The device's local "today" (feature 01 §3.8 D13): SSR can't know it, kept current while the screen stays open.
const tracker = createTodayTracker()
const today = ref<IsoDate>(tracker.current)
function syncToday() {
  if (tracker.refresh()) today.value = tracker.current
}

// ---- Filters (memory only: AC4, AC53). Reset on a fresh visit to the screen. -------------------------------
const filters = reactive<OrdersFilters>(defaultOrdersFilters())
const dateRangeError = computed(() => (filters.from && filters.to && filters.from > filters.to ? ORDER_COPY.dateRangeInvalid : null))
const activeFilterCount = computed(() => countActiveFilters(filters))
const filtering = computed(() => isFiltering(filters))

const debouncedLoad = useDebounceFn(() => {
  if (dateRangeError.value) return
  void list.load({ ...filters })
}, 300)

watch(filters, debouncedLoad, { deep: true })

function clearFilters() {
  Object.assign(filters, defaultOrdersFilters())
  void focusControl('view:open')
}

// ---- Load states (AC6) --------------------------------------------------------------------------------------
const loadFailed = computed(() => list.status.value === 'error')
const loading = computed(() => !list.hasList.value && !loadFailed.value)
const refreshing = computed(() => list.status.value === 'refreshing')
const firstUse = computed(() => list.hasList.value && !list.hasAny.value)
const noMatch = computed(() => list.hasList.value && list.hasAny.value && list.orders.value.length === 0)
const openEmpty = computed(() => noMatch.value && !filtering.value)

const retrying = ref(false)
async function retryLoad() {
  retrying.value = true
  await list.load({ ...filters })
  retrying.value = false
}

watch(() => list.refreshFailed.value, (now2, before) => {
  if (now2 > before) errorToast('orders-refresh-failed', ORDER_COPY.refreshFailed, () => void list.load({ ...filters }))
})

const loadingMore = list.loadingMore
async function showMore() {
  const result = await list.loadMore()
  if (result === 'error') errorToast('orders-more-failed', ORDER_COPY.loadMoreFailed, showMore)
}

const clientFilterOptions = computed(() => clients.sorted.value.map(c => ({ id: c.id, name: c.name, inactive: !c.active })))
function clientLabel(order: Order): string {
  const c = clients.sorted.value.find(x => x.id === order.clientId)
  if (!c) return ORDER_COPY.clientUnknown
  return c.active ? c.name : ORDER_COPY.clientInactiveOption(c.name)
}

// ---- Highlight / scroll / focus ------------------------------------------------------------------------------
const highlightedId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
function flash(id: string) {
  clearTimeout(highlightTimer)
  highlightedId.value = null
  void nextTick(() => {
    highlightedId.value = id
    highlightTimer = setTimeout(() => {
      highlightedId.value = null
    }, 1600)
  })
}
onBeforeUnmount(() => clearTimeout(highlightTimer))

function reducedMotion(): boolean {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
async function reveal(id: string) {
  await nextTick()
  document.querySelector(`[data-order-row="${id}"]`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
}
async function focusControl(...keys: string[]) {
  await nextTick()
  for (const key of keys) {
    const el = document.querySelector<HTMLElement>(`[data-order-focus="${key}"]`)
    if (el && !(el as HTMLButtonElement).disabled) {
      el.focus({ preventScroll: true })
      return
    }
  }
}
/** The card that follows `id` (or precedes it): where focus goes when a card leaves the view (States, "Row left the view"). */
function neighbourOf(id: string): string | null {
  const rows = list.orders.value
  const idx = rows.findIndex(o => o.id === id)
  return rows[idx + 1]?.id ?? rows[idx - 1]?.id ?? null
}
function focusAfterAction(id: string, neighbour: string | null) {
  void focusControl(`deliver:${id}`, `menu:${id}`, `open:${id}`, ...(neighbour ? [`open:${neighbour}`] : []), 'view:open')
}

function hiddenNote(order: Order): string {
  if (list.isVisible(order)) return ''
  return filters.view === 'open' ? ORDER_COPY.hiddenByOpenFilter : ORDER_COPY.hiddenByFilters
}

function errorToast(id: string, title: string, retry?: () => void) {
  toast.add({
    id,
    title,
    color: 'error',
    icon: 'i-lucide-circle-alert',
    duration: 0,
    close: { class: 'size-11 justify-center' },
    actions: retry
      ? [{
          label: ORDER_COPY.tryAgain,
          color: 'neutral',
          variant: 'outline',
          size: 'lg',
          class: 'min-h-11',
          onClick: () => {
            toast.remove(id)
            retry()
          },
        }]
      : undefined,
  })
}

/** AC20: the order changed (or can no longer be changed) elsewhere. The list took the order the server sent; refresh the rest. */
function onChangedElsewhere() {
  errorToast('orders-changed', ORDER_COPY.changedElsewhere)
  void list.reload()
  if (detailOrder.value) void loadDetail(detailOrder.value.id, { quiet: true })
}

// ---- Detail overlay (flow G) ---------------------------------------------------------------------------------
const detailOpen = ref(false)
const detailOrder = ref<Order | null>(null)
const detailDeliveries = ref<OrderDelivery[] | null>(null)
const deliveriesFailed = ref(false)
let detailSeq = 0

async function loadDetail(id: string, opts: { quiet?: boolean } = {}): Promise<OrderDetailData | null> {
  const seq = ++detailSeq
  if (!opts.quiet) {
    detailDeliveries.value = null
    deliveriesFailed.value = false
  }
  try {
    const res = await api<OrderResponse>(`/api/orders/${encodeURIComponent(id)}`)
    if (seq !== detailSeq) return null
    if (detailOrder.value === null || detailOrder.value.id === id) {
      detailOrder.value = res.order
      detailDeliveries.value = res.order.deliveries
      deliveriesFailed.value = false
    }
    list.upsert(res.order)
    return res.order
  }
  catch {
    if (seq === detailSeq && !opts.quiet) deliveriesFailed.value = true
    return null
  }
}

function openDetail(order: Order) {
  detailOrder.value = order
  detailOpen.value = true
  void loadDetail(order.id)
}

/** Every mutation answers with the whole order: keep an open detail in step with it, deliveries included. */
function syncDetail(order: Order | OrderDetailData) {
  if (detailOrder.value?.id !== order.id) return
  detailSeq++
  detailOrder.value = order
  if ('deliveries' in order) {
    detailDeliveries.value = order.deliveries
    deliveriesFailed.value = false
  }
}

watch(() => list.orders.value, (rows) => {
  const current = detailOrder.value
  if (!current) return
  const fresh = rows.find(o => o.id === current.id)
  if (fresh && fresh.version !== current.version) {
    detailOrder.value = fresh
    void loadDetail(fresh.id, { quiet: true })
  }
})

watch(detailOpen, (isOpen) => {
  if (!isOpen) {
    detailSeq++
    stack.clear()
  }
})

const detailBusy = computed(() => (detailOrder.value ? mutations.pendingIds.value.includes(detailOrder.value.id) : false))
const pendingStatus = ref<{ id: string, status: OrderManualStatus } | null>(null)
const detailBusyStatus = computed(() => (pendingStatus.value && pendingStatus.value.id === detailOrder.value?.id ? pendingStatus.value.status : null))

// ---- Add / Edit order overlay (flows A, D) -------------------------------------------------------------------
type Opener = { kind: 'primary' } | { kind: 'empty' } | { kind: 'row', id: string }
const formOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editOrder = ref<Order | null>(null)
const editDeliveries = ref<readonly OrderDelivery[] | null>(null)
let opener: Opener = { kind: 'primary' }

function openAdd(from: Opener = { kind: 'primary' }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'add'
  editOrder.value = null
  editDeliveries.value = null
  formOpen.value = true
}
primary.onPrimaryAction(() => openAdd({ kind: 'primary' }))

function openEdit(order: Order, from: Opener = { kind: 'row', id: order.id }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'edit'
  editOrder.value = order
  // AC57 needs the deliveries' dates: reuse the open detail's, else fetch them while the form is opening.
  editDeliveries.value = detailOrder.value?.id === order.id ? detailDeliveries.value : null
  if (editDeliveries.value === null) {
    void api<OrderResponse>(`/api/orders/${encodeURIComponent(order.id)}`)
      .then((res) => {
        if (editOrder.value?.id === res.order.id) editDeliveries.value = res.order.deliveries
      })
      .catch(() => undefined)
  }
  formOpen.value = true
}

async function onFormClosed() {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  if (opener.kind === 'row') return focusControl(`open:${opener.id}`, `menu:${opener.id}`)
  if (opener.kind === 'empty') {
    const card = document.querySelector<HTMLElement>('[data-order-focus="empty-add"]')
    if (card) return card.focus({ preventScroll: true })
  }
  const visibleButton = [...document.querySelectorAll<HTMLElement>('[data-primary-action]')].find(el => el.getClientRects().length > 0)
  if (visibleButton) visibleButton.focus({ preventScroll: true })
}

async function onSaved(event: OrderSavedEvent) {
  if (event.kind === 'unchanged') return
  const order = event.order
  syncDetail(order)
  if (!list.isVisible(order)) {
    // AC16: if the current filters would hide the new/edited order, clear them so the owner sees it.
    Object.assign(filters, defaultOrdersFilters())
    await list.load({ ...filters })
  }
  const n = order.orderNumber
  const title = event.kind === 'created'
    ? ORDER_COPY.toastSaved(n)
    : event.becameFulfilled ? ORDER_COPY.toastUpdatedFulfilled(n) : ORDER_COPY.toastUpdated(n)
  toast.add({ title, icon: 'i-lucide-check' })
  flash(order.id)
  void reveal(order.id)
}

// ---- Status moves (flow C) -----------------------------------------------------------------------------------
async function moveStatus(order: Order, target: OrderManualStatus, from: 'row' | 'detail' = 'row') {
  pendingStatus.value = { id: order.id, status: target }
  const result = await mutations.setStatus(order.id, target)
  pendingStatus.value = null
  if (!result) return
  if (result.ok) {
    syncDetail(result.data.order)
    toast.add({ title: ORDER_COPY.toastStatus(order.orderNumber, ORDER_STATUS_LABEL[target]), icon: 'i-lucide-check' })
    flash(order.id)
    void focusControl(from === 'detail' ? `status:${target}` : `menu:${order.id}`, `open:${order.id}`)
    return
  }
  const kind = result.error.kind
  if (kind === 'order_closed' || kind === 'has_delivery' || kind === 'order_changed' || kind === 'not_found') {
    onChangedElsewhere()
    return
  }
  errorToast(`orders-status-${order.orderNumber}`, ORDER_COPY.actionFailed(order.orderNumber), () => void moveStatus(order, target, from))
}

// ---- Deliver (flow B) ----------------------------------------------------------------------------------------
const deliverOpen = ref(false)
const deliverOrder = ref<Order | null>(null)
let deliverNeighbour: string | null = null
function openDeliver(order: Order) {
  if (deliverOpen.value) return
  deliverOrder.value = order
  deliverNeighbour = neighbourOf(order.id)
  deliverOpen.value = true
}

function onDelivered(event: OrderDeliveredEvent) {
  const order = event.order
  afterDelivery(event.sizeIds)
  syncDetail(order)
  toast.add({
    title: `${ORDER_COPY.toastDelivered(event.saleNumber, order.orderNumber, ORDER_STATUS_LABEL[order.status].toLowerCase())}${hiddenNote(order)}`,
    icon: 'i-lucide-check',
  })
  if (list.isVisible(order)) {
    flash(order.id)
    void reveal(order.id)
  }
  focusAfterAction(order.id, deliverNeighbour)
}

function onDeliverClosed() {
  const id = deliverOrder.value?.id
  if (id) focusAfterAction(id, deliverNeighbour)
}

// ---- Cancel / Close short (flows E, F) -----------------------------------------------------------------------
const cancelOpen = ref(false)
const cancelTarget = ref<Order | null>(null)
let cancelNeighbour: string | null = null
function openCancel(order: Order) {
  cancelTarget.value = order
  cancelNeighbour = neighbourOf(order.id)
  cancelOpen.value = true
}
function onCancelled(order: OrderDetailData) {
  syncDetail(order)
  toast.add({ title: `${ORDER_COPY.toastCancelled(order.orderNumber)}${hiddenNote(order)}`, icon: 'i-lucide-check' })
  focusAfterAction(order.id, cancelNeighbour)
}

const closeShortOpen = ref(false)
const closeShortTarget = ref<Order | null>(null)
let closeNeighbour: string | null = null
function openCloseShort(order: Order) {
  closeShortTarget.value = order
  closeNeighbour = neighbourOf(order.id)
  closeShortOpen.value = true
}
function onClosedShort(order: OrderDetailData) {
  syncDetail(order)
  toast.add({ title: `${ORDER_COPY.toastClosedShort(order.orderNumber)}${hiddenNote(order)}`, icon: 'i-lucide-check' })
  focusAfterAction(order.id, closeNeighbour)
}

function onRefused(reason: 'has_delivery' | 'order_closed' | 'order_changed' | 'not_partial') {
  const message = reason === 'has_delivery' ? ORDER_COPY.cancelRefused : reason === 'not_partial' ? ORDER_COPY.closeRefused : ORDER_COPY.changedElsewhere
  errorToast(`orders-refused-${reason}`, message)
  void list.reload()
  if (detailOrder.value) void loadDetail(detailOrder.value.id, { quiet: true })
}

const cancelClientLabel = computed(() => (cancelTarget.value ? clientLabel(cancelTarget.value) : ''))
const closeClientLabel = computed(() => (closeShortTarget.value ? clientLabel(closeShortTarget.value) : ''))

// ---- Stacked read-only sale (flow H, D3/D10) ------------------------------------------------------------------
const saleOpen = ref(false)
const stackedSale = ref<Sale | null>(null)

function openDeliverySale(delivery: OrderDelivery) {
  stack.push({ kind: 'sale', id: delivery.saleId })
}

watch(() => stack.top.value, async (entry) => {
  if (!entry || entry.kind !== 'sale') {
    saleOpen.value = false
    return
  }
  stackedSale.value = null
  saleOpen.value = true
  try {
    const res = await api<SaleResponse>(`/api/sales/${encodeURIComponent(entry.id)}`)
    if (stack.top.value?.id === entry.id) stackedSale.value = res.sale
  }
  catch {
    if (stack.top.value?.id === entry.id) {
      saleOpen.value = false
      stack.pop()
      errorToast('orders-sale-open-failed', ORDER_COPY.stackedSaleFailed)
    }
  }
})

watch(saleOpen, (isOpen) => {
  if (!isOpen && stack.top.value) stack.pop()
})

async function openSaleInSales(sale: Sale) {
  await stack.handoffTo({ kind: 'sale', id: sale.id }, '/farm/sales')
}

// ---- Mount ----------------------------------------------------------------------------------------------------
onMounted(() => {
  syncToday()
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') syncToday()
  })
  useEventListener(window, 'focus', () => syncToday())
  void clients.load({ silent: clients.hasList.value })
  void list.load({ ...filters })
  // "Open in Orders" from the Sales screen hands an order over to open here, fully editable.
  const handoff = stack.takeHandoff('order')
  if (handoff) void openFromHandoff(handoff.id)
})

async function openFromHandoff(id: string) {
  const order = await loadDetail(id)
  if (order) {
    detailOrder.value = order
    detailOpen.value = true
  }
  else {
    errorToast('orders-handoff-failed', ORDER_COPY.loadFailedTitle)
  }
}

onBeforeUnmount(() => stack.clear())

// The FAB/Add button hides while any sheet or dialog is open (UX "Getting there").
watchEffect(() => {
  primary.hidden.value = formOpen.value || detailOpen.value || deliverOpen.value || cancelOpen.value || closeShortOpen.value || saleOpen.value
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPlaceholder
      v-if="loadFailed"
      icon="i-lucide-cloud-off"
      :title="ORDER_COPY.loadFailedTitle"
      :body="ORDER_COPY.loadFailedBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-refresh-cw"
        :label="ORDER_COPY.tryAgain"
        :loading="retrying"
        class="w-full justify-center sm:w-auto"
        @click="retryLoad"
      />
    </AppPlaceholder>

    <AppPlaceholder
      v-else-if="firstUse"
      icon="i-lucide-clipboard-list"
      :title="ORDER_COPY.firstUseTitle"
      :body="ORDER_COPY.firstUseBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-plus"
        data-order-focus="empty-add"
        :label="ORDER_COPY.addLabel"
        class="w-full justify-center sm:w-auto"
        @click="openAdd({ kind: 'empty' })"
      />
    </AppPlaceholder>

    <template v-else>
      <OrdersToolbar
        v-model:view="filters.view"
        v-model:client-id="filters.clientId"
        v-model:from="filters.from"
        v-model:to="filters.to"
        :client-options="clientFilterOptions"
        :disabled="loading"
        :filtering="filtering && !loading"
        :refreshing="refreshing"
        :active-filter-count="activeFilterCount"
        :shown="list.orders.value.length"
        :total="list.total.value"
        :date-range-error="dateRangeError"
        @clear="clearFilters"
      />

      <OrdersList
        :orders="list.orders.value"
        :today="today"
        :loading="loading"
        :highlighted-id="highlightedId"
        :busy-ids="mutations.pendingIds.value"
        @open="openDetail"
        @deliver="openDeliver"
        @edit="(o: Order) => openEdit(o)"
        @status="(o: Order, s: OrderManualStatus) => moveStatus(o, s)"
        @cancel="openCancel"
        @close-short="openCloseShort"
      >
        <template
          v-if="noMatch"
          #empty
        >
          <div
            v-if="openEmpty"
            class="flex flex-col items-center gap-3 p-10 text-center"
          >
            <p class="text-base font-semibold text-highlighted">
              {{ ORDER_COPY.openEmptyTitle }}
            </p>
            <p class="text-base text-muted">
              {{ ORDER_COPY.openEmptyBody }}
            </p>
            <UButton
              size="xl"
              icon="i-lucide-plus"
              data-order-focus="empty-add"
              :label="ORDER_COPY.addLabel"
              @click="openAdd({ kind: 'empty' })"
            />
          </div>
          <div
            v-else
            class="flex flex-col items-center gap-3 p-10 text-center"
          >
            <p class="text-base text-muted">
              {{ ORDER_COPY.noMatch }}
            </p>
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              :label="ORDER_COPY.clearFilters"
              @click="clearFilters"
            />
          </div>
        </template>
      </OrdersList>

      <UButton
        v-if="list.hasMore.value"
        color="neutral"
        variant="outline"
        size="xl"
        class="w-full justify-center"
        :label="ORDER_COPY.showMore"
        :loading="loadingMore"
        @click="showMore"
      />
    </template>

    <OrderFormOverlay
      v-model:open="formOpen"
      :mode="formMode"
      :order="editOrder"
      :deliveries="editDeliveries"
      :today="today"
      @saved="onSaved"
      @changed-elsewhere="onChangedElsewhere"
      @closed="onFormClosed"
    />

    <OrderDetail
      v-model:open="detailOpen"
      :order="detailOrder"
      :deliveries="detailDeliveries"
      :deliveries-failed="deliveriesFailed"
      :today="today"
      :busy="detailBusy"
      :busy-status="detailBusyStatus"
      @edit="(o: Order) => openEdit(o, { kind: 'row', id: o.id })"
      @deliver="openDeliver"
      @cancel="openCancel"
      @close-short="openCloseShort"
      @status="(o: Order, s: OrderManualStatus) => moveStatus(o, s, 'detail')"
      @open-sale="openDeliverySale"
      @retry-deliveries="detailOrder && loadDetail(detailOrder.id)"
    />

    <DeliverOrderDialog
      v-model:open="deliverOpen"
      :order="deliverOrder"
      :today="today"
      :mutations="mutations"
      @delivered="onDelivered"
      @stale="onChangedElsewhere"
      @closed="onDeliverClosed"
    />

    <CancelOrderDialog
      v-model:open="cancelOpen"
      :order="cancelTarget"
      :client-label="cancelClientLabel"
      :mutations="mutations"
      @cancelled="onCancelled"
      @refused="onRefused"
    />

    <CloseShortDialog
      v-model:open="closeShortOpen"
      :order="closeShortTarget"
      :client-label="closeClientLabel"
      :mutations="mutations"
      @closed-short="onClosedShort"
      @refused="onRefused"
    />

    <SaleDetail
      v-model:open="saleOpen"
      :sale="stackedSale"
      :today="today"
      readonly
      @open-elsewhere="openSaleInSales"
      @open-order="saleOpen = false"
    />
  </div>
</template>
