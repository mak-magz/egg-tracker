<!--
  New / Edit order: the whole sheet or dialog content (feature 05 §2.5 "New order" / "Edit order, Partially
  fulfilled", AC9 to AC17, AC19, AC20, AC57). A header part (Client) plus a multi-size grid part (SaleLineCard
  for all active sizes) plus Order date / Wanted by plus the footer total. There is NO type toggle, no "Already delivered"
  and no stock hint: ordering never touches stock (AC9, AC10). SELF-CONTAINED like SaleForm: validation, the submission id,
  the discard-dirty state and the save call all live here.
  Edit is driven by orderEditRules(order) (AC19): after a delivery the client is locked, a delivered line shows its
  size read-only, can't be removed and can't go below what was delivered; order date can't pass the first delivery
  (AC57). An existing order keeps its inactive client and any archived size selected and valid.
-->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { IsoDate, Order, OrderDelivery, OrderDetail, OrderLineInput } from '#shared/types/api'
import type { ClientSavedEvent } from './ClientForm.vue'
import type { ClientPickerOption } from './ClientPicker.vue'
import { MAX_ORDER_LINES, ORDER_FIELDS } from '#shared/constants/orders'
import { orderEditRules } from '#shared/utils/order-status'
import { computeLineTotal, formatPriceInput } from '#shared/utils/price'
import { formatQty, splitEggs } from '#shared/utils/quantity'
import { formatDateHint } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'
import type { OrderInput } from '~/utils/order-mutations'
import type { OrderError } from '~/utils/order-errors'
import { checkLinePrice, checkLineQuantity } from '~/utils/sale-validation'
import {
  checkLineAboveDelivered,
  checkOrderClient,
  checkOrderDate,
  checkOrderDateVsDelivery,
  checkWantedBy,
} from '~/utils/order-validation'
import type { QuantityValue } from '~/utils/sale-validation'

export interface OrderSavedEvent {
  kind: 'created' | 'updated' | 'unchanged'
  order: Order | OrderDetail
  /** An edit that left nothing owed made the order Fulfilled by itself (AC19). */
  becameFulfilled?: boolean
}

const props = defineProps<{
  mode: 'add' | 'edit'
  /** Edit: the order as the list had it when the form opened (its `version` goes back with the save). */
  order?: Order | null
  /** Edit: its deliveries, when known, so the order date can be kept from passing the first one (AC57). */
  deliveries?: readonly OrderDelivery[] | null
  /** The device's local date. */
  today: IsoDate
}>()

const emit = defineEmits<{
  'cancel': []
  'saved': [event: OrderSavedEvent]
  'changed-elsewhere': []
}>()

const { activeSizes, sizeById, trayEggs, currency, formatPrice } = useFarm()
const { activeClients, sorted: allClients } = useClients()
const mutations = useOrderMutations()

const isEdit = computed(() => props.mode === 'edit')
const original = computed(() => (isEdit.value ? (props.order ?? null) : null))
const rules = computed(() => (original.value ? orderEditRules(original.value) : null))
const clientLocked = computed(() => rules.value?.clientLocked ?? false)

// ---- Header state ---------------------------------------------------------------------------------------
const state = reactive({
  clientId: original.value?.clientId ?? (null as string | null),
  orderDate: original.value?.orderDate ?? (props.today as IsoDate),
  wantedBy: original.value?.wantedBy ?? ('' as string),
})

// ---- Client picker + price pre-fill (AC11, AC13) -----------------------------------------------------------
const clientOptions = computed<ClientPickerOption[]>(() => {
  const list: ClientPickerOption[] = activeClients.value.map(c => ({ id: c.id, name: c.name, inactive: false }))
  const kept = original.value?.clientId
  if (kept && !list.some(c => c.id === kept)) {
    const found = allClients.value.find(c => c.id === kept)
    if (found) list.push({ id: found.id, name: found.name, inactive: !found.active })
  }
  return list
})

