<!--
  Sales (feature 04; feature 05 AC37 to AC42). Design: docs/design/source/template.html (Sales screen, Log a sale
  dialog); UX: docs/features/04-sales.md §2.5 and docs/features/05-orders.md §2.5 "Sales screen after this feature".
  Filters -> the server-paged list (table when wide, cards when narrow). The top-bar "Add sale" button (md+) and the
  FAB (<md) come from the layout via `primaryAction`. The list is fetched on the client after mount (personal data:
  a sale points at a client, AC60), lives in memory only (useSales), and every filter is a page-local ref that never
  touches the URL (AC11). Every sale is a real, completed one: there is no status, no Mark delivered and no Delete;
  the only removal is Void. One shared useSaleMutations() instance drives void from the list, the detail and the
  dialog, so a row and its detail never fight over whose spinner is showing (R1); SaleForm owns its own
  create/update saving state. "From order #n" opens that order on top of the sale, read-only (D3/D10).
-->
<script setup lang="ts">
import { useDebounceFn, useEventListener } from '@vueuse/core'
import type { IsoDate, OrderDelivery, OrderDetail as OrderDetailData, OrderResponse, Sale, SaleResponse, VoidSaleResponse } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import type { SaleSavedEvent } from '~/components/SaleForm.vue'
import { SALE_COPY } from '~/utils/sale-copy'
import { createTodayTracker } from '~/utils/today-tracker'
import { defaultSalesFilters } from '~/composables/useSales'
import type { SalesFilters } from '~/composables/useSales'

definePageMeta({
  primaryAction: { label: 'Add sale', ariaLabel: 'Add sale', icon: 'i-lucide-plus', fab: true },
})

const api = useApi()
const toast = useToast()
const primary = usePrimaryAction()
const list = useSales()
const mutations = useSaleMutations()
const clients = useClients()
const onHand = useOnHand()
const stack = useDetailStack()
const { sizeById, trayEggs } = useFarm()

// The device's local "today" (feature 01 §3.8 D13): SSR can't know it, kept current while the screen stays
// open (today-tracker.ts, reused as-is).
const tracker = createTodayTracker()
const today = ref<IsoDate>(tracker.current)
function syncToday() {
  if (tracker.refresh()) today.value = tracker.current
}

// ---- Filters (memory only: AC8, AC11, AC60). Reset on a fresh visit to the screen. -----------------------
const filters = reactive<SalesFilters>(defaultSalesFilters())
const dateRangeError = computed(() => (filters.from && filters.to && filters.from > filters.to ? SALE_COPY.dateRangeInvalid : null))

/** The filters `Filters (n)` counts on a phone: Client and the date range (the Type chips are always on screen). */
const activeFilterCount = computed(() => (filters.clientId ? 1 : 0) + (filters.from || filters.to ? 1 : 0))
const filtering = computed(() => filters.type !== 'all' || activeFilterCount.value > 0)

const debouncedLoad = useDebounceFn(() => {
  if (dateRangeError.value) return
  void list.load({ ...filters })
}, 300)

watch(filters, debouncedLoad, { deep: true })

function clearFilters() {
  Object.assign(filters, defaultSalesFilters())
}

// ---- Load states (AC46, AC47, AC10) ------------------------------------------------------------------------
const loadFailed = computed(() => list.status.value === 'error')
const loading = computed(() => !list.hasList.value && !loadFailed.value)
const firstUse = computed(() => list.hasList.value && !list.hasAny.value)
const noMatch = computed(() => list.hasList.value && list.hasAny.value && list.sales.value.length === 0)

const retrying = ref(false)
async function retryLoad() {
  retrying.value = true
  await list.load({ ...filters })
  retrying.value = false
}

watch(() => list.refreshFailed.value, (now2, before) => {
  if (now2 > before) errorToast('sales-refresh-failed', SALE_COPY.refreshFailed, () => void list.load({ ...filters }))
})

const loadingMore = list.loadingMore
async function showMore() {
  const result = await list.loadMore()
  if (result === 'error') errorToast('sales-more-failed', SALE_COPY.loadMoreFailed, showMore)
}

