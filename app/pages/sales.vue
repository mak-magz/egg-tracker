<!--
  Sales (feature 04). Design: docs/design/source/template.html (Sales screen, Log a sale dialog); UX:
  docs/features/04-sales.md §2.5; technical design §3.4.
  Filters -> the server-paged list (table when wide, cards when narrow). The top-bar "Add sale" button (md+)
  and the FAB (<md) come from the layout via `primaryAction`. The list is fetched on the client after mount
  (personal data: a sale points at a client, AC60), lives in memory only (useSales), and every filter is a
  page-local ref that never touches the URL (AC11). One shared useSaleMutations() instance drives every
  status/delete/void action from the list, the detail and their dialogs, so a row and its detail never fight
  over whose spinner is showing (R1); SaleForm owns its own create/update saving state.
-->
<script setup lang="ts">
import { useDebounceFn, useEventListener } from '@vueuse/core'
import type { IsoDate, Sale } from '#shared/types/api'
import type { SaleSavedEvent } from '~/components/SaleForm.vue'
import { SALE_COPY } from '~/utils/sale-copy'
import { createTodayTracker } from '~/utils/today-tracker'
import { defaultSalesFilters } from '~/composables/useSales'
import type { SalesFilters } from '~/composables/useSales'

definePageMeta({
  primaryAction: { label: 'Add sale', ariaLabel: 'Add sale', icon: 'i-lucide-plus', fab: true },
})

const toast = useToast()
const primary = usePrimaryAction()
const list = useSales()
const mutations = useSaleMutations()
const clients = useClients()

// The device's local "today" (feature 01 §3.8 D13): SSR can't know it, kept current while the screen stays
// open (today-tracker.ts, reused as-is).
const tracker = createTodayTracker()
const today = ref<IsoDate>(tracker.current)
function syncToday() {
  if (tracker.refresh()) today.value = tracker.current
}
onMounted(() => {
  syncToday()
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') syncToday()
  })
  useEventListener(window, 'focus', () => syncToday())
})

// ---- Filters (memory only: AC8, AC11, AC60). Reset on a fresh visit to the screen. -----------------------
const filters = reactive<SalesFilters>(defaultSalesFilters())
const dateRangeError = computed(() => (filters.from && filters.to && filters.from > filters.to ? SALE_COPY.dateRangeInvalid : null))

const activeFilterCount = computed(() => {
  let n = 0
  if (filters.type !== 'all') n++
  if (filters.clientId) n++
  if (filters.from || filters.to) n++
  return n
})
const filtering = computed(() => filters.status !== 'all' || activeFilterCount.value > 0)

const debouncedLoad = useDebounceFn(() => {
  if (dateRangeError.value) return
  void list.load({ ...filters })
}, 300)

watch(filters, debouncedLoad, { deep: true })

onMounted(() => {
  void clients.load({ silent: clients.hasList.value })
  void list.load({ ...filters })
})

function clearFilters() {
  Object.assign(filters, defaultSalesFilters())
}

// ---- Load states (AC46, AC47, AC10) ------------------------------------------------------------------------
const loadFailed = computed(() => list.status.value === 'error')
const loading = computed(() => !list.hasList.value && !loadFailed.value)
const firstUse = computed(() => list.hasList.value && !list.hasAny.value)
const noMatch = computed(() => list.hasList.value && list.hasAny.value && list.sales.value.length === 0)
const noMatchPendingOnly = computed(() => filters.status === 'pending' && activeFilterCount.value === 0 && !filters.includeVoided)

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
  if (filters.status !== 'all' && sale.status !== filters.status) return sale.status === 'complete' ? SALE_COPY.statusComplete : SALE_COPY.statusPending
  if (filters.type !== 'all' && sale.type !== filters.type) return sale.type === 'delivery' ? SALE_COPY.typeDelivery : SALE_COPY.typeOnSite
  return SALE_COPY.statusAll
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
let opener: Opener = { kind: 'primary' }

function openAdd(from: Opener = { kind: 'primary' }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'add'
  editSale.value = null
  formOpen.value = true
}
primary.onPrimaryAction(() => openAdd({ kind: 'primary' }))

