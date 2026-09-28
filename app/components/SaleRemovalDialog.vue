<!--
  Delete (Pending only) and Void (Complete/on-site only) confirm — the owner's correction (2026-09-27) made
  these "the same dialog, a different verb, no restore option" rather than two components (feature 04 §2.5
  "Delete confirm" / "Void confirm", AC44, AC45, AC67, AC68). `action` picks the title, the closing line and
  which mutation runs. Cancel is first in the DOM (focused). A failure shows an inline alert and leaves the
  dialog open with the sale untouched; the button retries.
-->
<script setup lang="ts">
import type { Sale } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { SALE_COPY } from '~/utils/sale-copy'
import type { SaleMutations } from '~/composables/useSaleMutations'

const props = defineProps<{
  sale: Sale | null
  action: 'delete' | 'void'
  clientLabel: string
  mutations: SaleMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  deleted: [sale: Sale]
  voided: [sale: Sale]
  refused: [reason: 'not_pending' | 'not_complete']
}>()

const { sizeById, eggsPerTray, formatPrice } = useFarm()
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) error.value = null
})

const busy = computed(() => (props.sale ? props.mutations.pendingIds.value.includes(props.sale.id) : false))

const title = computed(() => (props.sale
  ? (props.action === 'delete' ? SALE_COPY.deleteDialogTitle(props.sale.saleNumber) : SALE_COPY.voidDialogTitle(props.sale.saleNumber))
  : ''))
const summaryLine = computed(() => (props.sale
  ? SALE_COPY.deleteDialogLine(props.clientLabel, props.sale.lines.length, formatPrice(props.sale.saleTotal))
  : ''))
const putBackLines = computed(() => (props.sale
  ? props.sale.lines.map(l => `${sizeById(l.sizeId).name}: ${formatQty(l.eggs, eggsPerTray.value ?? 30)}`)
  : []))

async function confirm() {
  const s = props.sale
  if (!s || busy.value) return
  error.value = null
  if (props.action === 'delete') {
    const result = await props.mutations.remove(s.id)
    if (!result) return
    if (result.ok) {
      open.value = false
      emit('deleted', s)
      return
    }
    if (result.error.kind === 'not_found') {
      open.value = false
      emit('deleted', s) // already gone: treated as done
      return
    }
    if (result.error.kind === 'not_pending') {
      open.value = false
      emit('refused', 'not_pending')
      return
    }
    error.value = SALE_COPY.deleteFailed
    return
  }

  const result = await props.mutations.voidSale(s)
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('voided', result.data.sale)
    return
  }
  if (result.error.kind === 'not_complete') {
    open.value = false
    emit('refused', 'not_complete')
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
      <template v-if="action === 'delete'">
        <p>{{ SALE_COPY.deleteStockLine }}</p>
        <p class="text-muted">
          {{ SALE_COPY.deleteNoUndo(sale?.saleNumber ?? 0) }}
        </p>
      </template>
      <template v-else>
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
        <p class="text-muted">
          {{ SALE_COPY.voidNoUndo }}
        </p>
      </template>
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
        class="justify-center max-sm:w-full"
        :label="SALE_COPY.cancel"
        :disabled="busy"
        @click="open = false"
      />
      <UButton
        color="error"
        size="xl"
        :icon="action === 'delete' ? 'i-lucide-trash-2' : 'i-lucide-ban'"
        class="justify-center max-sm:w-full"
        :label="action === 'delete' ? SALE_COPY.deleteSale : SALE_COPY.voidSale"
        :loading="busy"
        @click="confirm"
      />
    </template>
  </UModal>
</template>
