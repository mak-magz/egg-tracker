<!-- "Pending" / "Complete" (feature 04 UX R5): always the word, never colour alone. Complete rows are not dimmed. -->
<script setup lang="ts">
import type { SaleStatus } from '#shared/types/api'
import { SALE_COPY } from '~/utils/sale-copy'

defineProps<{ status: SaleStatus }>()
</script>

<template>
  <UBadge
    :color="status === 'complete' ? 'success' : 'warning'"
    :variant="status === 'complete' ? 'subtle' : 'soft'"
    size="md"
    :label="status === 'complete' ? SALE_COPY.statusComplete : SALE_COPY.statusPending"
    class="shrink-0"
  />
</template>
