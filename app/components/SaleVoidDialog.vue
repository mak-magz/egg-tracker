<!--
  Void confirm (feature 04 §2.5 "Void confirm", AC67, AC68; feature 05 AC35, flow H). Sales are void-only (AC40), so
  this is the only removal. Names the sale, lists what goes back on hand, and — for a delivery made from an order —
  previews what the void does to that order ("Order #12 will show 10 trays of Large still owed. It will go back to
  Ready.", or "Order #12 was closed short and stays closed."). The preview is built on the client from the order the
  dialog fetches on open (orderAfterVoid, a twin of the database rule, D9); the void response carries the real,
  recomputed order. Cancel is first in the DOM (focused). A failure shows an inline alert and leaves the dialog open
  with the sale untouched; the button retries.
-->
<script setup lang="ts">
import type { OrderDetail, OrderResponse, Sale, VoidSaleResponse } from '#shared/types/api'
import { orderAfterVoid, ORDER_STATUS_LABEL } from '#shared/utils/order-status'
import { formatQty } from '#shared/utils/quantity'
import { SALE_COPY } from '~/utils/sale-copy'
import type { SaleMutations } from '~/composables/useSaleMutations'

const props = defineProps<{
  sale: Sale | null
  clientLabel: string
  mutations: SaleMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  voided: [response: VoidSaleResponse]
  /** The server no longer allows it (changed elsewhere, or already voided): the list took the sale it sent. */
  refused: []
}>()

const api = useApi()
const { sizeById, trayEggs, formatPrice } = useFarm()
const error = ref<string | null>(null)

// ---- The order a delivery came from (AC35) -------------------------------------------------------------------
const linkedOrder = ref<OrderDetail | null>(null)
const linkedLoading = ref(false)
let previewSeq = 0

watch(open, async (isOpen) => {
  if (!isOpen) return
  error.value = null
  linkedOrder.value = null
  const sale = props.sale
  if (!sale || sale.orderId === null) return
  const seq = ++previewSeq
  linkedLoading.value = true
  try {
    const res = await api<OrderResponse>(`/api/orders/${encodeURIComponent(sale.orderId)}`)
    if (seq === previewSeq) linkedOrder.value = res.order
  }
  catch {
    // No preview: the void still works and the server recomputes the order; only the sentence is missing.
  }
  finally {
    if (seq === previewSeq) linkedLoading.value = false
  }
})

const busy = computed(() => (props.sale ? props.mutations.pendingIds.value.includes(props.sale.id) : false))

const title = computed(() => (props.sale ? SALE_COPY.voidDialogTitle(props.sale.saleNumber) : ''))
const summaryLine = computed(() => (props.sale
  ? SALE_COPY.voidDialogLine(props.clientLabel, props.sale.lines.length, formatPrice(props.sale.saleTotal))
  : ''))
const putBackLines = computed(() => (props.sale
  ? props.sale.lines.map(l => `${sizeById(l.sizeId).name}: ${formatQty(l.eggs, trayEggs.value)}`)
  : []))

const preview = computed(() => {
  const order = linkedOrder.value
  const sale = props.sale
  if (!order || !sale) return null
  const after = orderAfterVoid(order, sale.id)
  const owed = after.owed.map(o => ({ name: sizeById(o.sizeId).name, qty: formatQty(o.eggs, trayEggs.value) }))
  return {
    orderNumber: order.orderNumber,
    closedShort: after.stays === 'closed_short',
    owed,
    backTo: after.status !== order.status ? ORDER_STATUS_LABEL[after.status] : null,
  }
})

async function confirm() {
  const s = props.sale
  if (!s || busy.value) return
  error.value = null
  const result = await props.mutations.voidSale(s)
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('voided', result.data)
    return
  }
  if (result.error.kind === 'voided' || result.error.kind === 'sale_changed' || result.error.kind === 'not_found') {
    open.value = false
    emit('refused')
    return
  }
  error.value = SALE_COPY.voidFailed
}

function onUpdateOpen(value: boolean) {
  if (!value && busy.value) return
  open.value = value
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :close="false"
    :dismissible="!busy"
    :ui="{ content: 'max-w-[400px] rounded-2xl', body: 'flex flex-col gap-2 text-base text-default', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <p class="font-medium text-highlighted">
        {{ summaryLine }}
      </p>
      <p>{{ SALE_COPY.voidPutsBackOnHand }}</p>
      <ul class="flex flex-col gap-0.5 ps-4">
        <li
          v-for="line in putBackLines"
          :key="line"
          class="font-medium text-highlighted"
        >
          {{ line }}
        </li>
      </ul>
      <template v-if="sale && sale.orderId !== null && sale.orderNumber !== null">
        <p
          v-if="linkedLoading"
          class="text-sm text-muted"
          role="status"
        >
          {{ SALE_COPY.voidOrderLoading }}
        </p>
        <div
          v-else-if="preview"
          class="flex flex-col gap-1 rounded-md bg-muted p-3"
          role="status"
        >
          <p v-if="preview.closedShort">
            {{ SALE_COPY.voidOrderClosedShort(preview.orderNumber) }}
          </p>
          <template v-else-if="preview.owed.length === 1">
            <p>{{ SALE_COPY.voidOrderOwed(preview.orderNumber, `${preview.owed[0]!.qty} of ${preview.owed[0]!.name}`) }}</p>
          </template>
          <template v-else-if="preview.owed.length > 1">
            <p>{{ SALE_COPY.voidOrderOwedMany(preview.orderNumber) }}</p>
            <ul class="flex flex-col gap-0.5 ps-4">
              <li
                v-for="o in preview.owed"
                :key="o.name"
                class="font-medium text-highlighted"
              >
                {{ o.name }}: {{ o.qty }}
              </li>
            </ul>
          </template>
          <p v-if="preview.backTo">
            {{ SALE_COPY.voidOrderBack(preview.backTo) }}
          </p>
        </div>
      </template>
      <p class="text-muted">
        {{ SALE_COPY.voidNoUndo }}
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
        :label="SALE_COPY.cancel"
        :disabled="busy"
        @click="open = false"
      />
      <UButton
        color="error"
        size="xl"
        icon="i-lucide-ban"
        class="min-h-11 justify-center max-sm:w-full"
        :label="SALE_COPY.voidSale"
        :loading="busy"
        @click="confirm"
      />
    </template>
  </UModal>
</template>
