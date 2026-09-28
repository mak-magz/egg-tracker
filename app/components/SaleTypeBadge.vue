<!-- "Delivery" / "On-site" (feature 04 UX R5): always the word, never colour alone. -->
<script setup lang="ts">
import type { SaleType } from '#shared/types/api'
import { SALE_COPY } from '~/utils/sale-copy'

defineProps<{ type: SaleType }>()
</script>

<template>
  <UBadge
    :color="type === 'delivery' ? 'info' : 'neutral'"
    :variant="type === 'delivery' ? 'subtle' : 'subtle'"
    size="md"
    :label="type === 'delivery' ? SALE_COPY.typeDelivery : SALE_COPY.typeOnSite"
    class="shrink-0"
  />
</template>
