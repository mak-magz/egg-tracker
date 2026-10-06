<!--
  The ⋮ menu on a sale row or card (feature 04 §2.5 "Row menu", feature 05 §2.5 "Sales"): Edit, then Void (red, after a
  separator) on every non-voided sale. There is no Mark delivered, Mark as pending or Delete: sales are void-only
  (AC37, AC40). A VOIDED sale has no menu at all (nothing left to do to it, AC68): renders nothing. Items are 44px on
  phones/tablets (36px at lg); the trigger shows a spinner while that sale's request runs (R1). Accessible name
  "Actions for sale #{n}". Lazily mounts the real menu on first press (ClientRowMenu.vue's own trick, so many rows
  stay cheap to draw).
-->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Sale } from '#shared/types/api'
import { SALE_COPY } from '~/utils/sale-copy'

defineProps<{
  sale: Pick<Sale, 'id' | 'saleNumber' | 'voidedAt'>
  busy?: boolean
}>()

const emit = defineEmits<{
  edit: []
  void: []
}>()

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: SALE_COPY.menuEdit, icon: 'i-lucide-pencil', onSelect: () => emit('edit') }],
  [{ label: SALE_COPY.menuVoid, icon: 'i-lucide-ban', color: 'error', onSelect: () => emit('void') }],
])

const activated = ref(false)
const open = ref(false)
function activate() {
  open.value = true
  activated.value = true
}
</script>

<template>
  <template v-if="!sale.voidedAt">
    <UDropdownMenu
      v-if="activated"
      v-model:open="open"
      :items="items"
      :content="{ align: 'end' }"
      :ui="{ content: 'w-52', item: 'min-h-11 lg:min-h-9' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis-vertical"
        :aria-label="SALE_COPY.actionsFor(sale.saleNumber)"
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
      :aria-label="SALE_COPY.actionsFor(sale.saleNumber)"
      aria-haspopup="menu"
      aria-expanded="false"
      class="size-11 shrink-0 justify-center lg:size-10"
      :loading="busy"
      :disabled="busy"
      @click="activate"
    />
  </template>
</template>
