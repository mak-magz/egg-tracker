<!--
  Deliver: one small step (feature 05 §2.5 "Deliver step", flow B, AC24 to AC31, AC33). Names the order, asks for the
  Delivered date (default today), and lists every line that still has eggs remaining with a "deliver now" quantity
  PRE-FILLED with what is left, so delivering everything is 2 taps (Deliver, then this button). Lower a line (down to
  0 to leave it out) to deliver part of an order; a line can't exceed what is left ("Only {qty} left to deliver.").
  The shortfall warning is INLINE (AC30, no second dialog): the cached on-hand figures drive it live, the server has the
  last word (a 409 stock_short flips the same step to the panel, values and submission id kept, and the next tap sends
  confirmShortfall). A 409 over_delivery refreshes the lines to the current remaining; a closed/changed order closes
  the step with the stale toast. Cancel/closing changes nothing; there is no discard check (only pre-filled values).
  A bottom sheet below md, a centred 480px dialog at md+.
-->
<script setup lang="ts">
import type { IsoDate, Order, OrderDetail, ShortfallLine } from '#shared/types/api'
import { deliverableLines } from '#shared/utils/order-status'
import { computeLineTotal } from '#shared/utils/price'
import { formatQty, splitEggs } from '#shared/utils/quantity'
import { formatShortDate } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'
import { checkDeliverDate, checkDeliverQuantity } from '~/utils/order-validation'
import type { QuantityValue } from '~/utils/sale-validation'
import type { OrderMutations } from '~/composables/useOrderMutations'

export interface OrderDeliveredEvent {
  order: OrderDetail
  saleNumber: number | string
  sizeIds: string[]
}

const props = defineProps<{
  order: Order | null
  today: IsoDate
  mutations: OrderMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  /** The delivery was saved. */
  delivered: [event: OrderDeliveredEvent]
  /** The order was cancelled, fulfilled or changed elsewhere: the step closed and the screen must say so. */
  stale: []
  /** The step has closed and its focus return was suppressed: put focus where it belongs. */
  closed: []
}>()

const { sizeById, trayEggs, formatPrice } = useFarm()
const { sorted: allClients } = useClients()
const onHand = useOnHand()

interface Row {
  sizeId: string
  remaining: number
  pricePerTray: number
  qty: QuantityValue
}

const date = ref<IsoDate>(props.today)
const rows = ref<Row[]>([])
const alertMessage = ref<string | null>(null)
const serverShortfall = ref<ShortfallLine[] | null>(null)

function buildRows(order: Order): Row[] {
  return deliverableLines(order).map((l) => {
    const { trays, loose } = splitEggs(l.remainingEggs, trayEggs.value)
    return { sizeId: l.sizeId, remaining: l.remainingEggs, pricePerTray: l.pricePerTray, qty: { trays, loose } }
  })
}

watch(open, (isOpen) => {
  if (!isOpen || !props.order) return
  date.value = props.today
  rows.value = buildRows(props.order)
  alertMessage.value = null
  serverShortfall.value = null
  props.mutations.resetDeliver()
  void onHand.ensure(rows.value.map(r => r.sizeId))
})

const busy = computed(() => (props.order ? props.mutations.pendingIds.value.includes(props.order.id) : false))

const clientName = computed(() => {
  const order = props.order
  if (!order) return ''
  const c = allClients.value.find(x => x.id === order.clientId)
  if (!c) return ORDER_COPY.clientUnknown
  return c.active ? c.name : ORDER_COPY.clientInactiveOption(c.name)
})

// ---- Checks (live: the steppers stop at the remaining amount, so only a typed value can exceed it) --------------
const checks = computed(() => rows.value.map(r => checkDeliverQuantity(r.qty, trayEggs.value, r.remaining)))
function rowEggs(i: number): number {
  const c = checks.value[i]
  return c && c.ok ? c.value : 0
}
function rowError(i: number): string | undefined {
  const c = checks.value[i]
  return c && !c.ok ? c.message : undefined
}

const anyRowInvalid = computed(() => checks.value.some(c => !c.ok))
const totalEggsNow = computed(() => rows.value.reduce((sum, _r, i) => sum + rowEggs(i), 0))
const nothingToDeliver = computed(() => rows.value.length > 0 && !anyRowInvalid.value && totalEggsNow.value === 0)

const dateCheck = computed(() => (props.order ? checkDeliverDate(date.value, props.order.orderDate, props.today) : null))
const dateError = computed(() => (dateCheck.value && !dateCheck.value.ok ? dateCheck.value.message : null))

function rowTotal(i: number): number | null {
  const eggs = rowEggs(i)
  const row = rows.value[i]
  if (!row || eggs === 0) return null
  return computeLineTotal(row.pricePerTray, eggs, trayEggs.value)
}
const deliveryTotal = computed(() => rows.value.reduce((sum, _r, i) => sum + (rowTotal(i) ?? 0), 0))

