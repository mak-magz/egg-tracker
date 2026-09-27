<!--
  "Active" / "Inactive" (feature 03 UX R6, AC3). Always the word, never colour alone. An inactive client is not
  dimmed anywhere: the badge is the only difference, so rows stay readable in sunlight.
-->
<script setup lang="ts">
defineProps<{ active: boolean }>()
</script>

<template>
  <UBadge
    :color="active ? 'success' : 'neutral'"
    variant="subtle"
    size="md"
    :label="active ? CLIENT_COPY.active : CLIENT_COPY.inactive"
    class="shrink-0"
  />
</template>
