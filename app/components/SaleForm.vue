<!--
  Log / Edit sale: the whole sheet or dialog content (feature 04 §2.5 "Log a sale", AC12 to AC32, AC40, AC41,
  AC64 to AC66; feature 05 AC36 to AC42). A header part (Delivery/On-site, Client) plus a multi-size grid part
  (SaleLineCard for all active sizes) plus the Sale date plus the footer total. SELF-CONTAINED (AC34-style,
  feature 03): validation, the submission id, the discard-dirty state and the save call all live here, like
  ClientForm/ProductionForm.
  Every sale has already left the farm (feature 05 AC37), so there is no "Already delivered" and no delivered date:
  the Sale date is the day the eggs left. A type change in Edit (AC42) is a plain edit: stock never moves and nothing
  warns. A delivery made from an order (`sale.orderId`, AC36) shows its type, client and lines read-only with a lock
  note; only the Sale date can change. Stock-short (AC26, AC38) is a confirm dialog on top of this still-open form;
  "Go back" keeps every typed value.
-->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { IsoDate, Sale, SaleLineInput, SaleType, ShortfallLine } from '#shared/types/api'
import type { ClientSavedEvent } from './ClientForm.vue'
import type { ClientPickerOption } from './ClientPicker.vue'
import { computeLineTotal, formatPriceInput } from '#shared/utils/price'
import { formatQty, splitEggs } from '#shared/utils/quantity'
import { formatDateHint } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'
import { SALE_COPY } from '~/utils/sale-copy'
import { MAX_SALE_LINES, SALE_FIELDS } from '#shared/constants/sales'
import type { SaleError } from '~/utils/sale-errors'
import type { SaleInput } from '~/utils/sale-mutations'
import {
  checkLinePrice,
  checkLineQuantity,
  checkLinkedSaleDate,
  checkSaleClient,
  checkSaleDate,
} from '~/utils/sale-validation'
import type { QuantityValue } from '~/utils/sale-validation'

export interface SaleSavedEvent {
  kind: 'recorded' | 'updated' | 'unchanged'
  sale: Sale
}

const props = defineProps<{
  mode: 'add' | 'edit'
  /** Edit: the sale being edited, as the list had it when the form opened (its `version` goes back with the save). */
  sale?: Sale | null
  /** The device's local date. */
  today: IsoDate
  /** Edit of a delivery made from an order: the order's date, the earliest the sale date may be (AC36). Null while it loads. */
  orderDate?: IsoDate | null
}>()

const emit = defineEmits<{
  'cancel': []
  'saved': [event: SaleSavedEvent]
  'changed-elsewhere': []
}>()

const { activeSizes, sizeById, trayEggs, currency, formatPrice } = useFarm()
const { activeClients, sorted: allClients } = useClients()
const onHand = useOnHand()
const mutations = useSaleMutations()

const isEdit = computed(() => props.mode === 'edit')
const originalSale = computed(() => (isEdit.value ? (props.sale ?? null) : null))
/** A delivery made from an order: client, type and lines are read-only; only the date can change (AC36). */
const linked = computed(() => originalSale.value !== null && originalSale.value.orderId !== null)
const linkedOrderNumber = computed(() => originalSale.value?.orderNumber ?? null)

// ---- Header state ---------------------------------------------------------------------------------------
const state = reactive({
  type: originalSale.value?.type ?? ('delivery' as SaleType),
  clientId: originalSale.value?.clientId ?? (null as string | null),
  saleDate: originalSale.value?.saleDate ?? props.today,
})

/** On-site: the client is optional ("Walk-in"). */
const isOnSite = computed(() => state.type === 'on_site')

// ---- Client picker + price pre-fill (AC13, AC14, AC18) ---------------------------------------------------
const clientOptions = computed<ClientPickerOption[]>(() => {
  const list: ClientPickerOption[] = activeClients.value.map(c => ({ id: c.id, name: c.name, inactive: false }))
  const kept = originalSale.value?.clientId
  if (kept && !list.some(c => c.id === kept)) {
    const found = allClients.value.find(c => c.id === kept)
    if (found) list.push({ id: found.id, name: found.name, inactive: !found.active })
  }
  return list
})

