<!--
  One active size in the Sizes list (feature 02 §2.5 "Settings, mobile"): name, then ↑ ↓ and a ⋮ menu with
  Rename and Archive. A `<li>`, min 56px tall (48px at lg), controls 44px (40px at lg), 4px apart so a
  thumb doesn't hit the neighbour. The name wraps and never truncates. While it is being renamed the
  `form` slot (the inline SizeNameForm) takes the place of the row. Nothing here changes data: it emits.

  - First row: ↑ disabled; last row: ↓ disabled (dimmed and aria-disabled, no message: AC10).
  - Only one active size: Archive is disabled and says why in the item (AC14).
  - `busy`: another change is in flight, every control is disabled; `moving` puts the spinner on the
    button that was pressed.
  - `data-size-focus` lets the card put focus back on a control after a change (§2.5 Accessibility).
-->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { FarmSize } from '#shared/types/api'
import type { MoveDirection } from '~/utils/size-order'

const props = defineProps<{
  size: FarmSize
  first: boolean
  last: boolean
  /** Archive is allowed (another active size would remain). */
  canArchive: boolean
  /** Another change is running: disable every control. */
  busy: boolean
  /** This row's move is running, and which way. */
  moving: MoveDirection | null
  /** Just changed: the short tint. */
  highlighted?: boolean
  /** The rename form is showing instead of the row. */
  renaming?: boolean
}>()

const emit = defineEmits<{
  move: [direction: MoveDirection]
  rename: []
  archive: []
}>()

const menuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: SIZE_COPY.rename,
    icon: 'i-lucide-pencil',
    onSelect: () => emit('rename'),
  },
  {
    label: SIZE_COPY.archive,
    icon: 'i-lucide-archive',
    // The reason is in the item itself, so it's readable without trying it (AC14).
    ...(props.canArchive ? {} : { disabled: true, description: SIZE_COPY.lastSizeItem }),
    onSelect: () => emit('archive'),
  },
])

const upDisabled = computed(() => props.busy || props.first)
const downDisabled = computed(() => props.busy || props.last)
</script>

<template>
  <li
    :data-size-row="size.id"
    class="list-none"
  >
    <slot
      v-if="renaming"
      name="form"
    />
    <div
      v-else
      class="flex min-h-14 items-center gap-1 rounded-md bg-muted py-1.5 ps-3 pe-1.5 lg:min-h-12"
      :class="highlighted ? 'animate-[size-row-flash_1.5s_ease-out] motion-reduce:animate-none' : ''"
    >
      <span class="min-w-0 flex-1 py-1 text-base font-medium break-words text-default">{{ size.name }}</span>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-up"
        :aria-label="SIZE_COPY.moveUp(size.name)"
        :data-size-focus="`up:${size.id}`"
        class="size-11 shrink-0 justify-center lg:size-10"
        :loading="moving === 'up'"
        :disabled="upDisabled"
        :aria-disabled="upDisabled ? 'true' : undefined"
        @click="emit('move', 'up')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-down"
        :aria-label="SIZE_COPY.moveDown(size.name)"
        :data-size-focus="`down:${size.id}`"
        class="size-11 shrink-0 justify-center lg:size-10"
        :loading="moving === 'down'"
        :disabled="downDisabled"
        :aria-disabled="downDisabled ? 'true' : undefined"
        @click="emit('move', 'down')"
      />
      <UDropdownMenu
        :items="menuItems"
        :content="{ align: 'end' }"
        :ui="{ content: 'w-56', item: 'min-h-11 lg:min-h-9', itemDescription: 'whitespace-normal' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-ellipsis-vertical"
          :aria-label="SIZE_COPY.actionsFor(size.name)"
          :data-size-focus="`menu:${size.id}`"
          class="size-11 shrink-0 justify-center lg:size-10"
          :disabled="busy"
        />
      </UDropdownMenu>
    </div>
  </li>
</template>
