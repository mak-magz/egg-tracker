<!--
  Production filters (feature 01 AC19, AC31; §2.5 Flow E). Design order: From – To [Clear] | Week Month.
  A set date overrides the chips, so no chip is highlighted while a range is active; tapping a chip or
  Clear goes back to a chip. From after To shows an error on To (the list keeps its previous filter).
  Wraps at 375px with no sideways scroll; 44px targets below lg.
-->
<script setup lang="ts">
import type { IsoDate } from '#shared/types/api'
import type { RangeChip } from '~/utils/production-range'
import { RANGE_CHIPS } from '~/utils/production-range'

defineProps<{
  chip: RangeChip
  rangeActive: boolean
  rangeError: string | null
  today: IsoDate
  disabled?: boolean
}>()

const from = defineModel<IsoDate | null>('from', { required: true })
const to = defineModel<IsoDate | null>('to', { required: true })

const emit = defineEmits<{
  'select-chip': [chip: RangeChip]
  'clear': []
}>()

function toModel(v: unknown): IsoDate | null {
  return typeof v === 'string' && v !== '' ? v : null
}
</script>

<template>
  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
    <div class="flex w-full flex-wrap items-start gap-2 sm:w-auto">
      <UFormField
        label="From"
        :ui="{ label: 'sr-only', root: 'min-w-0 flex-1 sm:w-[150px] sm:flex-none' }"
      >
        <UInput
          :model-value="from ?? ''"
          type="date"
          :max="today"
          size="xl"
          class="w-full"
          :disabled="disabled"
          @update:model-value="(v: unknown) => (from = toModel(v))"
        />
      </UFormField>
      <span
        class="mt-2.5 text-base text-dimmed"
        aria-hidden="true"
      >–</span>
      <UFormField
        label="To"
        :error="rangeError ?? undefined"
        :ui="{ label: 'sr-only', root: 'min-w-0 flex-1 sm:w-[150px] sm:flex-none', error: 'mt-1 text-sm' }"
      >
        <UInput
          :model-value="to ?? ''"
          type="date"
          :max="today"
          size="xl"
          class="w-full"
          :disabled="disabled"
          @update:model-value="(v: unknown) => (to = toModel(v))"
        />
      </UFormField>
      <UButton
        v-if="rangeActive"
        color="neutral"
        variant="ghost"
        size="xl"
        label="Clear"
        :disabled="disabled"
        @click="emit('clear')"
      />
    </div>

    <span
      class="mt-3 hidden h-5 w-px bg-(--ui-border) md:block"
      aria-hidden="true"
    />

    <div
      class="flex gap-2"
      role="group"
      aria-label="Date range"
    >
      <UButton
        v-for="c in RANGE_CHIPS"
        :key="c.value"
        :label="c.label"
        size="xl"
        :color="!rangeActive && chip === c.value ? 'primary' : 'neutral'"
        :variant="!rangeActive && chip === c.value ? 'solid' : 'soft'"
        class="rounded-full px-4"
        :aria-pressed="!rangeActive && chip === c.value"
        :disabled="disabled"
        @click="emit('select-chip', c.value)"
      />
    </div>
  </div>
</template>
