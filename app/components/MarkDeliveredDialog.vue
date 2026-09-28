<!--
  Mark delivered: one small step (feature 04 §2.5 flow D, AC33 to AC37). Names the sale, asks for the
  Delivered date (default today, focused button so Enter confirms), and shows the shortfall warning INLINE
  when the cached on-hand figures say it would go short (AC35: no second dialog) — the server is always the
  final word (X5); if it disagrees, the same warning reappears from the server's own reply and the button
  still reads "Mark delivered anyway" on retry. Cancel/closing changes nothing.
-->
<script setup lang="ts">
import type { IsoDate, Sale } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { compareIsoDates, isIsoDate } from '#shared/utils/local-date'
import { formatShortDate } from '~/utils/day-label'
import { SALE_COPY } from '~/utils/sale-copy'
import type { SaleMutations } from '~/composables/useSaleMutations'

const props = defineProps<{
  sale: Sale | null
  today: IsoDate
  mutations: SaleMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  marked: [sale: Sale]
  failed: []
}>()

const { sizeById, eggsPerTray } = useFarm()
const { sorted: allClients } = useClients()
const onHand = useOnHand()

const date = ref<IsoDate>(props.today)
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen || !props.sale) return
  date.value = props.today
  error.value = null
  void onHand.ensure(props.sale.lines.map(l => l.sizeId))
})

function clientName(sale: Sale): string {
  if (!sale.clientId) return SALE_COPY.walkIn
  return allClients.value.find(c => c.id === sale.clientId)?.name ?? SALE_COPY.walkIn
}

const saleLine = computed(() => {
  const s = props.sale
  if (!s) return ''
  return SALE_COPY.saleLineFor(s.saleNumber, clientName(s))
})
const sizesLine = computed(() => {
  const s = props.sale
  if (!s) return ''
  const parts = s.lines.slice(0, 3).map(l => `${sizeById(l.sizeId).name} ${formatQty(l.eggs, eggsPerTray.value ?? 30)}`)
  const extra = s.lines.length - 3
  return extra > 0 ? `${parts.join(' · ')} · ${SALE_COPY.moreSizes(extra)}` : parts.join(' · ')
})

/** Cached-figure preview only (X5): the server re-checks and is the final word. */
const previewShortfall = computed(() => {
  const s = props.sale
  if (!s) return []
  return s.lines
    .map(l => ({ sizeId: l.sizeId, name: sizeById(l.sizeId).name, onHand: onHand.entry(l.sizeId).eggs, needed: l.eggs }))
    .filter(l => l.onHand !== null && l.onHand < l.needed)
})

const busy = computed(() => (props.sale ? props.mutations.pendingIds.value.includes(props.sale.id) : false))

const dateInvalid = computed(() => {
  const s = props.sale
  if (!s) return null
  if (!isIsoDate(date.value)) return SALE_COPY.dateEmpty
  if (compareIsoDates(date.value, s.saleDate) < 0) return SALE_COPY.deliveredBeforeSale(formatShortDate(s.saleDate, props.today))
  if (compareIsoDates(date.value, props.today) > 0) return SALE_COPY.deliveredDateFuture
  return null
})

async function confirm(confirmShortfall = false) {
  const s = props.sale
  if (!s || busy.value) return
  if (dateInvalid.value) {
    error.value = dateInvalid.value
    return
  }
  error.value = null
  const result = await props.mutations.markDelivered(s.id, date.value, confirmShortfall)
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('marked', result.data.sale)
    return
  }
  if (result.error.kind === 'stock_short') return // the alert above re-renders from the server's own shortfall
  open.value = false
  emit('failed')
}
</script>

<template>
  <UModal
    :open="open"
    :title="SALE_COPY.markDeliveredTitle"
    :close="false"
    :dismissible="!busy"
    :ui="{ content: 'max-w-[420px] rounded-2xl' }"
    @update:open="(v: boolean) => { if (!busy) open = v }"
  >
    <template #body>
      <div
        v-if="sale"
        class="flex flex-col gap-3 text-base text-default"
      >
        <p class="font-medium text-highlighted">
          {{ saleLine }}
        </p>
        <p class="text-sm text-muted">
          {{ sizesLine }}
        </p>
        <UFormField
          :label="SALE_COPY.deliveredDateLabel"
          :error="error ?? undefined"
          size="xl"
          :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
        >
          <UInput
            v-model="date"
            type="date"
            :min="sale.saleDate"
            :max="today"
            size="xl"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>
        <UAlert
          v-if="previewShortfall.length"
          role="alert"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
        >
          <template #description>
            <p class="font-medium">
              Not enough on hand:
            </p>
            <ul class="ps-4">
              <li
                v-for="l in previewShortfall"
                :key="l.sizeId"
              >
                {{ l.name }}: {{ formatQty(l.onHand ?? 0, eggsPerTray ?? 30) }} on hand, delivering {{ formatQty(l.needed, eggsPerTray ?? 30) }}
              </li>
            </ul>
            <p class="mt-1">
              {{ SALE_COPY.cantStillMarkDelivered }}
            </p>
          </template>
        </UAlert>
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="justify-center max-sm:w-full"
        :label="SALE_COPY.cancel"
        :disabled="busy"
        @click="open = false"
      />
      <UButton
        color="primary"
        size="xl"
        autofocus
        class="justify-center max-sm:w-full"
        :label="previewShortfall.length ? SALE_COPY.markDeliveredAnyway : SALE_COPY.markDeliveredTitle"
        :loading="busy"
        :disabled="!!dateInvalid"
        @click="confirm(previewShortfall.length > 0)"
      />
    </template>
  </UModal>
</template>