const lockedClientText = computed(() => {
  const c = allClients.value.find(x => x.id === state.clientId)
  if (!c) return ORDER_COPY.clientUnknown
  return c.active ? c.name : ORDER_COPY.clientInactiveOption(c.name)
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
  /** True until the owner types this line's price by hand (AC13): it follows the client's default. */
  priceIsUsual: boolean
  /** An existing line that already has deliveries: size read-only, floor on the quantity (AC19). */
  locked: boolean
}

function buildSizeLines(): SizeLineState[] {
  const active = activeSizes.value
  const activeIds = new Set(active.map(s => s.id))
  const onOrder = isEdit.value && props.order
    ? new Set(props.order.lines.map(l => l.sizeId))
    : new Set<string>()

  const archivedOnOrder = [...onOrder]
    .filter(id => !activeIds.has(id))
    .map(id => sizeById(id))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const allSizes = [
    ...active.map(s => ({ id: s.id, name: s.name, colorSlot: s.colorSlot, archived: false })),
    ...archivedOnOrder.map(s => ({ id: s.id, name: s.name, colorSlot: s.colorSlot, archived: true })),
  ]

  const existingMap = new Map(props.order?.lines.map(l => [l.sizeId, l]) ?? [])
  const lockedSizes = rules.value?.lockedSizes ?? new Set<string>()
  const defaultPrice = clientDefaultPrice.value

  return allSizes.map((s) => {
    const existing = existingMap.get(s.id)
    if (existing) {
      const { trays, loose } = splitEggs(existing.orderedEggs, trayEggs.value)
      return {
        sizeId: s.id,
        name: s.name,
        colorSlot: s.colorSlot,
        archived: s.archived,
        qty: { trays, loose },
        priceRaw: formatPriceInput(existing.pricePerTray),
        priceIsUsual: false,
        locked: lockedSizes.has(s.id),
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
      locked: false,
    }
  })
}

const lines = ref<SizeLineState[]>(buildSizeLines())

function sizeNameFor(line: SizeLineState): string {
  return line.name
}

function minEggsFor(line: SizeLineState): number | undefined {
  return line.locked ? rules.value?.minEggs[line.sizeId] : undefined
}

function lockedLabelFor(line: SizeLineState): string | undefined {
  const min = minEggsFor(line)
  if (!line.locked || min === undefined) return undefined
  return ORDER_COPY.lockedLineAria(line.name, formatQty(min, trayEggs.value))
}

function minNoteFor(line: SizeLineState): string | undefined {
  const min = minEggsFor(line)
  return min === undefined ? undefined : ORDER_COPY.atLeastDelivered(formatQty(min, trayEggs.value))
}

const body = useTemplateRef<HTMLElement>('body')

watch(clientDefaultPrice, (price) => {
  if (price === null) return
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

// ---- Add-client sheet on top (flow K, AC11) --------------------------------------------------------------
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

// ---- Live totals (AC14) -----------------------------------------------------------------------------------
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
  if (!hasQuantity(line) && !line.locked) return null
  const eggs = lineEggs(line)
  const price = linePrice(line)
  if (eggs === null || price === null) return null
  return computeLineTotal(price, eggs, trayEggs.value)
}

const activeLines = computed(() => lines.value.filter(l => hasQuantity(l) || l.locked))
const completeLineTotals = computed(() => activeLines.value.map(lineTotalFor))
const allLinesComplete = computed(() => activeLines.value.length > 0 && completeLineTotals.value.every(t => t !== null))
const runningTotal = computed(() => completeLineTotals.value.reduce((sum: number, t) => sum + (t ?? 0), 0))

const footerTotalText = computed(() => {
  if (activeLines.value.length === 0) return ORDER_COPY.orderTotalEmpty
  const formatted = formatPrice(runningTotal.value)
  return allLinesComplete.value ? ORDER_COPY.orderTotal(formatted) : ORDER_COPY.orderTotalSoFar(formatted)
})

/** AC19: the live note before Save when every line's ordered amount now equals what was delivered. */
const willBecomeFulfilled = computed(() => {
  const r = rules.value
  if (!r || !isEdit.value) return false
  const inputs: { sizeId: string, eggs: number }[] = []
  for (const line of lines.value) {
    if (!hasQuantity(line) && !line.locked) continue
    const eggs = lineEggs(line)
    if (eggs === null) return false
    inputs.push({ sizeId: line.sizeId, eggs })
  }
  return r.willFulfil(inputs)
})

// ---- Dirty (discard check, AC16) --------------------------------------------------------------------------
function snapshot(): string {
  return JSON.stringify({
    c: state.clientId,
    d: state.orderDate,
    w: state.wantedBy,
    lines: lines.value
      .filter(l => hasQuantity(l) || l.locked)
      .map(l => ({ s: l.sizeId, t: l.qty.trays, l: l.qty.loose, p: l.priceRaw })),
  })
}

const initialSnapshot = snapshot()
const addTouched = computed(() => {
  if (isEdit.value) return false
  if (state.clientId !== null || state.wantedBy !== '') return true
  return lines.value.some(hasQuantity)
})
const dirty = computed(() => (isEdit.value ? snapshot() !== initialSnapshot : addTouched.value))

// ---- Errors ------------------------------------------------------------------------------------------------
const clientError = ref<string | null>(null)
const orderDateError = ref<string | null>(null)
const wantedByError = ref<string | null>(null)
const lineErrors = ref<Record<string, { size?: string, quantity?: string, price?: string }>>({})
const formError = ref<string | null>(null)

const saving = computed(() => mutations.saving.value)
const busy = computed(() => saving.value)

function clearErrors() {
  clientError.value = null
  orderDateError.value = null
  wantedByError.value = null
  lineErrors.value = {}
  formError.value = null
}

/** The earliest non-voided delivery's date, for AC57. Null when none (or the deliveries aren't known). */
const firstDeliveryDate = computed<IsoDate | null>(() => {
  const dates = (props.deliveries ?? []).filter(d => d.voidedAt === null).map(d => d.deliveredDate).sort()
  return dates[0] ?? null
})

function focusFirstProblem() {
  if (clientError.value) {
    document.querySelector<HTMLElement>('[data-order-focus="client"]')?.focus()
    return
  }
  const firstErrorSizeId = lines.value.find(l => lineErrors.value[l.sizeId])?.sizeId
  if (firstErrorSizeId) {
    const idx = lines.value.findIndex(l => l.sizeId === firstErrorSizeId)
    body.value?.querySelectorAll<HTMLInputElement>('input[data-qty-input]')[idx * 2]?.focus()
    return
  }
  if (orderDateError.value || wantedByError.value) {
    const target = document.querySelector<HTMLElement>(orderDateError.value ? '[data-order-focus="date"]' : '[data-order-focus="wanted"]')
    target?.scrollIntoView({ block: 'center' })
    target?.focus()
  }
}

function validate(): { input: OrderInput } | null {
  clearErrors()
  let ok = true

  const clientCheck = checkOrderClient(state.clientId)
  if (!clientCheck.ok) {
    clientError.value = clientCheck.message
    ok = false
  }

  const dateCheck = checkOrderDate(state.orderDate, props.today)
  if (!dateCheck.ok) {
    orderDateError.value = dateCheck.message
    ok = false
  }
  else {
    const vsDelivery = checkOrderDateVsDelivery(state.orderDate, firstDeliveryDate.value, props.today)
    if (!vsDelivery.ok) {
      orderDateError.value = vsDelivery.message
      ok = false
    }
  }

  const wantedCheck = checkWantedBy(state.wantedBy, state.orderDate, props.today)
  if (!wantedCheck.ok) {
    wantedByError.value = wantedCheck.message
    ok = false
  }

  const lineInputs: OrderLineInput[] = []
  const enteredSizes = lines.value.filter(l => hasQuantity(l) || l.locked)

  if (enteredSizes.length === 0) {
    formError.value = 'Enter a quantity for at least one size.'
    ok = false
  }
  else if (enteredSizes.length > MAX_ORDER_LINES) {
    formError.value = ORDER_COPY.tooManySizes
    ok = false
  }

  for (const line of lines.value) {
    if (!hasQuantity(line) && !line.locked) continue

    const errs: { size?: string, quantity?: string, price?: string } = {}
    const qtyCheck = checkLineQuantity(line.qty, trayEggs.value)
    if (!qtyCheck.ok) {
      errs.quantity = qtyCheck.message
      ok = false
    }
    else {
      const floor = minEggsFor(line)
      const above = floor === undefined ? null : checkLineAboveDelivered(qtyCheck.value, floor, trayEggs.value)
      if (above && !above.ok) {
        errs.quantity = above.message
        ok = false
      }
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

  if (!ok || !clientCheck.ok || !wantedCheck.ok) {
    focusFirstProblem()
    return null
  }
  return { input: { clientId: clientCheck.value, orderDate: state.orderDate, wantedBy: wantedCheck.value, lines: lineInputs } }
}

function applyServerFields(fields: Record<string, string>): boolean {
  let mapped = false
  if (fields[ORDER_FIELDS.clientId]) {
    clientError.value = fields[ORDER_FIELDS.clientId]!
    mapped = true
  }
  if (fields[ORDER_FIELDS.orderDate]) {
    orderDateError.value = fields[ORDER_FIELDS.orderDate]!
    mapped = true
  }
  if (fields[ORDER_FIELDS.wantedBy]) {
    wantedByError.value = fields[ORDER_FIELDS.wantedBy]!
    mapped = true
  }
  if (fields[ORDER_FIELDS.lines]) {
    formError.value = fields[ORDER_FIELDS.lines]!
    mapped = true
  }
  for (const line of lines.value) {
    const message = fields[ORDER_FIELDS.line(line.sizeId)]
    if (message) {
      lineErrors.value = { ...lineErrors.value, [line.sizeId]: { ...lineErrors.value[line.sizeId], quantity: message } }
      mapped = true
    }
  }
  return mapped
}

function handleFailure(error: OrderError) {
  if (error.kind === 'validation') {
    if (applyServerFields(error.fields ?? {})) return
  }
  if (error.kind === 'order_changed' && isEdit.value) {
    emit('changed-elsewhere')
    return
  }
  if (error.kind === 'order_closed') {
    formError.value = ORDER_COPY.orderClosed
    return
  }
  formError.value = isEdit.value ? ORDER_COPY.editSaveFailed : ORDER_COPY.saveFailed
}

async function attemptSave() {
  if (busy.value) return
  const validated = validate()
  if (!validated) return

  if (isEdit.value) {
    const o = original.value
    if (!o) return
    if (!dirty.value) {
      emit('saved', { kind: 'unchanged', order: o })
      return
    }
    const becameFulfilled = willBecomeFulfilled.value
    const result = await mutations.update(o, validated.input)
    if (!result) return
    if (result.ok) emit('saved', { kind: 'updated', order: result.data.order, becameFulfilled })
    else handleFailure(result.error)
    return
  }

  const result = await mutations.create(validated.input)
  if (!result) return
  if (result.ok) emit('saved', { kind: 'created', order: result.data.order })
  else handleFailure(result.error)
}

async function onSubmit(_event: FormSubmitEvent<unknown>) {
  await attemptSave()
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
        {{ isEdit && original ? ORDER_COPY.editTitle(original.orderNumber) : ORDER_COPY.newTitle }}
      </h2>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :aria-label="ORDER_COPY.close"
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
      <UFormField
        :label="ORDER_COPY.clientLabel"
        size="xl"
        :error="clientError ?? undefined"
        :help="clientLocked ? ORDER_COPY.clientLockedHelper : undefined"
        :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm', help: 'mt-1 text-sm text-dimmed' }"
      >
        <div
          v-if="clientLocked"
          class="flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 py-2 text-base text-highlighted ring ring-inset ring-default"
        >
          <span class="min-w-0 flex-1 wrap-anywhere">{{ lockedClientText }}</span>
          <UIcon
            name="i-lucide-lock"
            class="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
        </div>
        <ClientPicker
          v-else
          v-model="state.clientId"
          data-order-focus="client"
          :options="clientOptions"
          :optional="false"
          :disabled="busy"
          :placeholder="ORDER_COPY.clientPlaceholder"
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
            id-prefix="order-line"
            :index="i"
            :size-name="sizeNameFor(line)"
            :archived="line.archived"
            :color-slot="line.colorSlot"
            :eggs-per-tray="trayEggs"
            :currency="currency"
            hide-on-hand
            :locked-label="lockedLabelFor(line)"
            :min-eggs="minEggsFor(line)"
            :min-note="minNoteFor(line)"
            :price-note="line.locked ? ORDER_COPY.lockedPriceNote : undefined"
            :show-usual-price-note="line.priceIsUsual && line.priceRaw.trim() !== ''"
            :line-total="lineTotalFor(line)"
            :disabled="busy"
            :size-error="lineErrors[line.sizeId]?.size"
            :quantity-error="lineErrors[line.sizeId]?.quantity"
            :price-error="lineErrors[line.sizeId]?.price"
            @price-edited="onLinePriceEdited(line)"
          />
        </div>
      </fieldset>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UFormField
          :label="ORDER_COPY.orderDateLabel"
          size="xl"
          :error="orderDateError ?? undefined"
          :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
        >
          <UInput
            v-model="state.orderDate"
            type="date"
            data-order-focus="date"
            :max="today"
            size="xl"
            class="w-full"
            :disabled="busy"
          />
          <p
            v-if="!orderDateError"
            class="mt-1 text-sm text-muted"
          >
            {{ formatDateHint(state.orderDate, today) }}
          </p>
        </UFormField>

        <UFormField
          :label="ORDER_COPY.wantedByLabel"
          size="xl"
          :error="wantedByError ?? undefined"
          :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
        >
          <UInput
            v-model="state.wantedBy"
            type="date"
            data-order-focus="wanted"
            :min="state.orderDate"
            size="xl"
            class="w-full"
            :disabled="busy"
          />
          <p
            v-if="!wantedByError && state.wantedBy"
            class="mt-1 text-sm text-muted"
          >
            {{ formatDateHint(state.wantedBy, today) }}
          </p>
        </UFormField>
      </div>

      <UAlert
        v-if="willBecomeFulfilled"
        role="status"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        :title="ORDER_COPY.becomesFulfilled"
      />
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
            :label="ORDER_COPY.cancel"
            :disabled="busy"
            @click="emit('cancel')"
          />
          <UButton
            type="submit"
            size="xl"
            class="flex-1 justify-center lg:flex-none lg:px-6"
            :label="ORDER_COPY.save"
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
</template>
