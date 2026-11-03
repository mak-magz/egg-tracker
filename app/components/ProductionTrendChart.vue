<!--
  "Production trend by size" (feature 01 AC20, AC33, AC38; feature 09 AC1-AC23; §2.5 "Chart details").
  Tree-shaken Chart.js line chart: one spline curve per farm size (hex color by stable colorSlot,
  dashed from slot 10) plus Rejects in error red, with points at every day so single-day ranges show.
  Light mode uses Tailwind 600 hex constants, dark mode 400.
  Interactive: touch/hover and keyboard (ArrowLeft/ArrowRight/Escape) trigger custom accessible
  tooltip with egg counts formatted in trays + loose eggs via formatQty.
-->
<script setup lang="ts">
import { breakpointsTailwind, onClickOutside, useBreakpoints } from '@vueuse/core'
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
} from 'chart.js'
import type { ChartConfiguration } from 'chart.js'
import type { IsoDate, ProductionDay } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { dayParts, formatDayLabel } from '~/utils/day-label'
import { PRODUCTION_COPY } from '~/utils/production-copy'
import { buildChartModel, toChartJsDatasets } from '~/utils/production-chart'

// Register tree-shaken Chart.js modules
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  ChartTooltip,
)

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
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

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

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMd = breakpoints.greaterOrEqual('md')

// Chart.js references & tooltip state
const plotRef = useTemplateRef<HTMLElement>('plotRef')
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')
let chart: Chart<'line'> | null = null

const active = ref<number | null>(null)
const caretX = ref<number>(0)
const plotWidth = ref<number>(0)

function updatePlotWidth() {
  if (plotRef.value) {
    plotWidth.value = plotRef.value.clientWidth
  }
}

const tooltip = computed(() => {
  const i = active.value
  if (i === null || i < 0 || i >= count.value) return null
  const date = model.value.dates[i]!
  const side = caretX.value > (plotWidth.value / 2) ? 'left' : 'right'

  return {
    index: i,
    side,
    label: formatDayLabel(date, props.today),
    rows: model.value.series.map(s => ({
      key: s.key,
      name: s.name,
      colorClass: s.colorClass,
      dashed: s.dashed,
      qty: formatQty(s.values[i] ?? 0, props.eggsPerTray),
    })),
  }
})

const activeAnnouncement = computed(() => {
  if (!tooltip.value) return ''
  return `${tooltip.value.label}: ${tooltip.value.rows.map(r => `${r.name} ${r.qty}`).join(', ')}`
})

function getChartConfig(): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: model.value.dates,
      datasets: toChartJsDatasets(model.value, isDark.value),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context) => {
            const tooltipModel = context.tooltip
            if (tooltipModel.opacity === 0) {
              active.value = null
              return
            }
            updatePlotWidth()
            caretX.value = tooltipModel.caretX
            const dataIndex = tooltipModel.dataPoints?.[0]?.dataIndex
            if (dataIndex !== undefined) {
              active.value = dataIndex
            }
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: isDark.value ? '#94a3b8' : '#64748b',
            font: { size: 11 },
            maxTicksLimit: isMd.value ? 14 : 7,
            autoSkip: true,
            maxRotation: 0,
            minRotation: 0,
            callback(_val, index) {
              const date = model.value.dates[index]
              if (!date) return ''
              const { month, day } = dayParts(date)
              return `${month} ${day}`
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(1, model.value.max),
          grid: {
            color: isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
          ticks: {
            color: isDark.value ? '#94a3b8' : '#64748b',
            font: { size: 10 },
            maxTicksLimit: 4,
            precision: 0,
          },
          border: {
            display: false,
          },
        },
      },
    },
  }
}

function initOrUpdateChart() {
  if (empty.value) {
    if (chart) {
      chart.destroy()
      chart = null
    }
    return
  }

  if (!canvasRef.value) return

  if (!chart) {
    chart = new Chart(canvasRef.value, getChartConfig())
  }
  else {
    chart.data.labels = model.value.dates
    chart.data.datasets = toChartJsDatasets(model.value, isDark.value)

    if (chart.options.scales?.x?.ticks) {
      chart.options.scales.x.ticks.color = isDark.value ? '#94a3b8' : '#64748b'
      chart.options.scales.x.ticks.maxTicksLimit = isMd.value ? 14 : 7
    }
    if (chart.options.scales?.y) {
      if (chart.options.scales.y.grid) {
        chart.options.scales.y.grid.color = isDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
      }
      if (chart.options.scales.y.ticks) {
        chart.options.scales.y.ticks.color = isDark.value ? '#94a3b8' : '#64748b'
      }
      chart.options.scales.y.suggestedMax = Math.max(1, model.value.max)
    }
    chart.update('none')
  }
}

watch([model, isDark, isMd], () => {
  nextTick(() => initOrUpdateChart())
})

onMounted(() => {
  updatePlotWidth()
  initOrUpdateChart()
  window.addEventListener('resize', updatePlotWidth)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePlotWidth)
  if (chart) {
    chart.destroy()
    chart = null
  }
})

// Keyboard navigation
function onKeydown(event: KeyboardEvent) {
  if (empty.value) return
  const last = count.value - 1
  if (event.key === 'ArrowRight') {
    active.value = Math.min(last, (active.value ?? -1) + 1)
  }
  else if (event.key === 'ArrowLeft') {
    active.value = Math.max(0, (active.value ?? count.value) - 1)
  }
  else if (event.key === 'Escape') {
    active.value = null
  }
  else {
    return
  }
  event.preventDefault()

  if (active.value !== null && chart) {
    updatePlotWidth()
    caretX.value = chart.scales.x?.getPixelForValue(active.value) ?? 0
    chart.setActiveElements(
      model.value.series.map((_, datasetIndex) => ({
        datasetIndex,
        index: active.value!,
      })),
    )
    chart.update('none')
  }
}

onClickOutside(plotRef, () => {
  active.value = null
})

watch(() => props.days, () => {
  active.value = null
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
      class="flex h-[160px] items-center justify-center text-sm text-dimmed"
    >
      {{ PRODUCTION_COPY.chartEmpty }}
    </div>

    <template v-else>
      <div
        ref="plotRef"
        class="relative mx-1.5 h-[160px] touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        role="region"
        tabindex="0"
        :aria-label="ariaLabel"
        @keydown="onKeydown"
      >
        <!-- Accessible screen-reader live announcement -->
        <span
          class="sr-only"
          aria-live="polite"
          aria-atomic="true"
        >
          {{ activeAnnouncement }}
        </span>

        <!-- Vertical hairline indicator -->
        <div
          v-if="tooltip"
          class="pointer-events-none absolute top-0 bottom-6 border-l border-dashed border-muted/40 z-0"
          :style="{ left: `${caretX}px` }"
          aria-hidden="true"
        />

        <canvas
          ref="canvasRef"
          class="w-full h-full touch-pan-y"
          role="img"
          :aria-label="ariaLabel"
        />

        <!-- Custom Headless Tooltip Card -->
        <div
          v-if="tooltip"
          class="pointer-events-none absolute top-2 z-10 w-max max-w-56 rounded-lg bg-default px-3 py-2 text-sm shadow-lg ring ring-default"
          :style="tooltip.side === 'right' ? { left: `calc(${caretX}px + 12px)` } : { right: `calc(${plotWidth - caretX}px + 12px)` }"
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
    </template>
  </UCard>
</template>