function openEdit(sale: Sale, from: Opener = { kind: 'row', id: sale.id }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'edit'
  editSale.value = sale
  detailOpen.value = false
  formOpen.value = true
}

async function onFormClosed() {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  if (opener.kind === 'row') return focusControl(`open:${opener.id}`, `menu:${opener.id}`)
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
  const title = event.kind === 'logged_pending'
    ? SALE_COPY.toastLoggedPending(n)
    : event.kind === 'recorded' ? SALE_COPY.toastRecorded(n) : SALE_COPY.toastUpdated(n)
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

// ---- Mark delivered / Mark as pending --------------------------------------------------------------------
const markDeliveredOpen = ref(false)
const markDeliveredSale = ref<Sale | null>(null)
function openMarkDelivered(sale: Sale) {
  markDeliveredSale.value = sale
  markDeliveredOpen.value = true
}
function onMarked(sale: Sale) {
  afterVisibleChange(sale, SALE_COPY.toastMarkedDelivered)
}
function onMarkFailed() {
  const n = markDeliveredSale.value?.saleNumber
  if (n) errorToast(`sales-mark-${n}`, SALE_COPY.markFailed(n), () => markDeliveredSale.value && openMarkDelivered(markDeliveredSale.value))
}

async function markPending(sale: Sale) {
  const result = await mutations.markPending(sale.id)
  if (!result) return
  if (result.ok) {
    afterVisibleChange(result.data.sale, SALE_COPY.toastMarkedPending)
    return
  }
  if (result.error.kind === 'voided' || result.error.kind === 'sale_changed') {
    onChangedElsewhere()
    return
  }
  errorToast(`sales-mark-pending-${sale.saleNumber}`, SALE_COPY.markPendingFailed(sale.saleNumber), () => void markPending(sale))
}

// ---- Delete / Void ----------------------------------------------------------------------------------------
const removalOpen = ref(false)
const removalSale = ref<Sale | null>(null)
const removalAction = ref<'delete' | 'void'>('delete')
function openRemoval(sale: Sale) {
  removalSale.value = sale
  removalAction.value = sale.status === 'pending' ? 'delete' : 'void'
  removalOpen.value = true
}
const removalClientLabel = computed(() => {
  const sale = removalSale.value
  if (!sale) return ''
  if (!sale.clientId) return SALE_COPY.walkIn
  return clients.sorted.value.find(c => c.id === sale.clientId)?.name ?? SALE_COPY.walkIn
})
function onDeleted(sale: Sale) {
  toast.add({ title: SALE_COPY.toastDeleted(sale.saleNumber), icon: 'i-lucide-check' })
  detailOpen.value = false
}
function onVoided(sale: Sale) {
  afterVisibleChange(sale, SALE_COPY.toastVoided(sale.saleNumber))
}
function onRemovalRefused() {
  onChangedElsewhere()
}

// The FAB/Add button hides while any sheet or dialog is open (UX "Getting there").
watchEffect(() => {
  primary.hidden.value = formOpen.value || detailOpen.value || markDeliveredOpen.value || removalOpen.value
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
        v-model:status="filters.status"
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
        @mark-delivered="openMarkDelivered"
        @mark-pending="markPending"
        @delete="openRemoval"
        @void="openRemoval"
      >
        <template
          v-if="noMatch"
          #empty
        >
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <p class="text-base text-muted">
              {{ SALE_COPY.noMatch }}
            </p>
            <p
              v-if="noMatchPendingOnly"
              class="text-base text-muted"
            >
              {{ SALE_COPY.noMatchPendingNote }}
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
      @mark-delivered="openMarkDelivered"
      @mark-pending="markPending"
      @delete="openRemoval"
      @void="openRemoval"
    />

    <MarkDeliveredDialog
      v-model:open="markDeliveredOpen"
      :sale="markDeliveredSale"
      :today="today"
      :mutations="mutations"
      @marked="onMarked"
      @failed="onMarkFailed"
    />

    <SaleRemovalDialog
      v-model:open="removalOpen"
      :sale="removalSale"
      :action="removalAction"
      :client-label="removalClientLabel"
      :mutations="mutations"
      @deleted="onDeleted"
      @voided="onVoided"
      @refused="onRemovalRefused"
    />
  </div>
</template>
