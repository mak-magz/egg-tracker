<!--
  "Voided" (feature 04 AC67, AC68): shown ALONGSIDE the sale's original type/status badges, never instead of
  them, so the owner can still see what it was.
-->
<script setup lang="ts">
import { SALE_COPY } from '~/utils/sale-copy'
</script>

<template>
  <UBadge
    color="neutral"
    variant="subtle"
    size="md"
    :label="SALE_COPY.voided"
    class="shrink-0"
  />
</template>
