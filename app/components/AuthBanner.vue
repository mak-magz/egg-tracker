<!--
  The banner slot above auth forms (§2.5 States). `error` = the design's red banner (10% tint, 25% ring,
  6px radius); `info` = neutral, for "session expired". Icon + text, never colour alone. role="alert".
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  message: string
  tone?: 'error' | 'info'
}>(), {
  tone: 'error',
})
</script>

<template>
  <div role="alert">
    <UAlert
      :color="props.tone === 'error' ? 'error' : 'neutral'"
      variant="subtle"
      :icon="props.tone === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-info'"
      :description="props.message"
      :ui="{ root: 'rounded-md px-3 py-2.5 items-start', description: 'text-base opacity-100', icon: 'size-5 mt-0.5' }"
    />
  </div>
</template>
