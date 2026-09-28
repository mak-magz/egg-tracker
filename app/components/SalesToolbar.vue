<!--
  Sales filters (feature 04 §2.5 flow J, AC7 to AC11, owner decision O2). Status chips stay visible at every
  width; on phones Type, Client, Dates and "Show voided sales" sit behind one Filters button (the button
  shows how many of those are set: `Filters (2)`), on desktop/tablet everything is on screen (the design's
  row plus the Client picker and the voided switch). Two DOM subtrees switched by a CSS breakpoint only (no
  JS), the same convention as sheetUi.ts. Every model is the PAGE's own ref: nothing here touches the URL,
  a cookie or any storage (AC11, AC60).
-->
<script setup lang="ts">
import type { IsoDate } from '#shared/types/api'
import type { SalesStatusFilter, SalesTypeFilter } from '~/composables/useSales'
import { SALE_COPY } from '~/utils/sale-copy'

export interface ToolbarClientOption { id: string, name: string, inactive: boolean }

const props = defineProps<{
  disabled?: boolean
  clientOptions: readonly ToolbarClientOption[]
  /** A filter besides "Show voided" is set: shows the "Showing x of n" line and counts toward `Filters (n)`. */
  activeFilterCount: number
  filtering: boolean
  shown: number
  total: number
  dateRangeError: string | null
}>()

const emit = defineEmits<{ clear: [] }>()

const status = defineModel<SalesStatusFilter>('status', { required: true })
const type = defineModel<SalesTypeFilter>('type', { required: true })
const clientId = defineModel<string | null>('clientId', { required: true })
const from = defineModel<IsoDate | null>('from', { required: true })
const to = defineModel<IsoDate | null>('to', { required: true })
const includeVoided = defineModel<boolean>('includeVoided', { required: true })

const STATUS_CHIPS: { value: SalesStatusFilter, label: string }[] = [
  { value: 'all', label: SALE_COPY.statusAll },
  { value: 'pending', label: SALE_COPY.statusPending },
  { value: 'complete', label: SALE_COPY.statusComplete },
]
const TYPE_CHIPS: { value: SalesTypeFilter, label: string }[] = [
  { value: 'all', label: SALE_COPY.typeAll },
  { value: 'delivery', label: SALE_COPY.typeDelivery },
  { value: 'on_site', label: SALE_COPY.typeOnSite },
]

const ALL_CLIENTS = '__all__'
const clientSelectValue = computed<string>({
  get: () => clientId.value ?? ALL_CLIENTS,
  set: (v: string) => { clientId.value = v === ALL_CLIENTS ? null : v },
})
const clientItems = computed(() => [
  { id: ALL_CLIENTS, label: SALE_COPY.clientFilterAll },
  ...props.clientOptions.map(c => ({ id: c.id, label: c.inactive ? SALE_COPY.clientInactiveOption(c.name) : c.name })),
])

function toModel(v: unknown): IsoDate | null {
  return typeof v === 'string' && v !== '' ? v : null
}

const panelOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <div
        role="group"
        :aria-label="SALE_COPY.statusGroupLabel"
        class="flex gap-2"
      >
        <UButton
          v-for="c in STATUS_CHIPS"
          :key="c.value"
          :label="c.label"
          size="xl"
          :color="status === c.value ? 'primary' : 'neutral'"
          :variant="status === c.value ? 'solid' : 'soft'"
          class="rounded-full px-4 font-semibold"
          :aria-pressed="status === c.value"
          :disabled="disabled"
          @click="status = c.value"
        />
      </div>

      <!-- Desktop/tablet: Type chips + Client picker inline (the design's row, plus Client, AC7) -->
      <div class="hidden items-center gap-2 lg:flex lg:flex-wrap">
        <div
          role="group"
          :aria-label="SALE_COPY.typeGroupLabel"
          class="flex gap-2"
        >
          <UButton
            v-for="c in TYPE_CHIPS"
            :key="c.value"
            :label="c.label"
            size="xl"
            :color="type === c.value ? 'primary' : 'neutral'"
            :variant="type === c.value ? 'solid' : 'soft'"
            class="rounded-full px-4 font-semibold"
            :aria-pressed="type === c.value"
            :disabled="disabled"
            @click="type = c.value"
          />
        </div>
        <USelectMenu
          v-model="clientSelectValue"
          :items="clientItems"
          value-key="id"
          label-key="label"
          size="xl"
          class="w-[200px]"
          :aria-label="SALE_COPY.clientFilterLabel"
          :search-input="{ placeholder: SALE_COPY.clientFilterSearchPlaceholder }"
          :disabled="disabled"
        />
      </div>

      <!-- Phones: everything else behind one button -->
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="lg:hidden"
        trailing-icon="i-lucide-chevron-down"
        :label="activeFilterCount > 0 ? SALE_COPY.filtersButtonCount(activeFilterCount) : SALE_COPY.filtersButton"
        :aria-expanded="panelOpen"
        :disabled="disabled"
        @click="panelOpen = !panelOpen"
      />
    </div>

    <!-- Phones: the panel -->
    <div
      v-if="panelOpen"
      class="flex flex-col gap-3 rounded-2xl bg-default p-3 ring ring-inset ring-default lg:hidden"
    >
      <div
        role="group"
        :aria-label="SALE_COPY.typeGroupLabel"
        class="flex gap-2"
      >
        <UButton
          v-for="c in TYPE_CHIPS"
          :key="c.value"
          :label="c.label"
          size="xl"
          :color="type === c.value ? 'primary' : 'neutral'"
          :variant="type === c.value ? 'solid' : 'soft'"
          class="rounded-full px-4 font-semibold"
          :aria-pressed="type === c.value"
          :disabled="disabled"
          @click="type = c.value"
        />
      </div>
      <UFormField :label="SALE_COPY.clientFilterLabel">
        <USelectMenu
          v-model="clientSelectValue"
          :items="clientItems"
          value-key="id"
          label-key="label"
          size="xl"
          class="w-full"
          :search-input="{ placeholder: SALE_COPY.clientFilterSearchPlaceholder }"
          :disabled="disabled"
        />
      </UFormField>
      <div class="flex flex-wrap items-start gap-2">
        <UFormField
          :label="SALE_COPY.dateFromLabel"
          :ui="{ label: 'sr-only', root: 'min-w-0 flex-1' }"
        >
          <UInput
            :model-value="from ?? ''"
            type="date"
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
          :label="SALE_COPY.dateToLabel"
          :error="dateRangeError ?? undefined"
          :ui="{ label: 'sr-only', root: 'min-w-0 flex-1', error: 'mt-1 text-sm' }"
        >
          <UInput
            :model-value="to ?? ''"
            type="date"
            size="xl"
            class="w-full"
            :disabled="disabled"
            @update:model-value="(v: unknown) => (to = toModel(v))"
          />
        </UFormField>
      </div>
      <UButton
        v-if="from || to"
        color="neutral"
        variant="ghost"
        size="xl"
        :label="SALE_COPY.clearDates"
        class="self-start"
        @click="from = null; to = null"
      />
      <div class="flex items-center justify-between gap-3">
        <span class="text-base font-medium text-default">{{ SALE_COPY.showVoided }}</span>
        <USwitch
          v-model="includeVoided"
          size="xl"
          :disabled="disabled"
          :aria-label="SALE_COPY.showVoided"
        />
      </div>
    </div>

    <!-- Desktop/tablet: date range row + voided switch -->
    <div class="hidden flex-wrap items-center gap-2 lg:flex">
      <UFormField
        :label="SALE_COPY.dateFromLabel"
        :ui="{ label: 'sr-only', root: 'w-[150px]' }"
      >
        <UInput
          :model-value="from ?? ''"
          type="date"
          size="xl"
          class="w-full"
          :disabled="disabled"
          @update:model-value="(v: unknown) => (from = toModel(v))"
        />
      </UFormField>
      <span
        class="text-base text-dimmed"
        aria-hidden="true"
      >–</span>
      <UFormField
        :label="SALE_COPY.dateToLabel"
        :error="dateRangeError ?? undefined"
        :ui="{ label: 'sr-only', root: 'w-[150px]', error: 'mt-1 text-sm' }"
      >
        <UInput
          :model-value="to ?? ''"
          type="date"
          size="xl"
          class="w-full"
          :disabled="disabled"
          @update:model-value="(v: unknown) => (to = toModel(v))"
        />
      </UFormField>
      <UButton
        v-if="from || to"
        color="neutral"
        variant="ghost"
        size="xl"
        :label="SALE_COPY.clear"
        @click="from = null; to = null"
      />
      <span class="flex-1" />
      <span class="text-base text-default">{{ SALE_COPY.showVoided }}</span>
      <USwitch
        v-model="includeVoided"
        size="lg"
        :disabled="disabled"
        :aria-label="SALE_COPY.showVoided"
      />
    </div>

    <div
      v-if="filtering"
      class="flex items-center text-sm text-muted"
    >
      <span>{{ SALE_COPY.showing(shown, total) }}</span>
      <span
        class="px-1"
        aria-hidden="true"
      >·</span>
      <UButton
        color="neutral"
        variant="link"
        size="lg"
        class="min-h-11 min-w-11 justify-center px-2"
        :label="SALE_COPY.clearFilters"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