const linkedClientText = computed(() => {
  const c = allClients.value.find(x => x.id === state.clientId)
  if (!c) return SALE_COPY.walkIn
  return c.active ? c.name : SALE_COPY.clientInactiveSelected(c.name)
})

const clientDefaultPrice = computed<number | null>(() => {
  const id = state.clientId
  if (!id) return null
  return allClients.value.find(c => c.id === id)?.defaultPrice ?? null
})

// ---- Lines (Production-style all sizes grid) -----------------------------------------------------------
interface SizeLineState {
  sizeId: string
  name: string
  colorSlot: number
  archived: boolean
  qty: QuantityValue
  priceRaw: string
  /** True until the owner types this line's price by hand (AC18): it follows the client's default. */
  priceIsUsual: boolean
}

function buildSizeLines(): SizeLineState[] {
  const active = activeSizes.value
  const activeIds = new Set(active.map(s => s.id))
  const onSale = isEdit.value && props.sale
    ? new Set(props.sale.lines.map(l => l.sizeId))
    : new Set<string>()

  // Archived sizes that exist on this sale (Edit only)
  const archivedOnSale = [...onSale]
    .filter(id => !activeIds.has(id))
    .map(id => sizeById(id))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const allSizes = [
    ...active.map(s => ({ id: s.id, name: s.name, colorSlot: s.colorSlot, archived: false })),
    ...archivedOnSale.map(s => ({ id: s.id, name: s.name, colorSlot: s.colorSlot, archived: true })),
  ]

  const existingMap = new Map(props.sale?.lines.map(l => [l.sizeId, l]) ?? [])
  const defaultPrice = clientDefaultPrice.value

  return allSizes.map((s) => {
    const existing = existingMap.get(s.id)
    if (existing) {
      const { trays, loose } = splitEggs(existing.eggs, trayEggs.value)
      return {
        sizeId: s.id,
        name: s.name,
        colorSlot: s.colorSlot,
        archived: s.archived,
        qty: { trays, loose },
        priceRaw: formatPriceInput(existing.pricePerTray),
        priceIsUsual: false,
      }
    }
    return {
      sizeId: s.id,
      name: s.name,
      colorSlot: s.colorSlot,
      archived: s.archived,
      qty: { trays: null, loose: null },
      priceRaw: defaultPrice !== null ? formatPriceInput(defaultPrice) : '',
      priceIsUsual: defaultPrice !== null,
    }
  })
}

const lines = ref<SizeLineState[]>(buildSizeLines())

function sizeNameFor(line: SizeLineState): string {
  return line.name
}

function isLineOnLinkedSale(line: SizeLineState): boolean {
  if (!linked.value || !originalSale.value) return true
  return originalSale.value.lines.some(l => l.sizeId === line.sizeId)
}

/** A linked sale's lines are shown with a lock and their quantity (AC36). */
function lockedLabelFor(line: SizeLineState): string | undefined {
  if (!linked.value) return undefined
  const sale = originalSale.value
  const found = sale?.lines.find(l => l.sizeId === line.sizeId)
  if (!found) return undefined
  return ORDER_COPY.lockedLineAria(line.name, formatQty(found.eggs, trayEggs.value))
}

const body = useTemplateRef<HTMLElement>('body')

watch(clientDefaultPrice, (price) => {
  if (price === null || linked.value) return
  for (const line of lines.value) {
    if (line.priceIsUsual || line.priceRaw.trim() === '') {
      line.priceRaw = formatPriceInput(price)
      line.priceIsUsual = true
    }
  }
})

function onLinePriceEdited(line: SizeLineState) {
  line.priceIsUsual = false
}

// ---- Add-client sheet on top (flow L, AC14) --------------------------------------------------------------
const addClientOpen = ref(false)
const addClientStartingName = ref('')
function openAddClient(startingName: string) {
  addClientStartingName.value = startingName
  addClientOpen.value = true
}
function onClientAdded(event: ClientSavedEvent) {
  addClientOpen.value = false
  if (event.kind === 'unchanged') return
  state.clientId = event.client.id
}

