<!--
  The "From order #12" link pill on a delivery made from an order (feature 05 AC39, flow H, F7): primary text with a
  link icon, at least 44px tall, sitting above the card's tap area (z-10) so it doesn't open the sale. Opens that
  order's detail on top, read-only (D3/D10). A voided linked sale keeps the pill.
-->
<script setup lang="ts">
import { SALE_COPY } from '~/utils/sale-copy'

defineProps<{ orderNumber: number | string }>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    type="button"
    class="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary ring ring-inset ring-primary/40 transition-colors hover:bg-primary/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :aria-label="SALE_COPY.openOrderAria(orderNumber)"
    @click.stop="emit('open')"
  >
    <UIcon
      name="i-lucide-link"
      class="size-4 shrink-0"
      aria-hidden="true"
    />
    <span>{{ SALE_COPY.fromOrder(orderNumber) }}</span>
  </button>
</template>
