<!--
  The New / Edit order overlay (feature 05 §2.5 "New order, mobile bottom sheet" / desktop dialog, AC9, AC16): a thin
  host for OrderForm, exactly like SaleFormOverlay. One UModal styled by breakpoint (SSR-safe, no JS breakpoint):
  below md the design's bottom sheet, lifted above the keypad; at md+ a centred 640px dialog. Every close (X, Cancel,
  overlay tap, Esc) goes through the discard check and is blocked while saving.
-->
<script setup lang="ts">
import type { IsoDate, Order, OrderDelivery } from '#shared/types/api'
import { ORDER_COPY } from '~/utils/order-copy'
import type { OrderSavedEvent } from '~/components/OrderForm.vue'

const props = defineProps<{
  mode: 'add' | 'edit'
  order?: Order | null
  deliveries?: readonly OrderDelivery[] | null
  today: IsoDate
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'saved': [event: OrderSavedEvent]
  'changed-elsewhere': []
  /** The overlay has closed and its focus return was suppressed: put focus where it belongs. */
  'closed': []
}>()

const form = useTemplateRef<{ dirty: boolean, saving: boolean, focusFirstProblem: () => void }>('form')
const discardOpen = ref(false)

function requestClose() {
  if (form.value?.saving) return
  if (form.value?.dirty) {
    discardOpen.value = true
    return
  }
  open.value = false
}

function onSaved(event: OrderSavedEvent) {
  open.value = false
  emit('saved', event)
}

function onChangedElsewhere() {
  open.value = false
  emit('changed-elsewhere')
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

useSheetKeyboard(open)
const ui = sheetUi(640)

const discardBody = computed(() => (props.mode === 'edit' && props.order
  ? ORDER_COPY.discardEditBody(props.order.orderNumber)
  : ORDER_COPY.discardNewBody))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="mode === 'edit' && order ? ORDER_COPY.editTitle(order.orderNumber) : ORDER_COPY.newTitle"
    :dismissible="false"
    :close="false"
    :content="{ onCloseAutoFocus }"
    :ui="ui"
    @close:prevent="requestClose"
  >
    <template #content>
      <OrderForm
        ref="form"
        :mode="mode"
        :order="order"
        :deliveries="deliveries"
        :today="today"
        @cancel="requestClose"
        @saved="onSaved"
        @changed-elsewhere="onChangedElsewhere"
      />
    </template>
  </UModal>

  <ConfirmDiscardDialog
    v-model:open="discardOpen"
    :title="ORDER_COPY.discardTitle"
    :body="discardBody"
    @discard="open = false"
  />
</template>
