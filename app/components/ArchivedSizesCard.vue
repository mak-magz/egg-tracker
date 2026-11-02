<!--
  The Archived group (feature 02 AC15, AC16; §2.5 "Settings, mobile" second card). Shown only when at least
  one size is archived (the parent decides), in their last order. Each row: name, an "Archived" text badge
  (never colour alone, and the name isn't dimmed so it stays readable in sunlight) and a Restore button,
  one tap with no confirmation. No ↑ ↓ ⋮: renaming and reordering archived sizes is out of scope.
-->
<script setup lang="ts">
import type { FarmSize } from '#shared/types/api'
import type { PendingSizeChange } from '~/utils/size-mutations'

const props = defineProps<{
  sizes: readonly FarmSize[]
  /** The card's change in flight (from useSizeMutations): every Restore is disabled, the pressed one spins. */
  pending: PendingSizeChange | null
  /** Just restored/archived: the short tint on that row. */
  highlightedId?: string | null
}>()

const emit = defineEmits<{
  restore: [id: string]
}>()

function restoring(id: string): boolean {
  return props.pending?.action === 'restore' && props.pending.sizeId === id
}
</script>

<template>
  <SettingsSection
    :title="SIZE_COPY.archivedTitle"
    :help="SIZE_COPY.archivedHelp"
    :busy="pending !== null"
  >
    <ul
      role="list"
      class="flex flex-col gap-2"
    >
      <li
        v-for="size in sizes"
        :key="size.id"
        :data-size-row="size.id"
        class="flex min-h-14 list-none items-center gap-3 rounded-xl border border-default/60 bg-muted/30 py-2 ps-3.5 pe-2 lg:min-h-12 hover:border-default transition-colors"
        :class="highlightedId === size.id ? 'animate-[size-row-flash_1.5s_ease-out] motion-reduce:animate-none' : ''"
      >
        <span class="flex min-w-0 flex-1 flex-col items-start gap-1 py-1 lg:flex-row lg:items-center lg:gap-2">
          <span class="min-w-0 text-base font-medium break-words text-default">{{ size.name }}</span>
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
            :label="SIZE_COPY.archivedBadge"
            class="shrink-0"
          />
        </span>
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          icon="i-lucide-rotate-ccw"
          :label="SIZE_COPY.restore"
          :aria-label="SIZE_COPY.restoreNamed(size.name)"
          :data-size-focus="`restore:${size.id}`"
          class="shrink-0 justify-center lg:min-h-10"
          :loading="restoring(size.id)"
          :disabled="pending !== null"
          @click="emit('restore', size.id)"
        />
      </li>
    </ul>
  </SettingsSection>
</template>