// ---- Client options for filters/pickers (AC7, AC13) --------------------------------------------------------
const clientFilterOptions = computed(() => clients.sorted.value.map(c => ({ id: c.id, name: c.name, inactive: !c.active })))

// ---- Highlight / scroll / focus ---------------------------------------------------------------------------
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
  document.querySelector(`[data-sale-row="${id}"]`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
}
async function focusControl(...keys: string[]) {
  await nextTick()
  for (const key of keys) {
    const el = document.querySelector<HTMLElement>(`[data-sale-focus="${key}"]`)
    if (el && !(el as HTMLButtonElement).disabled) {
      el.focus({ preventScroll: true })
      return
    }
  }
}

function filterLabelFor(sale: Sale): string {
  if (sale.voidedAt) return SALE_COPY.showVoided
  if (filters.type !== 'all' && sale.type !== filters.type) return sale.type === 'delivery' ? SALE_COPY.typeDelivery : SALE_COPY.typeOnSite
  return SALE_COPY.typeAll
}

/** After a change: if the sale still matches the current filters, flash + reveal it; otherwise say why it left. */
function afterVisibleChange(sale: Sale, plainMessage: string) {
  if (list.isVisible(sale)) {
    toast.add({ title: plainMessage, icon: 'i-lucide-check' })
    flash(sale.id)
    void reveal(sale.id)
  }
  else if (sale.voidedAt) {
    toast.add({ title: SALE_COPY.hiddenByVoidedToggle(plainMessage), icon: 'i-lucide-check' })
  }
  else {
    toast.add({ title: SALE_COPY.hiddenByFilter(plainMessage, filterLabelFor(sale)), icon: 'i-lucide-check' })
  }
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
          label: SALE_COPY.tryAgain,
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

function onChangedElsewhere() {
  errorToast('sales-changed', SALE_COPY.changedElsewhere)
}

// ---- Log / Edit sale overlay --------------------------------------------------------------------------------
type Opener = { kind: 'primary' } | { kind: 'empty' } | { kind: 'row', id: string }
const formOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editSale = ref<Sale | null>(null)
/** For a delivery made from an order: that order's date, the earliest its sale date may be (AC36). */
const editOrderDate = ref<IsoDate | null>(null)
let opener: Opener = { kind: 'primary' }

function openAdd(from: Opener = { kind: 'primary' }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'add'
  editSale.value = null
  editOrderDate.value = null
  formOpen.value = true
}
primary.onPrimaryAction(() => openAdd({ kind: 'primary' }))

function openEdit(sale: Sale, from: Opener = { kind: 'row', id: sale.id }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'edit'
  editSale.value = sale
  editOrderDate.value = null
  if (sale.orderId !== null) {
    const orderId = sale.orderId
    void api<OrderResponse>(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((res) => {
        if (editSale.value?.orderId === orderId) editOrderDate.value = res.order.orderDate
      })
      .catch(() => undefined)
  }
  detailOpen.value = false
  formOpen.value = true
}

async function onFormClosed() {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  if (opener.kind === 'row') return focusControl(`open:${opener.id}`)
  if (opener.kind === 'empty') {
    const card = document.querySelector<HTMLElement>('[data-sale-focus="empty-add"]')
    if (card) return card.focus({ preventScroll: true })
  }
  const visibleButton = [...document.querySelectorAll<HTMLElement>('[data-primary-action]')].find(el => el.getClientRects().length > 0)
  if (visibleButton) visibleButton.focus({ preventScroll: true })
}

function onSaved(event: SaleSavedEvent) {
  if (event.kind === 'unchanged') return
  const n = event.sale.saleNumber
  const title = event.kind === 'recorded' ? SALE_COPY.toastRecorded(n) : SALE_COPY.toastUpdated(n)
  if (!list.isVisible(event.sale)) {
    // AC29: if the current filters would hide the new/edited sale, clear them so the owner sees it.
    clearFilters()
  }
  toast.add({ title, icon: 'i-lucide-check' })
  flash(event.sale.id)
  void reveal(event.sale.id)
}

// ---- Detail overlay -------------------------------------------------------------------------------------
const detailOpen = ref(false)
const detailSale = ref<Sale | null>(null)
function openDetail(sale: Sale) {
  detailSale.value = sale
  detailOpen.value = true
}
watch(() => list.sales.value, (rows) => {
  if (!detailSale.value) return
  const fresh = rows.find(s => s.id === detailSale.value!.id)
  if (fresh) detailSale.value = fresh
})
watch(detailOpen, (isOpen) => {
  if (!isOpen) stack.clear()
})

/** Opens any sale by id (a hand-off from Orders, or another delivery picked in the stacked order). */
async function openSaleById(id: string) {
  try {
    const res = await api<SaleResponse>(`/api/sales/${encodeURIComponent(id)}`)
    orderOverlayOpen.value = false
    detailSale.value = res.sale
    detailOpen.value = true
  }
  catch {
    errorToast('sales-open-failed', SALE_COPY.loadFailedTitle)
  }
}

// ---- Void -------------------------------------------------------------------------------------------------
const voidOpen = ref(false)
const voidSale = ref<Sale | null>(null)
function openVoid(sale: Sale) {
  voidSale.value = sale
  voidOpen.value = true
}
const voidClientLabel = computed(() => {
  const sale = voidSale.value
  if (!sale) return ''
  if (!sale.clientId) return SALE_COPY.walkIn
  return clients.sorted.value.find(c => c.id === sale.clientId)?.name ?? SALE_COPY.walkIn
})

/** "10 trays of Large" for what an order still owes after a void; null when nothing, or the order stays closed. */
function owedText(order: OrderDetailData): string | null {
  if (order.closedShortAt !== null) return null
  const parts = order.lines
    .filter(l => l.remainingEggs > 0)
    .map(l => `${formatQty(l.remainingEggs, trayEggs.value)} of ${sizeById(l.sizeId).name}`)
  return parts.length ? parts.join(', ') : null
}

function onVoided(response: VoidSaleResponse) {
  const sale = response.sale
  if (detailSale.value?.id === sale.id) detailSale.value = sale
  void onHand.invalidate(sale.lines.map(l => l.sizeId))
  const owed = response.order ? owedText(response.order) : null
  const message = response.order && owed && sale.orderNumber !== null
    ? SALE_COPY.toastVoidedLinked(sale.saleNumber, sale.orderNumber, owed)
    : SALE_COPY.toastVoided(sale.saleNumber)
  afterVisibleChange(sale, message)
}
function onVoidRefused() {
  onChangedElsewhere()
  void list.reload()
}

// ---- Stacked read-only order (flow H, D3/D10) ----------------------------------------------------------------
const orderOverlayOpen = ref(false)
const stackedOrder = ref<OrderDetailData | null>(null)

function openOrderOf(sale: Sale) {
  if (sale.orderId === null) return
  stack.push({ kind: 'order', id: sale.orderId })
}

watch(() => stack.top.value, async (entry) => {
  if (!entry || entry.kind !== 'order') {
    orderOverlayOpen.value = false
    return
  }
  stackedOrder.value = null
  orderOverlayOpen.value = true
  try {
    const res = await api<OrderResponse>(`/api/orders/${encodeURIComponent(entry.id)}`)
    if (stack.top.value?.id === entry.id) stackedOrder.value = res.order
  }
  catch {
    if (stack.top.value?.id === entry.id) {
      orderOverlayOpen.value = false
      stack.pop()
      errorToast('sales-order-open-failed', SALE_COPY.openOrderFailed)
    }
  }
})

watch(orderOverlayOpen, (isOpen) => {
  if (!isOpen && stack.top.value) stack.pop()
})

/** A delivery picked inside the stacked order: the sale underneath just comes back; any other one opens here. */
function onStackedDelivery(delivery: OrderDelivery) {
  if (detailSale.value?.id === delivery.saleId && detailOpen.value) {
    orderOverlayOpen.value = false
    return
  }
  void openSaleById(delivery.saleId)
}

async function openOrderInOrders(order: { id: string }) {
  await stack.handoffTo({ kind: 'order', id: order.id }, '/farm/orders')
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
  // "Open in Sales" from the Orders screen hands a sale over to open here, fully editable.
  const handoff = stack.takeHandoff('sale')
  if (handoff) void openSaleById(handoff.id)
})

onBeforeUnmount(() => stack.clear())

// The FAB/Add button hides while any sheet or dialog is open (UX "Getting there").
watchEffect(() => {
  primary.hidden.value = formOpen.value || detailOpen.value || voidOpen.value || orderOverlayOpen.value
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <AppPlaceholder
      v-if="loadFailed"
      icon="i-lucide-cloud-off"
      :title="SALE_COPY.loadFailedTitle"
      :body="SALE_COPY.loadFailedBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-refresh-cw"
        :label="SALE_COPY.tryAgain"
        :loading="retrying"
        class="w-full justify-center sm:w-auto"
        @click="retryLoad"
      />
    </AppPlaceholder>

    <AppPlaceholder
      v-else-if="firstUse"
      icon="i-lucide-shopping-cart"
      :title="SALE_COPY.firstUseTitle"
      :body="SALE_COPY.firstUseBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-plus"
        data-sale-focus="empty-add"
        :label="SALE_COPY.addLabel"
        class="w-full justify-center sm:w-auto"
        @click="openAdd({ kind: 'empty' })"
      />
    </AppPlaceholder>

    <template v-else>
      <SalesToolbar
        v-model:type="filters.type"
        v-model:client-id="filters.clientId"
        v-model:from="filters.from"
        v-model:to="filters.to"
        v-model:include-voided="filters.includeVoided"
        :client-options="clientFilterOptions"
        :disabled="loading"
        :filtering="filtering && !loading"
        :active-filter-count="activeFilterCount"
        :shown="list.sales.value.length"
        :total="list.total.value"
        :date-range-error="dateRangeError"
        @clear="clearFilters"
      />

      <SalesList
        :sales="list.sales.value"
        :today="today"
        :loading="loading"
        :highlighted-id="highlightedId"
        :busy-ids="mutations.pendingIds.value"
        @open="openDetail"
        @edit="(s: Sale) => openEdit(s)"
        @void="openVoid"
        @open-order="openOrderOf"
      >
        <template
          v-if="noMatch"
          #empty
        >
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <p class="text-base text-muted">
              {{ SALE_COPY.noMatch }}
            </p>
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              :label="SALE_COPY.clearFilters"
              @click="clearFilters"
            />
          </div>
        </template>
      </SalesList>

      <p
        v-if="list.hasMore.value"
        class="text-sm text-muted"
      >
        {{ SALE_COPY.showing(list.sales.value.length, list.total.value) }}
      </p>
      <UButton
        v-if="list.hasMore.value"
        color="neutral"
        variant="outline"
        size="xl"
        class="w-full justify-center"
        :label="SALE_COPY.showMore"
        :loading="loadingMore"
        @click="showMore"
      />
    </template>

    <SaleFormOverlay
      v-model:open="formOpen"
      :mode="formMode"
      :sale="editSale"
      :today="today"
      :order-date="editOrderDate"
      @saved="onSaved"
      @changed-elsewhere="onChangedElsewhere"
      @closed="onFormClosed"
    />

    <SaleDetail
      v-model:open="detailOpen"
      :sale="detailSale"
      :today="today"
      :mutations="mutations"
      @edit="(s: Sale) => openEdit(s, { kind: 'row', id: s.id })"
      @void="openVoid"
      @open-order="openOrderOf"
    />

    <SaleVoidDialog
      v-model:open="voidOpen"
      :sale="voidSale"
      :client-label="voidClientLabel"
      :mutations="mutations"
      @voided="onVoided"
      @refused="onVoidRefused"
    />

    <OrderDetail
      v-model:open="orderOverlayOpen"
      :order="stackedOrder"
      :deliveries="stackedOrder?.deliveries ?? null"
      :today="today"
      readonly
      @open-sale="onStackedDelivery"
      @open-elsewhere="openOrderInOrders"
    />
  </div>
</template>