// ---- Stock panel (AC30) -----------------------------------------------------------------------------------------
const previewShortfall = computed(() => rows.value
  .map((r, i) => ({ sizeId: r.sizeId, needed: rowEggs(i), entry: onHand.entry(r.sizeId) }))
  .filter(l => l.needed > 0 && l.entry.status === 'ready' && l.entry.eggs !== null && l.entry.eggs < l.needed)
  .map(l => ({ sizeId: l.sizeId, onHand: l.entry.eggs ?? 0, needed: l.needed })))

const shortLines = computed(() => {
  if (previewShortfall.value.length) return previewShortfall.value
  return (serverShortfall.value ?? []).map(s => ({ sizeId: s.sizeId, onHand: s.onHandEggs, needed: s.neededEggs }))
})

const stockChecking = computed(() => rows.value.some((r, i) => rowEggs(i) > 0 && onHand.entry(r.sizeId).status === 'loading'))
const stockCheckFailed = computed(() => rows.value.some((r, i) => rowEggs(i) > 0 && onHand.entry(r.sizeId).status === 'error'))

// Changing what is delivered makes the server's earlier shortfall answer stale; the live figures take over.
watch(() => JSON.stringify(rows.value.map(r => [r.sizeId, r.qty.trays, r.qty.loose])), () => {
  serverShortfall.value = null
})

const blocked = computed(() => !!dateError.value || anyRowInvalid.value || nothingToDeliver.value || rows.value.length === 0)

/** The lines of an order the server just returned replace the step's remaining amounts (AC26, raced delivery). */
function applyCurrent(current: OrderDetail) {
  const byId = new Map(current.lines.map(l => [l.sizeId, l]))
  rows.value = rows.value
    .map((r) => {
      const line = byId.get(r.sizeId)
      return line ? { ...r, remaining: line.remainingEggs, pricePerTray: line.pricePerTray } : r
    })
    .filter(r => r.remaining > 0)
}

async function confirm() {
  const order = props.order
  if (!order || busy.value || blocked.value) return
  alertMessage.value = null
  const lines = rows.value
    .map((r, i) => ({ sizeId: r.sizeId, eggs: rowEggs(i) }))
    .filter(l => l.eggs > 0)
  if (lines.length === 0) return
  const result = await props.mutations.deliver(order.id, { deliveredDate: date.value, lines }, shortLines.value.length > 0)
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('delivered', { order: result.data.order, saleNumber: result.data.sale.saleNumber, sizeIds: lines.map(l => l.sizeId) })
    return
  }
  const error = result.error
  if (error.kind === 'stock_short') {
    serverShortfall.value = error.shortfall ?? []
    return
  }
  if (error.kind === 'over_delivery') {
    if (error.order) applyCurrent(error.order)
    alertMessage.value = ORDER_COPY.raced
    return
  }
  if (error.kind === 'order_closed' || error.kind === 'order_changed' || error.kind === 'not_found') {
    open.value = false
    emit('stale')
    return
  }
  if (error.kind === 'validation') {
    alertMessage.value = Object.values(error.fields ?? {})[0] ?? ORDER_COPY.deliverFailed
    return
  }
  alertMessage.value = ORDER_COPY.deliverFailed
}

function close() {
  if (busy.value) return
  open.value = false
}