// ---- Live totals (AC22) -----------------------------------------------------------------------------------
function hasQuantity(line: SizeLineState): boolean {
  const t = line.qty.trays
  const l = line.qty.loose
  return (t !== null && t > 0) || (l !== null && l > 0)
}

function lineEggs(line: SizeLineState): number | null {
  const check = checkLineQuantity(line.qty, trayEggs.value)
  return check.ok ? check.value : null
}

function linePrice(line: SizeLineState): number | null {
  const check = checkLinePrice(line.priceRaw, currency.value)
  return check.ok ? check.value : null
}

function lineTotalFor(line: SizeLineState): number | null {
  if (!hasQuantity(line)) return null
  const eggs = lineEggs(line)
  const price = linePrice(line)
  if (eggs === null || price === null) return null
  return computeLineTotal(price, eggs, trayEggs.value)
}

const activeLines = computed(() => lines.value.filter(hasQuantity))
const completeLineTotals = computed(() => activeLines.value.map(lineTotalFor))
const allLinesComplete = computed(() => activeLines.value.length > 0 && completeLineTotals.value.every(t => t !== null))
const runningTotal = computed(() => completeLineTotals.value.reduce((sum: number, t) => sum + (t ?? 0), 0))

const footerTotalText = computed(() => {
  if (activeLines.value.length === 0) return SALE_COPY.saleTotalEmpty
  const formatted = formatPrice(runningTotal.value)
  return allLinesComplete.value ? SALE_COPY.saleTotal(formatted) : SALE_COPY.saleTotalSoFar(formatted)
})

// ---- On-hand hints (AC25) -----------------------------------------------------------------------------
watchEffect(() => {
  if (linked.value) return
  const ids = lines.value.map(l => l.sizeId)
  if (ids.length) void onHand.ensure(ids)
})

function onHandFor(line: SizeLineState) {
  return onHand.entry(line.sizeId)
}

// ---- Dirty (discard check, AC32) --------------------------------------------------------------------------
const addTouched = computed(() => {
  if (isEdit.value) return false
  if (state.clientId !== null) return true
  return lines.value.some(hasQuantity)
})

function snapshot(): string {
  return JSON.stringify({
    type: state.type,
    clientId: state.clientId,
    saleDate: state.saleDate,
    lines: lines.value
      .filter(hasQuantity)
      .map(l => ({ s: l.sizeId, t: l.qty.trays, l: l.qty.loose, p: l.priceRaw })),
  })
}

const editSnapshot = isEdit.value ? snapshot() : ''
const dirty = computed(() => (isEdit.value ? snapshot() !== editSnapshot : addTouched.value))

// ---- Errors ------------------------------------------------------------------------------------------------
const clientError = ref<string | null>(null)
const saleDateError = ref<string | null>(null)
const lineErrors = ref<Record<string, { size?: string, quantity?: string, price?: string }>>({})
const formError = ref<string | null>(null)

const saving = computed(() => mutations.saving.value)
const busy = computed(() => saving.value)

function clearErrors() {
  clientError.value = null
  saleDateError.value = null
  lineErrors.value = {}
  formError.value = null
}

// ---- Stock shortfall confirm (AC26, AC38) ------------------------------------------------------------------
const shortfallOpen = ref(false)
const shortfallLines = ref<ShortfallLine[]>([])
const shortfallVerb = computed<'selling' | 'delivering' | 'adding'>(() => {
  if (isEdit.value) return 'adding'
  return isOnSite.value ? 'selling' : 'delivering'
})

function focusFirstProblem() {
  if (clientError.value) {
    document.querySelector<HTMLElement>('[data-sale-focus="client"]')?.focus()
    return
  }
  const firstErrorSizeId = lines.value.find(l => lineErrors.value[l.sizeId])?.sizeId
  if (firstErrorSizeId) {
    const idx = lines.value.findIndex(l => l.sizeId === firstErrorSizeId)
    body.value?.querySelectorAll<HTMLInputElement>('input[data-qty-input]')[idx * 2]?.focus()
    return
  }
  if (saleDateError.value) {
    document.querySelector<HTMLElement>('[data-sale-focus="date"]')?.scrollIntoView({ block: 'center' })
  }
}

