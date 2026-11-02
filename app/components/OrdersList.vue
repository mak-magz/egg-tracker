<!--
  The order list (feature 05 §2.5 "Orders list, mobile/desktop", AC2, AC3, AC7, AC47, AC48, O-R5 to O-R8): the table
  when the list area is wide enough (~720px, per UX), stacked cards when it isn't — the switch is the list area's OWN
  width (useElementSize), mirroring SalesList. Renders the given, already sorted and filtered, page ONCE. Client names
  are joined here from useClients() (an order never carries a name, AC53); sizes from useFarm().
  The whole card/row is a real <button> that opens the detail; Deliver and the ⋮ sit above it (z-10) so they don't
  trigger it. Which buttons exist comes only from orderActions() (via OrderRowMenu and `canDeliver`). Status is always
  a word; progress is text next to a decorative bar (OrderProgress).
-->
<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import type { IsoDate, Order, OrderManualStatus } from '#shared/types/api'
import { orderActions, orderStatusLabel } from '#shared/utils/order-status'
import { formatShortDate, formatWeekdayDate } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'

const props = defineProps<{
  orders: readonly Order[]
  today: IsoDate
  loading?: boolean
  highlightedId?: string | null
  busyIds?: readonly string[]
}>()

const emit = defineEmits<{
  'open': [order: Order]
  'deliver': [order: Order]
  'edit': [order: Order]
  'status': [order: Order, status: OrderManualStatus]
  'cancel': [order: Order]
  'close-short': [order: Order]
}>()

const clients = useClients()
const { formatPrice } = useFarm()

const busy = computed(() => new Set(props.busyIds ?? []))

/** null while the client list is still loading (a skeleton shows), so a name never flashes as something else. */
function clientName(order: Order): string | null {
  const c = clients.sorted.value.find(x => x.id === order.clientId)
  if (c) return c.name
  return clients.hasList.value ? ORDER_COPY.clientUnknown : null
}

const LINES_SHOWN = 3
function shownLines(order: Order) {
  return order.lines.slice(0, LINES_SHOWN)
}
function moreCount(order: Order): number {
  return Math.max(0, order.lines.length - LINES_SHOWN)
}
function wantedText(order: Order): string | null {
  return order.wantedBy ? ORDER_COPY.wantedBy(formatWeekdayDate(order.wantedBy, props.today)) : null
}
function canDeliver(order: Order): boolean {
  return orderActions(order).deliver
}
function closedShortNote(order: Order): string | null {
  return order.status === 'fulfilled' && order.closedShortAt ? ORDER_COPY.closedShort : null
}
function cancelledNote(order: Order): string | null {
  return order.status === 'cancelled' ? ORDER_COPY.cancelledNote : null
}

const TABLE_MIN_WIDTH = 720
const sizer = useTemplateRef<HTMLElement>('sizer')
const { width } = useElementSize(sizer)
const wide = computed(() => width.value >= TABLE_MIN_WIDTH)

function rowAria(order: Order): string {
  return ORDER_COPY.openOrderAria(order.orderNumber, clientName(order) ?? ORDER_COPY.clientUnknown, orderStatusLabel(order))
}

const flash = 'animate-[size-row-flash_1.5s_ease-out] motion-reduce:animate-none'
</script>

