<!--
  One active size in the Sizes list (feature 02 §2.5 "Settings, mobile"): name, optional default price per tray,
  then ↑ ↓ and a ⋮ menu with Edit and Archive. A `<li>`, min 56px tall (48px at lg), controls 44px (40px at lg),
  4px apart so a thumb doesn't hit the neighbour. Tapping the size or Edit opens the inline form.
  The name wraps and never truncates. While it is being edited the `form` slot (the inline SizeNameForm)
  takes the place of the row. Nothing here changes data: it emits.

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
import { formatPrice } from '#shared/utils/price'

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
  /** The edit/rename form is showing instead of the row. */
  renaming?: boolean
}>()

const emit = defineEmits<{
  move: [direction: MoveDirection]
  edit: []
  rename: []
  archive: []
}>()

function onEdit() {
  emit('edit')
  emit('rename')
}

const { currency } = useFarm()

const menuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: SIZE_COPY.edit,
    icon: 'i-lucide-pencil',
    onSelect: onEdit,
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
      class="group/row flex min-h-14 items-center gap-1 rounded-md bg-muted border border-default/60 hover:border-default hover:bg-muted/80 transition-all duration-150 py-1.5 ps-3 pe-1.5 lg:min-h-12"
      :class="highlighted ? 'animate-[size-row-flash_1.5s_ease-out] motion-reduce:animate-none' : ''"
    >
      <button
        type="button"
        class="group flex min-w-0 flex-1 flex-wrap items-baseline gap-2.5 py-1 text-left rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
        :aria-label="`Edit ${size.name}`"
        :disabled="busy"
        @click="onEdit"
      >
        <span class="text-base font-semibold break-words text-default group-hover:text-primary transition-colors duration-150">
          {{ size.name }}
        </span>
        <span
          v-if="size.defaultPrice != null"
          class="text-xs sm:text-sm font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded"
        >
          {{ formatPrice(size.defaultPrice, currency) }} / tray
        </span>
        <span
          v-else
          class="text-xs text-dimmed italic"
        >
          No default price set
        </span>
        <span
          class="inline-flex items-center gap-1 text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          aria-hidden="true"
        >
          <UIcon
            name="i-lucide-pencil"
            class="size-3 text-primary"
          />
          <span>Click to edit</span>
        </span>
      </button>
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
