<!--
  "Production trend by size" (feature 01 AC20, AC33, AC38; §2.5 "Chart details", D12).
  Hand-drawn SVG as in the design: one polyline per farm size (colour by the size's colour slot,
  dashed from slot 10) plus Rejects in red, with a dot at every point so a single day still shows.
  Lines are drawn in a 0–100 viewBox stretched to the card (non-scaling strokes); dots, labels and
  the tooltip are HTML placed by percentage so they don't stretch. Read-only: hover/tap (or focus +
  arrow keys) shows the day's numbers in the R1 format.
-->
<script setup lang="ts">
import { breakpointsTailwind, onClickOutside, useBreakpoints } from '@vueuse/core'
import type { IsoDate, ProductionDay } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { buildChartModel, nearestIndex, thinLabelIndices, xPercent, yPercent } from '~/utils/production-chart'

const props = defineProps<{
  days: readonly ProductionDay[]
  today: IsoDate
  eggsPerTray: number
  /** The active range, for the caption and the accessible name. */
  from: IsoDate | null
  to: IsoDate | null
  refreshing?: boolean
}>()

const { sizes } = useFarm()
const model = computed(() => buildChartModel(props.days, sizes.value))
const count = computed(() => model.value.dates.length)
const empty = computed(() => count.value === 0)

// Caption: the filter's range; an open start uses the oldest day shown.
const captionFrom = computed(() => props.from ?? model.value.dates[0] ?? null)
const captionTo = computed(() => props.to ?? props.today)
const caption = computed(() => (captionFrom.value
  ? `${formatShortDate(captionFrom.value, props.today)} – ${formatShortDate(captionTo.value, props.today)}`
  : ''))
const ariaLabel = computed(() => (captionFrom.value
  ? PRODUCTION_COPY.chartAria(formatShortDate(captionFrom.value, props.today), formatShortDate(captionTo.value, props.today))
  : PRODUCTION_COPY.chartTitle))

const polylines = computed(() => model.value.series.map(s => ({
  ...s,
  points: s.values.map((v, i) => `${xPercent(i, count.value)},${yPercent(v, model.value.max)}`).join(' '),
  dots: s.values.map((v, i) => ({ left: xPercent(i, count.value), top: yPercent(v, model.value.max) })),
})))

// Labels: day numbers; the first and any month change also get the month. ≤7 mobile, ≤14 desktop.
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMd = breakpoints.greaterOrEqual('md')
const labels = computed(() => {
  const idx = thinLabelIndices(count.value, isMd.value ? 14 : 7)
  let prevMonth = ''
  return idx.map((i, k) => {
    const date = model.value.dates[i]!
    const { month, day } = dayParts(date)
    const text = k === 0 || month !== prevMonth ? `${month} ${day}` : String(day)
    prevMonth = month
    const align = count.value === 1 ? 'center' : k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'center'
    return { key: date, text, left: xPercent(i, count.value), align }
  })
})

// ---- Tooltip ------------------------------------------------------------------------------------
const plot = useTemplateRef<HTMLElement>('plot')
const active = ref<number | null>(null)

function indexAt(event: PointerEvent) {
  const el = plot.value
  if (!el || empty.value) return null
  const rect = el.getBoundingClientRect()
  return nearestIndex((event.clientX - rect.left) / Math.max(1, rect.width), count.value)
}
function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'mouse') active.value = indexAt(event)
}
function onPointerDown(event: PointerEvent) {
  active.value = indexAt(event)
}
function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') active.value = null
}
function onKeydown(event: KeyboardEvent) {
  if (empty.value) return
  const last = count.value - 1
  if (event.key === 'ArrowRight') active.value = Math.min(last, (active.value ?? -1) + 1)
  else if (event.key === 'ArrowLeft') active.value = Math.max(0, (active.value ?? count.value) - 1)
  else if (event.key === 'Escape') active.value = null
  else return
  event.preventDefault()
}
onClickOutside(plot, () => {
  active.value = null
})
watch(() => props.days, () => {
  active.value = null
})