<template>
  <div>
    <div
      ref="sizer"
      class="h-0 w-full"
      aria-hidden="true"
    />

    <!-- Wide: the table -->
    <div
      v-if="wide"
      class="overflow-hidden rounded-2xl bg-default border border-default/80 shadow-xs"
    >
      <table class="w-full border-collapse">
        <caption class="sr-only">
          {{ ORDER_COPY.tableCaption }}
        </caption>
        <thead>
          <tr class="border-b border-default/80 bg-muted/30">
            <th
              scope="col"
              class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ ORDER_COPY.headerOrder }}
            </th>
            <th
              scope="col"
              class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ ORDER_COPY.headerClient }}
            </th>
            <th
              scope="col"
              class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ ORDER_COPY.headerProgress }}
            </th>
            <th
              scope="col"
              class="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ ORDER_COPY.headerTotal }}
            </th>
            <th
              scope="col"
              class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ ORDER_COPY.headerStatus }}
            </th>
            <th
              scope="col"
              class="w-16 px-2"
            >
              <span class="sr-only">{{ ORDER_COPY.headerActions }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr
              v-for="n in 5"
              :key="n"
              class="border-b border-default last:border-b-0"
              aria-hidden="true"
            >
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-16 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-36 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-48 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="ms-auto h-5 w-16 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-24 bg-accented" />
              </td>
              <td class="px-2 py-3.5" />
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="order in orders"
              :key="order.id"
              :data-order-row="order.id"
              class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
              :class="highlightedId === order.id ? flash : ''"
              @click="emit('open', order)"
            >
              <td class="px-4 py-1.5 align-top">
                <button
                  type="button"
                  class="min-h-11 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  :aria-label="rowAria(order)"
                  :data-order-focus="`open:${order.id}`"
                  @click.stop="emit('open', order)"
                >
                  <span class="block text-base font-semibold text-highlighted">{{ ORDER_COPY.orderNumber(order.orderNumber) }}</span>
                  <span class="block text-sm text-muted">{{ formatShortDate(order.orderDate, today) }}</span>
                </button>
              </td>
              <td class="px-4 py-1.5 align-top">
                <p
                  v-if="clientName(order) !== null"
                  class="pt-2 text-base font-semibold wrap-anywhere text-highlighted"
                >
                  {{ clientName(order) }}
                </p>
                <USkeleton
                  v-else
                  class="mt-2 h-5 w-28 bg-accented"
                />
                <p
                  v-if="wantedText(order)"
                  class="text-sm text-muted"
                >
                  {{ wantedText(order) }}
                </p>
                <p
                  v-if="closedShortNote(order)"
                  class="text-sm text-muted"
                >
                  {{ closedShortNote(order) }}
                </p>
                <p
                  v-if="cancelledNote(order)"
                  class="text-sm text-muted"
                >
                  {{ cancelledNote(order) }}
                </p>
              </td>
              <td class="px-4 py-1.5 align-top">
                <div class="flex flex-col gap-1.5 pt-2">
                  <OrderProgress
                    v-for="line in shownLines(order)"
                    :key="line.sizeId"
                    :line="line"
                    compact
                  />
                  <p
                    v-if="moreCount(order) > 0"
                    class="text-sm text-muted"
                  >
                    {{ ORDER_COPY.moreSizes(moreCount(order)) }}
                  </p>
                </div>
              </td>
              <td class="px-4 py-1.5 text-right align-top">
                <p class="pt-2 text-base font-semibold whitespace-nowrap text-highlighted">
                  {{ formatPrice(order.orderTotal) }}
                </p>
              </td>
              <td class="px-4 py-1.5 align-top">
                <div class="flex flex-col items-start gap-1.5 pt-2">
                  <OrderStatusBadge :order="order" />
                  <UButton
                    v-if="canDeliver(order)"
                    size="md"
                    class="min-h-11 lg:min-h-9"
                    :label="ORDER_COPY.deliver"
                    :aria-label="ORDER_COPY.deliverAria(order.orderNumber)"
                    :data-order-focus="`deliver:${order.id}`"
                    @click.stop="emit('deliver', order)"
                  />
                </div>
              </td>
              <td
                class="px-2 py-1.5 text-right align-top"
                @click.stop
              >
                <div class="pt-1">
                  <OrderRowMenu
                    :order="order"
                    :busy="busy.has(order.id)"
                    @deliver="emit('deliver', order)"
                    @edit="emit('edit', order)"
                    @status="(s: OrderManualStatus) => emit('status', order, s)"
                    @cancel="emit('cancel', order)"
                    @close-short="emit('close-short', order)"
                  />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <slot name="empty" />
    </div>

    <!-- Narrow: stacked cards -->
    <template v-else>
      <div
        v-if="loading"
        class="flex flex-col gap-3"
        aria-hidden="true"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-[220px] w-full rounded-2xl bg-accented"
        />
      </div>
      <ul
        v-else-if="orders.length"
        role="list"
        class="flex flex-col gap-3"
      >
        <li
          v-for="order in orders"
          :key="order.id"
          :data-order-row="order.id"
          class="relative flex flex-col gap-1.5 rounded-2xl bg-default p-5 border border-default/70 hover:border-default shadow-xs hover:shadow-md transition-all active:bg-elevated"
          :class="highlightedId === order.id ? flash : ''"
        >
          <div class="flex items-start justify-between gap-2">
            <button
              type="button"
              class="-m-1 flex min-h-11 min-w-0 flex-1 flex-col items-start gap-0.5 rounded-2xl p-1 text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
              :aria-label="rowAria(order)"
              :data-order-focus="`open:${order.id}`"
              @click="emit('open', order)"
            >
              <span class="text-base font-bold text-highlighted">{{ ORDER_COPY.orderNumber(order.orderNumber) }} · {{ formatShortDate(order.orderDate, today) }}</span>
            </button>
            <OrderStatusBadge
              v-if="!closedShortNote(order)"
              :order="order"
              class="mt-2.5"
            />
            <div
              v-if="orderActions(order).edit || orderActions(order).closeShort"
              class="relative z-10 shrink-0"
            >
              <OrderRowMenu
                :order="order"
                :busy="busy.has(order.id)"
                @deliver="emit('deliver', order)"
                @edit="emit('edit', order)"
                @status="(s: OrderManualStatus) => emit('status', order, s)"
                @cancel="emit('cancel', order)"
                @close-short="emit('close-short', order)"
              />
            </div>
          </div>
          <p
            v-if="clientName(order) !== null"
            class="text-base font-bold wrap-anywhere text-highlighted"
          >
            {{ clientName(order) }}
          </p>
          <USkeleton
            v-else
            class="h-5 w-32 bg-accented"
          />
          <div
            v-if="closedShortNote(order)"
            class="flex flex-wrap items-center gap-2"
          >
            <OrderStatusBadge :order="order" />
            <span class="text-sm text-muted">{{ closedShortNote(order) }}</span>
          </div>
          <p
            v-if="wantedText(order)"
            class="text-sm text-muted"
          >
            {{ wantedText(order) }}
          </p>
          <p
            v-if="cancelledNote(order)"
            class="text-sm text-muted"
          >
            {{ cancelledNote(order) }}
          </p>
          <div class="mt-1 flex flex-col gap-1.5">
            <OrderProgress
              v-for="line in shownLines(order)"
              :key="line.sizeId"
              :line="line"
            />
            <p
              v-if="moreCount(order) > 0"
              class="text-sm text-muted"
            >
              {{ ORDER_COPY.moreSizes(moreCount(order)) }}
            </p>
          </div>
          <div class="mt-1 flex items-baseline justify-between gap-2">
            <p class="text-lg font-semibold text-highlighted">
              {{ formatPrice(order.orderTotal) }}
            </p>
            <span class="text-sm text-muted">{{ ORDER_COPY.sizeCount(order.lines.length) }}</span>
          </div>
          <UButton
            v-if="canDeliver(order)"
            size="xl"
            block
            class="relative z-10 mt-2 min-h-11 justify-center"
            :label="ORDER_COPY.deliver"
            :aria-label="ORDER_COPY.deliverAria(order.orderNumber)"
            :data-order-focus="`deliver:${order.id}`"
            @click="emit('deliver', order)"
          />
        </li>
      </ul>
      <div
        v-else
        class="rounded-2xl bg-default ring ring-inset ring-default"
      >
        <slot name="empty" />
      </div>
    </template>
  </div>
</template>
