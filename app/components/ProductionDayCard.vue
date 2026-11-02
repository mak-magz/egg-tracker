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
const isToday = computed(() => props.day.date === props.today)
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
    class="overflow-hidden rounded-2xl border border-default/70 hover:border-default bg-default shadow-xs transition-all duration-200"
    :class="highlighted ? 'bg-primary/5 border-primary/40' : 'bg-default'"
    :data-day="day.date"
  >
    <div class="group/header relative flex items-center transition-colors hover:bg-muted/40">
      <button
        ref="toggleButton"
        type="button"
        class="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3.5 ps-4 pe-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none md:ps-5 after:absolute after:inset-x-0 after:top-0 after:bottom-0 after:content-['']"
        :aria-expanded="expanded"
        :aria-label="toggleLabel"
        @click="emit('toggle')"
      >
        <div class="size-7 rounded-lg bg-muted/60 group-hover/header:bg-muted/90 flex items-center justify-center shrink-0 transition-colors">
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 transition-transform duration-200"
            :class="expanded ? 'rotate-90 text-primary' : 'text-muted'"
          />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-3">
          <div class="flex items-center gap-2 md:flex-1">
            <span class="text-base font-semibold text-highlighted">{{ label }}</span>
            <UBadge
              v-if="isToday"
              color="primary"
              variant="subtle"
              size="sm"
              label="Today"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold text-highlighted tabular-nums bg-muted/60 px-2.5 py-1 rounded-lg">
              {{ total }}
            </span>
            <UBadge
              v-if="rejectsBadge"
              color="error"
              variant="subtle"
              size="md"
              :label="rejectsBadge"
            />
          </div>
        </div>
      </button>
      <UDropdownMenu
        :items="menuItems"
        :content="{ align: 'end' }"
        :ui="{ item: 'min-h-11 lg:min-h-9' }"
        class="relative z-10"
      >
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-ellipsis-vertical"
          :aria-label="`Actions for ${label}`"
          class="me-2 size-10 shrink-0 justify-center rounded-lg hover:bg-muted/80 text-muted hover:text-highlighted transition-colors"
        />
      </UDropdownMenu>
    </div>

    <div
      v-if="expanded"
      class="border-t border-default/60 px-4 py-3.5 md:px-5 bg-muted/20 flex flex-col gap-2"
    >
      <div class="text-[11px] font-bold uppercase tracking-wider text-muted px-1">
        Collection Breakdown
      </div>
      <div class="flex flex-col gap-1.5">
        <div
          v-for="line in lines"
          :key="line.size.id"
          class="flex items-center gap-3 rounded-xl bg-default border border-default/50 px-3.5 py-2.5 shadow-2xs"
        >
          <span
            class="min-w-0 truncate text-sm font-semibold text-highlighted md:w-32 md:flex-none"
            :title="line.size.name"
          >
            {{ line.size.name }}
          </span>
          <UBadge
            color="success"
            variant="subtle"
            size="sm"
            label="Good"
          />
          <span class="ms-auto shrink-0 text-right text-sm font-bold text-highlighted tabular-nums">
            {{ line.qty }}
          </span>
        </div>
        <div
          v-if="day.rejects > 0"
          class="flex items-center gap-3 rounded-xl bg-default border border-error/20 px-3.5 py-2.5 shadow-2xs"
        >
          <span
            class="text-sm font-semibold text-muted md:w-32 md:flex-none"
            aria-label="No size"
          >
            —
          </span>
          <UBadge
            color="error"
            variant="subtle"
            size="sm"
            label="Reject"
          />
          <span class="ms-auto shrink-0 text-right text-sm font-bold text-error tabular-nums">
            {{ formatQty(day.rejects, eggsPerTray) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