function validateDate(): boolean {
  const orderDate = props.orderDate
  const check = linked.value && orderDate ? checkLinkedSaleDate(state.saleDate, orderDate, props.today) : checkSaleDate(state.saleDate, props.today)
  if (!check.ok) {
    saleDateError.value = check.message
    return false
  }
  return true
}

function validate(): { input: SaleInput } | null {
  clearErrors()

  // A delivery made from an order: only the date can change, so the rest goes back exactly as it was (AC36).
  if (linked.value && originalSale.value) {
    if (!validateDate()) {
      focusFirstProblem()
      return null
    }
    const sale = originalSale.value
    return {
      input: {
        type: sale.type,
        saleDate: state.saleDate,
        clientId: sale.clientId,
        lines: sale.lines.map(l => ({ sizeId: l.sizeId, eggs: l.eggs, pricePerTray: l.pricePerTray })),
      },
    }
  }

  let ok = true

  const clientCheck = checkSaleClient(state.type, state.clientId)
  if (!clientCheck.ok) {
    clientError.value = clientCheck.message
    ok = false
  }

  if (!validateDate()) ok = false

  const lineInputs: SaleLineInput[] = []
  const enteredSizes = lines.value.filter(hasQuantity)

  if (enteredSizes.length === 0) {
    formError.value = 'Enter a quantity for at least one size.'
    ok = false
  }
  else if (enteredSizes.length > MAX_SALE_LINES) {
    formError.value = SALE_COPY.addSizeLimitReached
    ok = false
  }

  for (const line of lines.value) {
    if (!hasQuantity(line)) continue

    const errs: { size?: string, quantity?: string, price?: string } = {}
    const qtyCheck = checkLineQuantity(line.qty, trayEggs.value)
    if (!qtyCheck.ok) {
      errs.quantity = qtyCheck.message
      ok = false
    }
    const priceCheck = checkLinePrice(line.priceRaw, currency.value)
    if (!priceCheck.ok) {
      errs.price = priceCheck.message
      ok = false
    }
    if (Object.keys(errs).length) lineErrors.value = { ...lineErrors.value, [line.sizeId]: errs }
    if (qtyCheck.ok && priceCheck.ok) {
      lineInputs.push({ sizeId: line.sizeId, eggs: qtyCheck.value, pricePerTray: priceCheck.value })
    }
  }

  if (!ok) {
    focusFirstProblem()
    return null
  }
  return { input: { type: state.type, saleDate: state.saleDate, clientId: state.clientId, lines: lineInputs } }
}

function applyServerFields(fields: Record<string, string>) {
  let mapped = false
  if (fields[SALE_FIELDS.type] || fields[SALE_FIELDS.clientId]) {
    clientError.value = fields[SALE_FIELDS.clientId] ?? null
    mapped = true
  }
  if (fields[SALE_FIELDS.saleDate]) {
    saleDateError.value = fields[SALE_FIELDS.saleDate]!
    mapped = true
  }
  if (fields[SALE_FIELDS.lines]) {
    formError.value = fields[SALE_FIELDS.lines]!
    mapped = true
  }
  return mapped
}

function handleFailure(error: SaleError) {
  if (error.kind === 'stock_short') {
    shortfallLines.value = error.shortfall ?? []
    shortfallOpen.value = true
    return
  }
  if (error.kind === 'validation') {
    if (applyServerFields(error.fields ?? {})) return
  }
  if ((error.kind === 'sale_changed' || error.kind === 'voided') && isEdit.value) {
    emit('changed-elsewhere')
    return
  }
  if (error.kind === 'sale_locked') {
    formError.value = SALE_COPY.serverSaleLocked
    return
  }
  formError.value = isEdit.value ? SALE_COPY.editSaveFailed : SALE_COPY.saveFailed
}

