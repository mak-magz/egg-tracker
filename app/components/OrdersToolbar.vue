<!--
  Orders filters (feature 05 §2.5 flow I, AC4): the status chips (Open default, All, Fulfilled, Cancelled) stay
  visible at every width; on phones Client and the order-date range sit behind one Filters button (`Filters (2)`),
  on desktop/tablet everything is on screen (date range + Clear, chips, Client picker). Two DOM subtrees switched by
  a CSS breakpoint only (no JS), the SalesToolbar convention. Every model is the PAGE's own ref: nothing here
  touches the URL, a cookie or any storage (AC53).
-->
<script setup lang="ts">
import type { IsoDate, OrdersView } from '#shared/types/api'
import { ORDERS_VIEWS } from '#shared/constants/orders'
import { ORDER_COPY } from '~/utils/order-copy'

export interface OrdersClientOption { id: string, name: string, inactive: boolean }

const props = defineProps<{
  disabled?: boolean
  clientOptions: readonly OrdersClientOption[]
  /** Client and/or date range are set: counts toward `Filters (n)`. */
  activeFilterCount: number
  /** Anything besides plain Open is on: shows the "Showing x of n" line. */
  filtering: boolean
  refreshing?: boolean
  shown: number
  total: number
  dateRangeError: string | null
}>()

const emit = defineEmits<{ clear: [] }>()

const view = defineModel<OrdersView>('view', { required: true })
const clientId = defineModel<string | null>('clientId', { required: true })
const from = defineModel<IsoDate | null>('from', { required: true })
const to = defineModel<IsoDate | null>('to', { required: true })

const VIEW_LABEL: Record<OrdersView, string> = {
  open: ORDER_COPY.viewOpen,
  all: ORDER_COPY.viewAll,
  fulfilled: ORDER_COPY.viewFulfilled,
  cancelled: ORDER_COPY.viewCancelled,
}
const VIEW_CHIPS = ORDERS_VIEWS.map(value => ({ value, label: VIEW_LABEL[value] }))

const ALL_CLIENTS = '__all__'
const clientSelectValue = computed<string>({
  get: () => clientId.value ?? ALL_CLIENTS,
  set: (v: string) => { clientId.value = v === ALL_CLIENTS ? null : v },
})
const clientItems = computed(() => [
  { id: ALL_CLIENTS, label: ORDER_COPY.clientFilterAll },
  ...props.clientOptions.map(c => ({ id: c.id, label: c.inactive ? ORDER_COPY.clientInactiveOption(c.name) : c.name })),
])

function toModel(v: unknown): IsoDate | null {
  return typeof v === 'string' && v !== '' ? v : null
}

const panelOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Desktop/tablet: the date range sits above the chips (the design's row) -->
    <div class="hidden flex-wrap items-center gap-2 lg:flex">
      <UFormField
        :label="ORDER_COPY.dateFromLabel"
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
        :label="ORDER_COPY.dateToLabel"
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
        :label="ORDER_COPY.clear"
        @click="from = null; to = null"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div
        role="group"
        :aria-label="ORDER_COPY.viewGroupLabel"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="c in VIEW_CHIPS"
          :key="c.value"
          :label="c.label"
          size="xl"
          :color="view === c.value ? 'primary' : 'neutral'"
          :variant="view === c.value ? 'solid' : 'soft'"
          class="rounded-full px-4 font-semibold"
          :aria-pressed="view === c.value"
          :data-order-focus="`view:${c.value}`"
          :disabled="disabled"
          @click="view = c.value"
        />
      </div>

      <span class="hidden flex-1 lg:block" />
      <USelectMenu
        v-model="clientSelectValue"
        :items="clientItems"
        value-key="id"
        label-key="label"
        size="xl"
        class="hidden w-[220px] lg:inline-flex"
        :aria-label="ORDER_COPY.clientFilterLabel"
        :search-input="{ placeholder: ORDER_COPY.clientFilterSearchPlaceholder }"
        :disabled="disabled"
      />

      <!-- Phones: Client and the dates behind one button -->
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="lg:hidden"
        :trailing-icon="panelOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="activeFilterCount > 0 ? ORDER_COPY.filtersButtonCount(activeFilterCount) : ORDER_COPY.filtersButton"
        :aria-label="panelOpen ? ORDER_COPY.filtersHide : ORDER_COPY.filtersShow"
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
      <UFormField
        :label="ORDER_COPY.clientFilterLabel"
        :ui="{ label: 'text-base font-medium' }"
      >
        <USelectMenu
          v-model="clientSelectValue"
          :items="clientItems"
          value-key="id"
          label-key="label"
          size="xl"
          class="w-full"
          :search-input="{ placeholder: ORDER_COPY.clientFilterSearchPlaceholder }"
          :disabled="disabled"
        />
      </UFormField>
      <fieldset class="flex flex-col gap-1.5">
        <legend class="text-base font-medium text-default">
          {{ ORDER_COPY.orderDateFilterLabel }}
        </legend>
        <div class="flex flex-wrap items-start gap-2">
          <UFormField
            :label="ORDER_COPY.dateFromLabel"
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
            :label="ORDER_COPY.dateToLabel"
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
      </fieldset>
      <UButton
        v-if="from || to"
        color="neutral"
        variant="ghost"
        size="xl"
        :label="ORDER_COPY.clearDates"
        class="self-start"
        @click="from = null; to = null"
      />
    </div>

    <div
      v-if="filtering"
      class="flex items-center text-sm text-muted"
    >
      <span aria-live="polite">{{ ORDER_COPY.showing(shown, total) }}</span>
      <UIcon
        v-if="refreshing"
        name="i-lucide-loader-circle"
        class="ms-2 size-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span
        class="px-1"
        aria-hidden="true"
      >·</span>
      <UButton
        color="neutral"
        variant="link"
        size="lg"
        class="min-h-11 min-w-11 justify-center px-2"
        :label="ORDER_COPY.clearFilters"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
