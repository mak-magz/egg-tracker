<!--
  The ⋮ menu on an order row or card (feature 05 §2.5 "Row menu", AC8, AC21): what is offered comes ONLY from
  orderActions() — Deliver, Edit, the two other hand-set statuses, then (after a separator, red) Cancel order or
  Close short. An order with nothing to do (Fulfilled, Cancelled) renders no menu at all. Items are 44px on phones
  and tablets (36px at lg); the trigger shows a spinner while that order's request runs (O-R1). Accessible name
  "Actions for order #{n}". Lazily mounts the real menu on first press (SaleRowMenu's own trick).
-->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Order, OrderManualStatus } from '#shared/types/api'
import { orderActions } from '#shared/utils/order-status'
import { ORDER_COPY, sortStatusMoves, statusMoveLabel } from '~/utils/order-copy'

const props = defineProps<{
  order: Pick<Order, 'id' | 'orderNumber' | 'status' | 'deliveryCount'>
  busy?: boolean
}>()

const emit = defineEmits<{
  'deliver': []
  'edit': []
  'status': [status: OrderManualStatus]
  'cancel': []
  'close-short': []
}>()

const actions = computed(() => orderActions(props.order))
const hasMenu = computed(() => actions.value.deliver || actions.value.edit || actions.value.closeShort)

const items = computed<DropdownMenuItem[][]>(() => {
  const a = actions.value
  const main: DropdownMenuItem[] = []
  if (a.deliver) main.push({ label: ORDER_COPY.menuDeliver, icon: 'i-lucide-truck', onSelect: () => emit('deliver') })
  if (a.edit) main.push({ label: ORDER_COPY.menuEdit, icon: 'i-lucide-pencil', onSelect: () => emit('edit') })
  const from = props.order.status as OrderManualStatus
  for (const target of sortStatusMoves(from, a.status)) {
    main.push({ label: statusMoveLabel(from, target), onSelect: () => emit('status', target) })
  }
  const danger: DropdownMenuItem[] = []
  if (a.cancel) danger.push({ label: ORDER_COPY.menuCancel, icon: 'i-lucide-ban', color: 'error', onSelect: () => emit('cancel') })
  if (a.closeShort) danger.push({ label: ORDER_COPY.menuCloseShort, icon: 'i-lucide-ban', color: 'error', onSelect: () => emit('close-short') })
  return danger.length ? [main, danger] : [main]
})

const activated = ref(false)
const open = ref(false)
function activate() {
  open.value = true
  activated.value = true
}
</script>

<template>
  <template v-if="hasMenu">
    <UDropdownMenu
      v-if="activated"
      v-model:open="open"
      :items="items"
      :content="{ align: 'end' }"
      :ui="{ content: 'w-56', item: 'min-h-11 lg:min-h-9' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis-vertical"
        :aria-label="ORDER_COPY.actionsFor(order.orderNumber)"
        :data-order-focus="`menu:${order.id}`"
        class="size-11 shrink-0 justify-center lg:size-10"
        :loading="busy"
        :disabled="busy"
      />
    </UDropdownMenu>
    <UButton
      v-else
      color="neutral"
      variant="ghost"
      icon="i-lucide-ellipsis-vertical"
      :aria-label="ORDER_COPY.actionsFor(order.orderNumber)"
      :data-order-focus="`menu:${order.id}`"
      aria-haspopup="menu"
      aria-expanded="false"
      class="size-11 shrink-0 justify-center lg:size-10"
      :loading="busy"
      :disabled="busy"
      @click="activate"
    />
  </template>
</template>
