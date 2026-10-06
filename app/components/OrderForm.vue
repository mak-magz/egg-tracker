<!--
  New / Edit order: the whole sheet or dialog content (feature 05 §2.5 "New order" / "Edit order, Partially
  fulfilled", AC9 to AC17, AC19, AC20, AC57). A header part (Client) plus a repeatable lines part (SaleLineCard x1-20,
  Add size) plus Order date / Wanted by plus the footer total. There is NO type toggle, no "Already delivered" and no
  stock hint: ordering never touches stock (AC9, AC10). SELF-CONTAINED like SaleForm: validation, the submission id,
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
import type { SizeChipOption } from './SizeChipPicker.vue'
import { MAX_ORDER_LINES, ORDER_FIELDS } from '#shared/constants/orders'
import { orderEditRules } from '#shared/utils/order-status'
import { computeLineTotal, formatPriceInput } from '#shared/utils/price'
import { formatQty, splitEggs } from '#shared/utils/quantity'
import { formatDateHint } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'
import { SALE_COPY } from '~/utils/sale-copy'
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

// ---- Lines --------------------------------------------------------------------------------------------
interface LineState {
  key: string
  sizeId: string | null
  qty: QuantityValue
  priceRaw: string
  /** True until the owner types this line's price by hand (AC13): it follows the client's default. */
  priceIsUsual: boolean
  /** An existing line that already has deliveries: size read-only, not removable, floor on the quantity (AC19). */
  locked: boolean
}

function newKey(): string {
  return crypto.randomUUID()
}

function emptyLine(price: number | null): LineState {
  return { key: newKey(), sizeId: null, qty: { trays: null, loose: null }, priceRaw: price !== null ? formatPriceInput(price) : '', priceIsUsual: price !== null, locked: false }
}

function buildInitialLines(): LineState[] {
  const order = original.value
  if (!order || order.lines.length === 0) return [emptyLine(null)]
  const lockedSizes = rules.value?.lockedSizes ?? new Set<string>()
  return order.lines.map((line) => {
    const { trays, loose } = splitEggs(line.orderedEggs, trayEggs.value)
    return {
      key: newKey(),
      sizeId: line.sizeId,
      qty: { trays, loose },
      priceRaw: formatPriceInput(line.pricePerTray),
      priceIsUsual: false,
      locked: lockedSizes.has(line.sizeId),
    }
  })
}

const lines = ref<LineState[]>(buildInitialLines())

const activeSizeOptions = computed<SizeChipOption[]>(() =>
  activeSizes.value.map(s => ({ id: s.id, name: s.name, colorSlot: s.colorSlot, archived: false })))

/** This line's own options: every active size, plus its own size if it has since been archived (AC19). */
function sizeOptionsFor(line: LineState): SizeChipOption[] {
  const active = activeSizeOptions.value
  if (line.sizeId && !active.some(s => s.id === line.sizeId)) {
    const resolved = sizeById(line.sizeId)
    return [...active, { id: resolved.id, name: resolved.name, colorSlot: resolved.colorSlot, archived: true }]
  }
  return active
}

function usedSizeIdsFor(line: LineState): string[] {
  return lines.value.filter(l => l.key !== line.key && l.sizeId).map(l => l.sizeId!)
}

function sizeNameFor(line: LineState): string | null {
  return line.sizeId ? sizeById(line.sizeId).name : null
}

function minEggsFor(line: LineState): number | undefined {
  return line.locked && line.sizeId ? rules.value?.minEggs[line.sizeId] : undefined
}

function lockedLabelFor(line: LineState): string | undefined {
  const min = minEggsFor(line)
  if (!line.locked || min === undefined) return undefined
  return ORDER_COPY.lockedLineAria(sizeNameFor(line) ?? '', formatQty(min, trayEggs.value))
}

function minNoteFor(line: LineState): string | undefined {
  const min = minEggsFor(line)
  return min === undefined ? undefined : ORDER_COPY.atLeastDelivered(formatQty(min, trayEggs.value))
}

const canAddLine = computed(() => lines.value.length < MAX_ORDER_LINES)
const allSizesUsed = computed(() => activeSizeOptions.value.length > 0 && activeSizeOptions.value.every(s => lines.value.some(l => l.sizeId === s.id)))
const addDisabledReason = computed(() => {
  if (lines.value.length >= MAX_ORDER_LINES) return ORDER_COPY.addSizeLimitReached
  if (allSizesUsed.value) return ORDER_COPY.addSizeAllUsed
  return null
})

const body = useTemplateRef<HTMLElement>('body')

