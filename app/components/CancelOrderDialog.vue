<!--
  Cancel order confirm (feature 05 §2.5 "Cancel confirm", AC22): a centred dialog, max 400px. Names the order and
  the client, says the stock doesn't change and the number stays used. Keep order is first in the DOM and focused
  (the safe choice). A failure shows an inline alert and leaves the dialog open with the order untouched; the
  button retries. If a delivery arrived from another phone meanwhile (has_delivery, or the order was already closed),
  the dialog closes and the screen says so (`refused`) after the list took the order the server sent.
-->
<script setup lang="ts">
import type { Order, OrderDetail } from '#shared/types/api'
import { ORDER_COPY } from '~/utils/order-copy'
import type { OrderMutations } from '~/composables/useOrderMutations'

const props = defineProps<{
  order: Order | null
  clientLabel: string
  mutations: OrderMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  cancelled: [order: OrderDetail]
  /** The server no longer allows it (a delivery arrived, or it is already closed): the order is refreshed. */
  refused: [reason: 'has_delivery' | 'order_closed' | 'order_changed']
  closed: []
}>()

const { formatPrice } = useFarm()
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) error.value = null
})

const busy = computed(() => (props.order ? props.mutations.pendingIds.value.includes(props.order.id) : false))

const summary = computed(() => (props.order
  ? ORDER_COPY.cancelSummary(props.clientLabel, props.order.lines.length, formatPrice(props.order.orderTotal))
  : ''))

async function confirm() {
  const order = props.order
  if (!order || busy.value) return
  error.value = null
  const result = await props.mutations.cancel(order.id)
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('cancelled', result.data.order)
    return
  }
  const kind = result.error.kind
  if (kind === 'has_delivery' || kind === 'order_closed' || kind === 'order_changed' || kind === 'not_found') {
    open.value = false
    emit('refused', kind === 'not_found' ? 'order_changed' : kind)
    return
  }
  error.value = ORDER_COPY.cancelFailed
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
    :title="order ? ORDER_COPY.cancelTitle(order.orderNumber) : ''"
    :close="false"
    :dismissible="!busy"
    :content="{ onCloseAutoFocus }"
    :ui="{ content: 'max-w-[400px] rounded-2xl', body: 'flex flex-col gap-2 text-base text-default', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <p class="font-medium wrap-anywhere text-highlighted">
        {{ summary }}
      </p>
      <p>{{ ORDER_COPY.cancelStockLine }}</p>
      <p class="text-muted">
        {{ ORDER_COPY.cancelNoUndo(order?.orderNumber ?? 0) }}
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
        :label="ORDER_COPY.cancelKeep"
        :disabled="busy"
        @click="open = false"
      />
      <UButton
        color="error"
        size="xl"
        icon="i-lucide-ban"
        class="min-h-11 justify-center max-sm:w-full"
        :label="ORDER_COPY.cancelConfirm"
        :loading="busy"
        @click="confirm"
      />
    </template>
  </UModal>
</template>