function onOpenAutoFocus(event: Event) {
  // The Deliver button takes focus, so Enter confirms (AC24).
  event.preventDefault()
  void nextTick(() => document.querySelector<HTMLElement>('[data-deliver-confirm]')?.focus())
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

function onUpdateOpen(value: boolean) {
  if (!value && busy.value) return
  open.value = value
}

const ui = sheetUi(480)
</script>

<template>
  <UModal
    :open="open"
    :title="order ? ORDER_COPY.deliverTitle(order.orderNumber) : ''"
    :dismissible="!busy"
    :close="false"
    :content="{ onOpenAutoFocus, onCloseAutoFocus }"
    :ui="ui"
    @update:open="onUpdateOpen"
  >
    <template #content>
      <form
        v-if="order"
        class="flex min-h-0 flex-1 flex-col"
        novalidate
        @submit.prevent="confirm"
      >
        <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2 sm:ps-5">
          <h2 class="flex-1 text-lg font-bold text-highlighted">
            {{ ORDER_COPY.deliverTitle(order.orderNumber) }}
          </h2>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="ORDER_COPY.close"
            class="size-11 justify-center lg:size-10"
            :disabled="busy"
            @click="close"
          />
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <p class="text-base font-medium wrap-anywhere text-highlighted">
            {{ ORDER_COPY.deliverOrderLine(order.orderNumber, clientName) }}
          </p>

          <UFormField
            :label="ORDER_COPY.deliveredDateLabel"
            size="xl"
            :error="dateError ?? undefined"
            :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
          >
            <UInput
              v-model="date"
              type="date"
              :min="order.orderDate"
              :max="today"
              size="xl"
              class="w-full"
              :disabled="busy"
            />
            <p
              v-if="!dateError"
              class="mt-1 text-sm text-muted"
            >
              {{ ORDER_COPY.deliveredHint(date === today ? ORDER_COPY.today : formatShortDate(date, today), formatShortDate(order.orderDate, today)) }}
            </p>
          </UFormField>

          <div class="flex flex-col gap-2">
            <p class="text-base font-medium text-default">
              {{ ORDER_COPY.deliverNowLabel }}
            </p>
            <fieldset
              v-for="(row, i) in rows"
              :key="row.sizeId"
              class="flex flex-col gap-2 rounded-md bg-muted p-3"
            >
              <legend class="sr-only">
                {{ sizeById(row.sizeId).name }} {{ ORDER_COPY.deliverNowLabel }}
              </legend>
              <div class="flex items-baseline justify-between gap-3">
                <p class="text-base font-semibold wrap-anywhere text-highlighted">
                  {{ sizeById(row.sizeId).name }}<template v-if="!sizeById(row.sizeId).known || !sizeById(row.sizeId).active">
                    · {{ ORDER_COPY.archived }}
                  </template>
                </p>
                <p class="shrink-0 text-sm text-muted">
                  {{ ORDER_COPY.leftToDeliver(formatQty(row.remaining, trayEggs)) }}
                </p>
              </div>
              <QuantityInput
                v-model="row.qty"
                :eggs-per-tray="trayEggs"
                :label="`${sizeById(row.sizeId).name} deliver now`"
                :id-prefix="`deliver-qty-${i}`"
                :max-eggs="row.remaining"
                :error="rowError(i)"
                :disabled="busy"
                inline-labels
              />
              <div class="flex items-baseline justify-between gap-3 text-sm">
                <span
                  v-if="rowEggs(i) > 0"
                  class="text-muted"
                >{{ ORDER_COPY.atPrice(formatPrice(row.pricePerTray)) }}</span>
                <span
                  v-else
                  class="text-muted"
                >{{ ORDER_COPY.notInDelivery }}</span>
                <span
                  v-if="rowTotal(i) !== null"
                  class="font-semibold tabular-nums text-highlighted"
                >{{ formatPrice(rowTotal(i) ?? 0) }}</span>
              </div>
            </fieldset>
            <p
              v-if="nothingToDeliver"
              class="flex items-start gap-1.5 text-sm text-error"
              role="alert"
            >
              <UIcon
                name="i-lucide-circle-alert"
                class="mt-0.5 size-4 shrink-0"
              />
              <span>{{ ORDER_COPY.deliverNone }}</span>
            </p>
          </div>

          <p
            v-if="stockChecking"
            class="text-sm text-muted"
            role="status"
          >
            {{ ORDER_COPY.checkingStock }}
          </p>
          <p
            v-else-if="stockCheckFailed"
            class="text-sm text-muted"
          >
            {{ ORDER_COPY.stockCheckFailed }}
          </p>

          <UAlert
            v-if="shortLines.length"
            role="status"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            class="shrink-0"
          >
            <template #description>
              <p class="font-medium">
                {{ ORDER_COPY.shortLead }}
              </p>
              <ul class="ps-4">
                <li
                  v-for="l in shortLines"
                  :key="l.sizeId"
                >
                  {{ ORDER_COPY.shortRow(sizeById(l.sizeId).name, formatQty(l.onHand, trayEggs), formatQty(l.needed, trayEggs)) }}
                </li>
              </ul>
              <p class="mt-1">
                {{ ORDER_COPY.shortClosing }}
              </p>
            </template>
          </UAlert>
        </div>

        <div class="flex shrink-0 flex-col gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4">
          <UAlert
            v-if="alertMessage"
            role="alert"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="alertMessage"
          />
          <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
            <p
              class="text-base font-semibold text-highlighted lg:flex-1"
              aria-live="polite"
            >
              {{ ORDER_COPY.thisDelivery(formatPrice(deliveryTotal)) }}
            </p>
            <div class="flex gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                size="xl"
                class="justify-center lg:min-h-10"
                :label="ORDER_COPY.cancel"
                :disabled="busy"
                @click="close"
              />
              <UButton
                type="submit"
                size="xl"
                class="flex-1 justify-center lg:flex-none lg:px-6"
                data-deliver-confirm
                :label="shortLines.length ? ORDER_COPY.deliverAnyway : ORDER_COPY.deliverButton"
                :loading="busy"
                :disabled="busy"
                :aria-disabled="blocked"
              />
            </div>
          </div>
        </div>
      </form>
    </template>
  </UModal>
</template>