/** The first control of line `idx`: its size chips, or (a locked line) its trays field. */
function lineEntry(idx: number): HTMLElement | null {
  const card = body.value?.querySelectorAll<HTMLElement>('fieldset[data-order-line]')[idx]
  return card?.querySelector<HTMLElement>('input[type="radio"], select, input[data-qty-input]') ?? null
}

async function addLine() {
  if (!canAddLine.value || allSizesUsed.value) return
  lines.value.push(emptyLine(clientDefaultPrice.value))
  await nextTick()
  const idx = lines.value.length - 1
  lineEntry(idx)?.focus()
  body.value?.querySelectorAll<HTMLElement>('fieldset[data-order-line]')[idx]?.scrollIntoView({ block: 'center' })
}

async function removeLine(key: string) {
  const idx = lines.value.findIndex(l => l.key === key)
  if (idx === -1 || lines.value.length <= 1 || lines.value[idx]?.locked) return
  lines.value.splice(idx, 1)
  await nextTick()
  lineEntry(Math.max(0, idx - 1))?.focus()
}

function onSizeChosen(line: LineState) {
  void nextTick(() => {
    const idx = lines.value.findIndex(l => l.key === line.key)
    body.value?.querySelectorAll<HTMLInputElement>('input[data-qty-input]')[idx * 2]?.focus()
  })
}

