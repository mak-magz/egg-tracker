<!--
  Presentational account row: farm-initials avatar, plus farm name + email unless `compact`.
  T21 wraps this in the UDropdownMenu trigger (AppAccountMenu). No logic here; data comes in as props.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  farmName: string
  email: string
  /** Avatar only (tablet rail, mobile top bar). */
  compact?: boolean
}>(), {
  compact: false,
})

// Farm initials, e.g. "Hendricks farm" -> "HF" (UAvatar's own `alt` fallback keeps the case).
const initials = computed(() => props.farmName
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map(word => word.charAt(0).toUpperCase())
  .join(''))
</script>

<template>
  <span
    class="flex min-h-11 min-w-11 items-center gap-2"
    :class="props.compact ? 'justify-center' : 'w-full'"
  >
    <!-- md = 32px. The name is announced next to it (or by the T21 trigger's aria-label). -->
    <UAvatar
      :text="initials"
      :alt="props.farmName"
      size="md"
    />
    <template v-if="!props.compact">
      <span class="min-w-0 flex-1 text-left">
        <span class="block truncate text-base font-medium text-highlighted">{{ props.farmName }}</span>
        <span class="block truncate text-sm text-muted">{{ props.email }}</span>
      </span>
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0 text-dimmed"
      />
    </template>
  </span>
</template>
