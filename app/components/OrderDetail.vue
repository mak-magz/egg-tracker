<!--
  Order detail (feature 05 §2.5 "Order detail", AC7, AC8, AC21, AC22, AC34, AC35, flow G/H): read-only content with
  the actions that apply, laid out as the future invoice — number, status, client, dates, the Status control (before
  the first delivery only), every line (ordered / delivered / left, price, total), the order total and the list of
  deliveries. A bottom sheet on phones, a 480px slide-over on desktop (detailUi()); an overlay, not a page, so the
  filters and scroll position underneath survive and nothing goes in the address bar (AC53).
  This component only renders and emits: orders.vue owns every dialog the actions open. Which buttons exist comes only
  from orderActions() (AC8). `readonly` (opened from the Sales screen, D10/U2) hides every action and offers one
  "Open in Orders" link instead.
-->
<script setup lang="ts">
import type { IsoDate, Order, OrderDelivery, OrderManualStatus } from '#shared/types/api'
import { ORDER_MANUAL_STATUSES } from '#shared/constants/orders'
import { orderActions } from '#shared/utils/order-status'
import { formatQty } from '#shared/utils/quantity'
import { formatShortDate, formatWeekdayDate } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'

const props = defineProps<{
  order: Order | null
  /** null while they load; the order's own list otherwise (voided ones included, marked). */
  deliveries: readonly OrderDelivery[] | null
  deliveriesFailed?: boolean
  today: IsoDate
  /** A status move, cancel, close short or deliver is running for this order. */
  busy?: boolean
  /** The status option whose request is running. */
  busyStatus?: OrderManualStatus | null
  /** Opened from another screen: no actions, one link to the screen that owns them. */
  readonly?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'edit': [order: Order]
  'deliver': [order: Order]
  'cancel': [order: Order]
  'close-short': [order: Order]
  'status': [order: Order, status: OrderManualStatus]
  'open-sale': [delivery: OrderDelivery]
  'retry-deliveries': []
  'open-elsewhere': [order: Order]
}>()

const { sizeById, trayEggs, formatPrice } = useFarm()
const { sorted: allClients } = useClients()

const actions = computed(() => (props.order ? orderActions(props.order) : null))
const showStatusControl = computed(() => !!props.order && (ORDER_MANUAL_STATUSES as readonly string[]).includes(props.order.status))
const hasFooter = computed(() => !props.readonly && !!actions.value && (actions.value.deliver || actions.value.edit))

const clientText = computed(() => {
  const order = props.order
  if (!order) return ''
  const c = allClients.value.find(x => x.id === order.clientId)
  if (!c) return ORDER_COPY.clientUnknown
  return c.active ? c.name : `${c.name} · ${ORDER_COPY.inactive}`
})

const closedShort = computed(() => props.order?.status === 'fulfilled' && props.order.closedShortAt !== null)

const note = computed<string | null>(() => {
  const order = props.order
  if (!order) return null
  if (order.status === 'cancelled') {
    return ORDER_COPY.noteCancelled(order.cancelledAt ? formatShortDate(order.cancelledAt, props.today) : '')
  }
  if (order.status === 'fulfilled') {
    if (order.closedShortAt) {
      const dropped = order.lines
        .filter(l => l.droppedEggs > 0)
        .map(l => `${sizeById(l.sizeId).name} ${formatQty(l.droppedEggs, trayEggs.value)}`)
        .join(', ')
      return ORDER_COPY.noteClosedShort(formatShortDate(order.closedShortAt, props.today), dropped)
    }
    return ORDER_COPY.noteFulfilled
  }
  return null
})

function lineArchived(sizeId: string): boolean {
  const s = sizeById(sizeId)
  return !s.known || !s.active
}

