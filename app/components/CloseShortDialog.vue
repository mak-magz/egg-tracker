<!--
  Close short confirm (feature 05 §2.5 "Close short confirm", AC34): a centred dialog, max 400px. Names the order and
  lists what will be DROPPED per size ("Closing short drops 10 trays of Medium. Deliveries already made stay."; with
  several sizes a list in the farm's size order). Keep open is first in the DOM and focused. One-way: stock doesn't
  change and it can't be undone. The request carries the version the dialog was built from, so a delivery made
  meanwhile (stale) refuses it and the screen says so (`refused`).
-->
<script setup lang="ts">
import type { Order, OrderDetail } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { ORDER_COPY } from '~/utils/order-copy'
import type { OrderMutations } from '~/composables/useOrderMutations'

const props = defineProps<{
  order: Order | null
  clientLabel: string
  mutations: OrderMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  closedShort: [order: OrderDetail]
  refused: [reason: 'not_partial' | 'order_changed' | 'order_closed']
  closed: []
}>()

const { sizeById, trayEggs } = useFarm()
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) error.value = null
})

const busy = computed(() => (props.order ? props.mutations.pendingIds.value.includes(props.order.id) : false))

/** What closing drops: ordered minus delivered per size, in the order's (farm) size order. */
const dropped = computed(() => (props.order?.lines ?? [])
  .filter(l => l.remainingEggs > 0)
  .map(l => ({ sizeId: l.sizeId, name: sizeById(l.sizeId).name, eggs: l.remainingEggs })))

const oneLine = computed(() => {
  const only = dropped.value.length === 1 ? dropped.value[0] : undefined
  return only ? ORDER_COPY.closeOne(formatQty(only.eggs, trayEggs.value), only.name) : null
})

async function confirm() {
  const order = props.order
  if (!order || busy.value) return
  error.value = null
  const result = await props.mutations.closeShort(order)
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('closedShort', result.data.order)
    return
  }
  const kind = result.error.kind
  if (kind === 'not_partial' || kind === 'order_changed' || kind === 'order_closed' || kind === 'not_found') {
    open.value = false
    emit('refused', kind === 'not_found' ? 'order_changed' : kind)
    return
  }
  error.value = ORDER_COPY.closeFailed
}

function onUpdateOpen(value: boolean) {
  if (!value && busy.value) return
  open.value = value
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}
</script>

<template>
  <UModal
    :open="open"
    :title="order ? ORDER_COPY.closeTitle(order.orderNumber) : ''"
    :close="false"
    :dismissible="!busy"
    :content="{ onCloseAutoFocus }"
    :ui="{ content: 'max-w-[400px] rounded-2xl', body: 'flex flex-col gap-2 text-base text-default', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <p class="font-medium wrap-anywhere text-highlighted">
        {{ clientLabel }}
      </p>
      <p v-if="oneLine">
        {{ oneLine }}
      </p>
      <template v-else>
        <p>{{ ORDER_COPY.closeMany }}</p>
        <ul class="flex flex-col gap-0.5 ps-4">
          <li
            v-for="d in dropped"
            :key="d.sizeId"
            class="font-medium text-highlighted"
          >
            {{ d.name }}: {{ formatQty(d.eggs, trayEggs) }}
          </li>
        </ul>
        <p>{{ ORDER_COPY.closeManyClosing }}</p>
      </template>
      <p class="text-muted">
        {{ ORDER_COPY.closeNoUndo }}
      </p>
      <UAlert
        v-if="error"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        autofocus
        class="min-h-11 justify-center max-sm:w-full"
        :label="ORDER_COPY.closeKeep"
        :disabled="busy"
        @click="open = false"
      />
      <UButton
        color="error"
        size="xl"
        icon="i-lucide-ban"
        class="min-h-11 justify-center max-sm:w-full"
        :label="ORDER_COPY.closeConfirm"
        :loading="busy"
        @click="confirm"
      />
    </template>
  </UModal>
</template>