const tooltip = computed(() => {
  const i = active.value
  if (i === null || i >= count.value) return null
  const left = xPercent(i, count.value)
  return {
    left,
    side: left > 50 ? 'left' : 'right',
    label: formatDayLabel(model.value.dates[i]!, props.today),
    rows: model.value.series.map(s => ({ key: s.key, name: s.name, colorClass: s.colorClass, dashed: s.dashed, qty: formatQty(s.values[i] ?? 0, props.eggsPerTray) })),
  }
})
</script>

<template>
  <UCard :ui="{ body: 'flex flex-col gap-3 p-5 sm:p-5' }">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <h2 class="text-base font-medium text-muted">
          {{ PRODUCTION_COPY.chartTitle }}
        </h2>
        <span
          v-if="caption"
          class="text-sm text-dimmed"
        >{{ caption }}</span>
        <UIcon
          v-if="refreshing"
          name="i-lucide-loader-circle"
          class="size-4 animate-spin self-center text-dimmed"
          aria-label="Updating"
        />
      </div>
      <ul
        v-if="!empty"
        class="flex flex-wrap gap-x-3 gap-y-1"
        aria-label="Legend"
      >
        <li
          v-for="s in model.series"
          :key="s.key"
          class="flex min-w-0 items-center gap-1.5"
          :class="s.colorClass"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="s.dashed ? 'border-2 border-current' : 'bg-current'"
          />
          <span
            class="max-w-32 truncate text-sm text-muted"
            :title="s.name"
          >{{ s.name }}</span>
        </li>
      </ul>
    </div>

    <div
      v-if="empty"
      class="flex h-[130px] items-center justify-center text-sm text-dimmed"
    >
      {{ PRODUCTION_COPY.chartEmpty }}
    </div>

    <template v-else>
      <div
        ref="plot"
        class="relative mx-1.5 h-[130px] touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        role="img"
        tabindex="0"
        :aria-label="ariaLabel"
        @pointermove="onPointerMove"
        @pointerdown="onPointerDown"
        @pointerleave="onPointerLeave"
        @keydown="onKeydown"
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          class="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <g
            v-for="s in polylines"
            :key="s.key"
            :class="s.colorClass"
          >
            <polyline
              :points="s.points"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
              :stroke-dasharray="s.dashed ? '5 4' : undefined"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <line
            v-if="tooltip"
            :x1="tooltip.left"
            :x2="tooltip.left"
            y1="0"
            y2="100"
            class="text-(--ui-border-accented)"
            stroke="currentColor"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <template
          v-for="s in polylines"
          :key="`dots-${s.key}`"
        >
          <span
            v-for="(d, i) in s.dots"
            :key="i"
            class="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
            :class="s.colorClass"
            :style="{ left: `${d.left}%`, top: `${d.top}%` }"
            aria-hidden="true"
          />
        </template>

        <div
          v-if="tooltip"
          class="pointer-events-none absolute top-0 z-10 w-max max-w-56 rounded-lg bg-default px-3 py-2 text-sm shadow-lg ring ring-default"
          :style="tooltip.side === 'right' ? { left: `calc(${tooltip.left}% + 8px)` } : { right: `calc(${100 - tooltip.left}% + 8px)` }"
          aria-hidden="true"
        >
          <p class="mb-1 font-semibold text-highlighted">
            {{ tooltip.label }}
          </p>
          <p
            v-for="r in tooltip.rows"
            :key="r.key"
            class="flex items-center gap-2"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="[r.colorClass, r.dashed ? 'border-2 border-current' : 'bg-current']"
            />
            <span class="min-w-0 flex-1 truncate text-muted">{{ r.name }}</span>
            <span class="font-medium text-default tabular-nums">{{ r.qty }}</span>
          </p>
        </div>
      </div>

      <div
        class="relative mx-1.5 h-5"
        aria-hidden="true"
      >
        <span
          v-for="l in labels"
          :key="l.key"
          class="absolute top-0 text-sm whitespace-nowrap text-dimmed"
          :class="l.align === 'start' ? '' : l.align === 'end' ? '-translate-x-full' : '-translate-x-1/2'"
          :style="{ left: `${l.left}%` }"
        >{{ l.text }}</span>
      </div>
    </template>
  </UCard>
</template>