const ui = detailUi()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="order ? ORDER_COPY.orderTitle(order.orderNumber) : ''"
    :dismissible="true"
    :ui="ui"
  >
    <template #content>
      <div
        v-if="order"
        class="flex min-h-0 flex-1 flex-col"
      >
        <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2 sm:ps-5">
          <h2 class="flex-1 text-lg font-bold text-highlighted">
            {{ ORDER_COPY.orderTitle(order.orderNumber) }}
          </h2>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="ORDER_COPY.close"
            class="size-11 justify-center lg:size-10"
            @click="open = false"
          />
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div class="flex flex-col items-start gap-1">
            <OrderStatusBadge :order="order" />
            <p
              v-if="order.convertedFromSaleNumber !== null"
              class="text-sm text-muted"
            >
              {{ ORDER_COPY.formerlySale(order.convertedFromSaleNumber) }}
            </p>
          </div>
          <p
            v-if="note"
            class="text-sm text-default"
          >
            {{ note }}
          </p>

          <dl class="flex flex-col gap-1.5 text-base">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                {{ ORDER_COPY.detailClient }}
              </dt>
              <dd class="text-right font-semibold wrap-anywhere text-highlighted">
                {{ clientText }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                {{ ORDER_COPY.detailOrderDate }}
              </dt>
              <dd class="text-right font-semibold text-highlighted">
                {{ formatShortDate(order.orderDate, today) }}
              </dd>
            </div>
            <div
              v-if="order.wantedBy"
              class="flex justify-between gap-3"
            >
              <dt class="text-muted">
                {{ ORDER_COPY.detailWantedBy }}
              </dt>
              <dd class="text-right font-semibold text-highlighted">
                {{ formatWeekdayDate(order.wantedBy, today) }}
              </dd>
            </div>
          </dl>

          <div
            v-if="showStatusControl && !readonly"
            class="flex flex-col gap-2 border-t border-default pt-3"
          >
            <p class="text-base text-muted">
              {{ ORDER_COPY.detailStatus }}
            </p>
            <OrderStatusControl
              :current="order.status as OrderManualStatus"
              :busy-status="busyStatus ?? null"
              :disabled="busy && !busyStatus"
              @select="(s: OrderManualStatus) => emit('status', order!, s)"
            />
          </div>

          <div class="flex flex-col gap-4 border-t border-default pt-3">
            <div
              v-for="line in order.lines"
              :key="line.sizeId"
              class="flex flex-col gap-1.5"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="text-base font-semibold wrap-anywhere text-highlighted">
                  {{ sizeById(line.sizeId).name }}<template v-if="lineArchived(line.sizeId)">
                    · {{ ORDER_COPY.archived }}
                  </template>
                </p>
                <p class="shrink-0 text-base font-semibold text-highlighted">
                  {{ formatPrice(line.lineTotal) }}
                </p>
              </div>
              <OrderProgress
                :line="line"
                hide-name
              />
              <dl class="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt class="text-muted">
                    {{ ORDER_COPY.detailOrdered }}
                  </dt>
                  <dd class="font-semibold text-highlighted">
                    {{ formatQty(line.orderedEggs, trayEggs) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    {{ ORDER_COPY.detailDelivered }}
                  </dt>
                  <dd class="font-semibold text-highlighted">
                    {{ formatQty(line.deliveredEggs, trayEggs) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    {{ closedShort ? ORDER_COPY.detailDropped : ORDER_COPY.detailLeft }}
                  </dt>
                  <dd class="font-semibold text-highlighted">
                    {{ formatQty(closedShort ? line.droppedEggs : line.remainingEggs, trayEggs) }}
                  </dd>
                </div>
              </dl>
              <p class="text-sm text-muted">
                {{ ORDER_COPY.atPrice(formatPrice(line.pricePerTray)) }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between border-t border-default pt-3 text-lg font-bold text-highlighted">
            <span>{{ ORDER_COPY.detailOrderTotal }}</span>
            <span>{{ formatPrice(order.orderTotal) }}</span>
          </div>

          <OrderDeliveriesList
            v-if="order.status !== 'cancelled' || (deliveries && deliveries.length) || deliveriesFailed"
            :deliveries="deliveries"
            :failed="deliveriesFailed"
            :today="today"
            @open="(d: OrderDelivery) => emit('open-sale', d)"
            @retry="emit('retry-deliveries')"
          />
        </div>

        <div
          v-if="readonly"
          class="flex shrink-0 flex-col gap-2 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4"
        >
          <UButton
            size="xl"
            class="min-h-11 justify-center"
            icon="i-lucide-external-link"
            :label="ORDER_COPY.openInOrders"
            @click="emit('open-elsewhere', order)"
          />
        </div>
        <div
          v-else-if="hasFooter && actions"
          class="flex shrink-0 flex-wrap-reverse gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4"
        >
          <UButton
            v-if="actions.cancel"
            color="error"
            variant="outline"
            size="xl"
            class="min-h-11 justify-center"
            :label="ORDER_COPY.detailCancelOrder"
            :disabled="busy"
            data-order-focus="detail-cancel"
            @click="emit('cancel', order)"
          />
          <UButton
            v-if="actions.closeShort"
            color="error"
            variant="outline"
            size="xl"
            class="min-h-11 justify-center"
            :label="ORDER_COPY.detailCloseShort"
            :disabled="busy"
            data-order-focus="detail-close-short"
            @click="emit('close-short', order)"
          />
          <UButton
            v-if="actions.edit"
            color="neutral"
            variant="outline"
            size="xl"
            class="min-h-11 justify-center"
            :label="ORDER_COPY.detailEdit"
            :disabled="busy"
            @click="emit('edit', order)"
          />
          <UButton
            v-if="actions.deliver"
            size="xl"
            class="min-h-11 min-w-32 flex-1 justify-center"
            :label="ORDER_COPY.detailDeliver"
            :disabled="busy"
            data-order-focus="detail-deliver"
            @click="emit('deliver', order)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
