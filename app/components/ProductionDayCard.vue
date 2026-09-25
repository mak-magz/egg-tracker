<!--
  Production day-summary card (feature 01 AC15–AC18, AC22; §2.5 "Production screen").
  Header: one toggle button (aria-expanded, >= 56px) with the date label, the day's good total and a
  red "Rejects: …" badge when there are rejects; beside it (not nested) a 44px ⋮ menu with Edit day /
  Delete day that works without expanding. Phones put the total and badge on a second line; md+ is
  one line as in the design. Expanded: one line per size with eggs (farm order, Good badge), then the
  "—" Reject line. Every amount is formatQty (UX R1). Size colours are NOT used here (R2).
-->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { IsoDate, ProductionDay } from '#shared/types/api'
import { formatLabelledQty, formatQty } from '#shared/utils/quantity'

const props = defineProps<{
  day: ProductionDay
  today: IsoDate
  eggsPerTray: number
  expanded: boolean
  /** Just saved/edited: a short tint that fades out. */
  highlighted?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
  delete: []
}>()

const { sizeById } = useFarm()

const label = computed(() => formatDayLabel(props.day.date, props.today))
const total = computed(() => formatQty(props.day.goodTotal, props.eggsPerTray))
const rejectsBadge = computed(() => (props.day.rejects > 0 ? formatLabelledQty('Rejects', props.day.rejects, props.eggsPerTray) : null))

const toggleLabel = computed(() => {
  const rejects = props.day.rejects > 0 ? formatQty(props.day.rejects, props.eggsPerTray) : 'no'
  return `${label.value}, ${total.value} good, ${rejects} rejects`
})

const lines = computed(() => props.day.good
  .filter(g => g.eggs > 0)
  .map(g => ({ size: sizeById(g.sizeId), qty: formatQty(g.eggs, props.eggsPerTray) }))
  .sort((a, b) => a.size.sortOrder - b.size.sortOrder))

const menuItems = computed<DropdownMenuItem[]>(() => [
  { label: PRODUCTION_COPY.editDay, icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
  { label: PRODUCTION_COPY.deleteDay, icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete') },
])

const toggleButton = useTemplateRef<HTMLButtonElement>('toggleButton')
defineExpose({ focus: () => toggleButton.value?.focus() })
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl ring ring-default transition-colors duration-[1500ms] ease-out motion-reduce:transition-none"
    :class="highlighted ? 'bg-primary/8 motion-reduce:bg-default' : 'bg-default'"
    :data-day="day.date"
  >
    <div class="flex items-center">
      <button
        ref="toggleButton"
        type="button"
        class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3.5 ps-4 pe-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none md:ps-[18px]"
        :aria-expanded="expanded"
        :aria-label="toggleLabel"
        @click="emit('toggle')"
      >
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-4 shrink-0 text-muted"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-3">
          <span class="text-base font-semibold text-highlighted md:flex-1">{{ label }}</span>
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-base font-semibold text-default tabular-nums">{{ total }}</span>
            <UBadge
              v-if="rejectsBadge"
              color="error"
              variant="subtle"
              size="md"
              :label="rejectsBadge"
            />
          </span>
        </span>
      </button>
      <UDropdownMenu
        :items="menuItems"
        :content="{ align: 'end' }"
        :ui="{ item: 'min-h-11 lg:min-h-9' }"
      >
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-ellipsis-vertical"
          :aria-label="`Actions for ${label}`"
          class="me-1.5 size-11 shrink-0 justify-center lg:size-10"
        />
      </UDropdownMenu>
    </div>

    <div
      v-if="expanded"
      class="flex flex-col gap-2 px-4 pb-3.5 md:px-[18px]"
    >
      <div
        v-for="line in lines"
        :key="line.size.id"
        class="flex items-center gap-3 rounded-md bg-muted px-3 py-2"
      >
        <span
          class="min-w-0 truncate text-base font-medium text-default md:w-28 md:flex-none"
          :title="line.size.name"
        >{{ line.size.name }}</span>
        <UBadge
          color="success"
          variant="subtle"
          size="sm"
          label="Good"
        />
        <span class="ms-auto shrink-0 text-right text-base font-semibold text-muted tabular-nums">{{ line.qty }}</span>
      </div>
      <div
        v-if="day.rejects > 0"
        class="flex items-center gap-3 rounded-md bg-muted px-3 py-2"
      >
        <span
          class="text-base font-medium text-default md:w-28 md:flex-none"
          aria-label="No size"
        >—</span>
        <UBadge
          color="error"
          variant="subtle"
          size="sm"
          label="Reject"
        />
        <span class="ms-auto shrink-0 text-right text-base font-semibold text-error tabular-nums">{{ formatQty(day.rejects, eggsPerTray) }}</span>
      </div>
    </div>
  </div>
</template>