async function attemptSave(confirmShortfall: boolean) {
  if (busy.value) return
  const validated = confirmShortfall ? lastValidated : validate()
  if (!validated) return
  lastValidated = validated

  if (isEdit.value) {
    const sale = originalSale.value
    if (!sale) return
    if (!confirmShortfall && !dirty.value) {
      emit('saved', { kind: 'unchanged', sale })
      return
    }
    const result = await mutations.update(sale, validated.input, confirmShortfall)
    if (!result) return
    if (result.ok) emit('saved', { kind: 'updated', sale: result.data.sale })
    else handleFailure(result.error)
    return
  }

  const result = await mutations.create(validated.input, confirmShortfall)
  if (!result) return
  if (result.ok) emit('saved', { kind: 'recorded', sale: result.data.sale })
  else handleFailure(result.error)
}

let lastValidated: { input: SaleInput } | null = null

async function onSubmit(_event: FormSubmitEvent<unknown>) {
  await attemptSave(false)
}

function onRecordAnyway() {
  shortfallOpen.value = false
  void attemptSave(true)
}

const shortfallDialogLines = computed(() => shortfallLines.value.map(s => ({
  name: sizeById(s.sizeId).name,
  onHandText: formatQtyLocal(s.onHandEggs),
  neededText: formatQtyLocal(s.neededEggs),
})))

function formatQtyLocal(eggs: number): string {
  return formatQty(eggs, trayEggs.value)
}

defineExpose({ dirty, saving: busy, focusFirstProblem })
</script>