// ---- Header state ---------------------------------------------------------------------------------------
const state = reactive({
  clientId: original.value?.clientId ?? null as string | null,
  orderDate: original.value?.orderDate ?? props.today as IsoDate,
  wantedBy: original.value?.wantedBy ?? '' as string,
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

watch(clientDefaultPrice, (price) => {
  if (price === null) return
  for (const line of lines.value) {
    if (line.priceIsUsual || line.priceRaw.trim() === '') {
      line.priceRaw = formatPriceInput(price)
      line.priceIsUsual = true
    }
  }
})

function onLinePriceEdited(line: LineState) {
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
function lineEggs(line: LineState): number | null {
  const check = checkLineQuantity(line.qty, trayEggs.value)
  return check.ok ? check.value : null
}
function linePrice(line: LineState): number | null {
  const check = checkLinePrice(line.priceRaw, currency.value)
  return check.ok ? check.value : null
}
function lineTotalFor(line: LineState): number | null {
  const eggs = lineEggs(line)
  const price = linePrice(line)
  if (eggs === null || price === null || !line.sizeId) return null
  return computeLineTotal(price, eggs, trayEggs.value)
}

const completeLineTotals = computed(() => lines.value.map(lineTotalFor))
const allLinesComplete = computed(() => completeLineTotals.value.every(t => t !== null))
const runningTotal = computed(() => completeLineTotals.value.reduce((sum: number, t) => sum + (t ?? 0), 0))

const footerTotalText = computed(() => {
  const some = completeLineTotals.value.some(t => t !== null)
  if (!some) return ORDER_COPY.orderTotalEmpty
  const formatted = formatPrice(runningTotal.value)
  return allLinesComplete.value ? ORDER_COPY.orderTotal(formatted) : ORDER_COPY.orderTotalSoFar(formatted)
})

/** AC19: the live note before Save when every line's ordered amount now equals what was delivered. */
const willBecomeFulfilled = computed(() => {
  const r = rules.value
  if (!r || !isEdit.value) return false
  const inputs: { sizeId: string, eggs: number }[] = []
  for (const line of lines.value) {
    const eggs = lineEggs(line)
    if (!line.sizeId || eggs === null) return false
    inputs.push({ sizeId: line.sizeId, eggs })
  }
  return r.willFulfil(inputs)
})

// ---- Dirty (discard check, AC16) --------------------------------------------------------------------------
function snapshot(): string {
  return JSON.stringify({ c: state.clientId, d: state.orderDate, w: state.wantedBy, lines: lines.value.map(l => ({ s: l.sizeId, t: l.qty.trays, l: l.qty.loose, p: l.priceRaw })) })
}
const initialSnapshot = snapshot()
const addTouched = computed(() => {
  if (isEdit.value) return false
  if (state.clientId !== null || state.wantedBy !== '') return true
  return lines.value.some(l => l.sizeId !== null || l.qty.trays !== null || l.qty.loose !== null || l.priceRaw.trim() !== '')
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
  const firstLineKey = lines.value.find(l => lineErrors.value[l.key])?.key
  if (firstLineKey) {
    const idx = lines.value.findIndex(l => l.key === firstLineKey)
    body.value?.querySelectorAll<HTMLElement>('fieldset[data-order-line]')[idx]?.scrollIntoView({ block: 'center' })
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

  const seenSizes = new Set<string>()
  const lineInputs: OrderLineInput[] = []
  for (const line of lines.value) {
    const errs: { size?: string, quantity?: string, price?: string } = {}
    if (!line.sizeId) {
      errs.size = SALE_COPY.sizeRequired
      ok = false
    }
    else if (seenSizes.has(line.sizeId)) {
      errs.size = ORDER_COPY.duplicateSize
      ok = false
    }
    else {
      seenSizes.add(line.sizeId)
    }
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
    if (Object.keys(errs).length) lineErrors.value = { ...lineErrors.value, [line.key]: errs }
    if (line.sizeId && qtyCheck.ok && priceCheck.ok) {
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
    const message = line.sizeId ? fields[ORDER_FIELDS.line(line.sizeId)] : undefined
    if (message) {
      lineErrors.value = { ...lineErrors.value, [line.key]: { ...lineErrors.value[line.key], quantity: message } }
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

async function onSubmit(_event: FormSubmitEvent<unknown>) {
  if (busy.value) return
  const validated = validate()
  if (!validated) return

  if (isEdit.value) {
    const order = original.value
    if (!order) return
    if (!dirty.value) {
      emit('saved', { kind: 'unchanged', order })
      return
    }
    const result = await mutations.update(order, validated.input)
    if (!result) return
    if (result.ok) {
      const next = result.data.order
      if (!result.data.changed) emit('saved', { kind: 'unchanged', order: next })
      else emit('saved', { kind: 'updated', order: next, becameFulfilled: order.status !== 'fulfilled' && next.status === 'fulfilled' })
    }
    else {
      handleFailure(result.error)
    }
    return
  }

  const result = await mutations.create(validated.input)
  if (!result) return
  if (result.ok) emit('saved', { kind: 'created', order: result.data.order })
  else handleFailure(result.error)
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
        :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
      >
        <div
          v-if="clientLocked"
          class="flex flex-col gap-1"
        >
          <div class="flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 py-2 text-base text-highlighted ring ring-inset ring-default">
            <span class="min-w-0 flex-1 wrap-anywhere">{{ lockedClientText }}</span>
            <UIcon
              name="i-lucide-lock"
              class="size-4 shrink-0 text-muted"
              aria-hidden="true"
            />
          </div>
          <p class="text-sm text-muted">
            {{ ORDER_COPY.clientLockedHelper }}
          </p>
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

      <SaleLineCard
        v-for="(line, i) in lines"
        :key="line.key"
        v-model:size-id="line.sizeId"
        v-model:qty="line.qty"
        v-model:price-raw="line.priceRaw"
        data-order-line
        id-prefix="order-line"
        :index="i"
        :size-name="sizeNameFor(line)"
        :size-options="sizeOptionsFor(line)"
        :used-size-ids="usedSizeIdsFor(line)"
        :eggs-per-tray="trayEggs"
        :currency="currency"
        hide-on-hand
        :used-label="ORDER_COPY.usedInOrder"
        :used-option-label="ORDER_COPY.usedSizeOption"
        :locked-label="lockedLabelFor(line)"
        :min-eggs="minEggsFor(line)"
        :min-note="minNoteFor(line)"
        :price-note="line.locked ? ORDER_COPY.lockedPriceNote : undefined"
        :show-usual-price-note="line.priceIsUsual && line.priceRaw.trim() !== ''"
        :line-total="lineTotalFor(line)"
        :removable="lines.length > 1 && !line.locked"
        :disabled="busy"
        :size-error="lineErrors[line.key]?.size"
        :quantity-error="lineErrors[line.key]?.quantity"
        :price-error="lineErrors[line.key]?.price"
        @remove="removeLine(line.key)"
        @size-chosen="onSizeChosen(line)"
        @price-edited="onLinePriceEdited(line)"
      />

      <div class="flex flex-col gap-1">
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          icon="i-lucide-plus"
          class="w-full justify-center border-dashed"
          :disabled="busy || !!addDisabledReason"
          :aria-disabled="!!addDisabledReason"
          :label="ORDER_COPY.addSize"
          @click="addLine"
        />
        <p
          v-if="addDisabledReason"
          class="text-sm text-muted"
        >
          {{ addDisabledReason }}
        </p>
      </div>

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
          <UButton
            v-if="state.wantedBy"
            color="neutral"
            variant="ghost"
            size="xl"
            class="mt-1 min-h-11"
            :label="ORDER_COPY.clearWantedBy"
            :disabled="busy"
            @click="state.wantedBy = ''"
          />
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