<template>
  <UForm
    :state="state"
    :loading-auto="false"
    class="flex min-h-0 flex-1 flex-col"
    novalidate
    @submit="onSubmit"
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2 sm:ps-5">
      <h2 class="flex-1 text-lg font-bold text-highlighted">
        {{ isEdit && originalSale ? SALE_COPY.editTitle(originalSale.saleNumber) : SALE_COPY.logTitle }}
      </h2>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :aria-label="SALE_COPY.close"
        class="size-11 justify-center lg:size-10"
        :disabled="busy"
        @click="emit('cancel')"
      />
    </div>

    <!-- Body (scrolls) -->
    <div
      ref="body"
      class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5"
    >
      <p
        v-if="linked && linkedOrderNumber !== null"
        class="flex items-center gap-2 text-base font-medium text-highlighted"
      >
        <UIcon
          name="i-lucide-lock"
          class="size-4 shrink-0 text-muted"
          aria-hidden="true"
        />
        {{ SALE_COPY.partOfOrder(linkedOrderNumber) }}
      </p>

      <div
        role="radiogroup"
        :aria-label="SALE_COPY.saleTypeGroupLabel"
        class="grid grid-cols-2 gap-2"
      >
        <UButton
          :color="state.type === 'delivery' ? 'primary' : 'neutral'"
          :variant="state.type === 'delivery' ? 'solid' : 'outline'"
          size="xl"
          icon="i-lucide-truck"
          class="min-h-11 justify-center font-semibold"
          :aria-pressed="state.type === 'delivery'"
          :disabled="busy || linked"
          :label="SALE_COPY.typeDelivery"
          @click="state.type = 'delivery'"
        />
        <UButton
          :color="state.type === 'on_site' ? 'primary' : 'neutral'"
          :variant="state.type === 'on_site' ? 'solid' : 'outline'"
          size="xl"
          icon="i-lucide-store"
          class="min-h-11 justify-center font-semibold"
          :aria-pressed="state.type === 'on_site'"
          :disabled="busy || linked"
          :label="SALE_COPY.typeOnSite"
          @click="state.type = 'on_site'"
        />
      </div>

      <UFormField
        :label="SALE_COPY.clientLabel"
        :hint="isOnSite ? SALE_COPY.clientOptional : undefined"
        size="xl"
        :error="clientError ?? undefined"
        :ui="{ label: 'text-base font-medium', hint: 'text-sm text-dimmed', error: 'mt-1.5 text-sm' }"
      >
        <div
          v-if="linked"
          class="flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 py-2 text-base text-highlighted ring ring-inset ring-default"
        >
          <span class="min-w-0 flex-1 wrap-anywhere">{{ linkedClientText }}</span>
          <UIcon
            name="i-lucide-lock"
            class="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
        </div>
        <ClientPicker
          v-else
          v-model="state.clientId"
          data-sale-focus="client"
          :options="clientOptions"
          :optional="isOnSite"
          :disabled="busy"
          :placeholder="state.type === 'delivery' ? SALE_COPY.clientPlaceholderDelivery : SALE_COPY.clientPlaceholderOnSite"
          @add-new="openAddClient"
        />
      </UFormField>

      <!-- Multi-size Production-style Grid (No 'Add size' button needed) -->
      <fieldset class="flex min-w-0 flex-col gap-2">
        <legend class="mb-1 text-sm font-semibold text-slate-300">
          Sizes & Quantities
        </legend>
        <div class="flex flex-col gap-3">
          <SaleLineCard
            v-for="(line, i) in lines"
            :key="line.sizeId"
            v-model:qty="line.qty"
            v-model:price-raw="line.priceRaw"
            :index="i"
            :size-name="sizeNameFor(line)"
            :archived="line.archived"
            :color-slot="line.colorSlot"
            :eggs-per-tray="trayEggs"
            :currency="currency"
            :on-hand-eggs="onHandFor(line).eggs"
            :on-hand-status="onHandFor(line).status"
            :hide-on-hand="linked"
            :locked-label="lockedLabelFor(line)"
            :show-usual-price-note="line.priceIsUsual && line.priceRaw.trim() !== ''"
            :line-total="lineTotalFor(line)"
            :disabled="busy || (linked && !isLineOnLinkedSale(line))"
            :size-error="lineErrors[line.sizeId]?.size"
            :quantity-error="lineErrors[line.sizeId]?.quantity"
            :price-error="lineErrors[line.sizeId]?.price"
            @price-edited="onLinePriceEdited(line)"
          />
        </div>
      </fieldset>

      <p
        v-if="linked"
        class="text-sm text-muted"
      >
        {{ SALE_COPY.linkedEggsNote }}
      </p>

      <UFormField
        :label="SALE_COPY.saleDateLabel"
        size="xl"
        :error="saleDateError ?? undefined"
        :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
      >
        <UInput
          v-model="state.saleDate"
          type="date"
          data-sale-focus="date"
          :min="linked && orderDate ? orderDate : undefined"
          :max="today"
          size="xl"
          class="w-full sm:w-[200px]"
          :disabled="busy"
        />
        <p
          v-if="!saleDateError"
          class="mt-1 text-sm text-muted"
        >
          {{ formatDateHint(state.saleDate, today) }}
        </p>
      </UFormField>
    </div>

    <!-- Footer (pinned) -->
    <div class="flex shrink-0 flex-col gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4">
      <UAlert
        v-if="formError"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="formError"
      />
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <p
          class="text-base font-semibold text-highlighted lg:flex-1"
          aria-live="polite"
        >
          {{ footerTotalText }}
        </p>
        <div
          class="flex gap-3"
          @mousedown.prevent
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="xl"
            class="justify-center lg:min-h-10"
            :label="SALE_COPY.cancel"
            :disabled="busy"
            @click="emit('cancel')"
          />
          <UButton
            type="submit"
            size="xl"
            class="flex-1 justify-center lg:flex-none lg:px-6"
            :label="SALE_COPY.save"
            :loading="saving"
            :disabled="busy"
          />
        </div>
      </div>
    </div>
  </UForm>

  <ClientFormOverlay
    v-model:open="addClientOpen"
    mode="add"
    :initial-name="addClientStartingName"
    @saved="onClientAdded"
  />

  <StockShortfallDialog
    v-model:open="shortfallOpen"
    :lines="shortfallDialogLines"
    :verb="shortfallVerb"
    @record-anyway="onRecordAnyway"
  />
</template>
