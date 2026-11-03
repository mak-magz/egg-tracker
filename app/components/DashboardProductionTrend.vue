<!--
  Dashboard Production Trend Bar Chart (Feature 09 AC15-AC23).
  Renders the 7-day daily volume trend on the dashboard using tree-shaken Chart.js.
  Highlights Today's bar in vibrant primary amber, while past days render in subtle translucent amber.
  Tooltips format volume in trays + loose eggs via canonical formatQty.
-->
<script setup lang="ts">
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip as ChartTooltip,
} from 'chart.js'
import type { ChartConfiguration } from 'chart.js'
import type { IsoDate, ProductionDay } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { formatDayLabel } from '~/utils/day-label'
import { buildDashboardBarDays } from '~/utils/production-chart'

// Register tree-shaken Bar chart modules
Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  ChartTooltip,
)

const props = defineProps<{
  days: readonly ProductionDay[]
  today: IsoDate
  eggsPerTray: number
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const barDays = computed(() => buildDashboardBarDays(props.days, props.today))
const maxEggs = computed(() => Math.max(1, ...barDays.value.map(d => d.eggs)))

const containerRef = useTemplateRef<HTMLElement>('containerRef')
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')
let chart: Chart<'bar'> | null = null

const active = ref<number | null>(null)
const caretX = ref<number>(0)
const containerWidth = ref<number>(0)

function updateContainerWidth() {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth
  }
}

const activeDay = computed(() => {
  const i = active.value
  if (i === null || i < 0 || i >= barDays.value.length) return null
  const d = barDays.value[i]!
  const side = caretX.value > (containerWidth.value / 2) ? 'left' : 'right'
  return {
    ...d,
    side,
    label: formatDayLabel(d.date, props.today),
    qty: formatQty(d.eggs, props.eggsPerTray),
  }
})

function getBarColors() {
  const primaryLight = '#ca8a04' // yellow-600 / golden yolk
  const primaryDark = '#facc15' // yellow-400
  const fadedLight = 'rgba(202, 138, 4, 0.22)'
  const fadedDark = 'rgba(250, 204, 21, 0.25)'
  const hoverLight = 'rgba(202, 138, 4, 0.45)'
  const hoverDark = 'rgba(250, 204, 21, 0.45)'

  const todayColor = isDark.value ? primaryDark : primaryLight
  const pastColor = isDark.value ? fadedDark : fadedLight
  const hoverColor = isDark.value ? hoverDark : hoverLight

  return {
    bg: barDays.value.map(d => d.isToday ? todayColor : pastColor),
    hoverBg: barDays.value.map(d => d.isToday ? todayColor : hoverColor),
    tickColors: barDays.value.map(d => d.isToday ? todayColor : (isDark.value ? '#94a3b8' : '#64748b')),
  }
}

function getChartConfig(): ChartConfiguration<'bar'> {
  const colors = getBarColors()

  return {
    type: 'bar',
    data: {
      labels: barDays.value.map(d => d.day),
      datasets: [
        {
          data: barDays.value.map(d => d.eggs),
          backgroundColor: colors.bg,
          hoverBackgroundColor: colors.hoverBg,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
          maxBarThickness: 32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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
            updateContainerWidth()
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
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: colors.tickColors,
            font: (ctx) => {
              const isToday = barDays.value[ctx.index]?.isToday
              return {
                size: 11,
                weight: isToday ? 'bold' : 'normal',
              }
            },
          },
        },
        y: {
          display: false,
          beginAtZero: true,
          suggestedMax: Math.max(1, maxEggs.value),
        },
      },
    },
  }
}

function initOrUpdateChart() {
  if (!canvasRef.value) return
  const colors = getBarColors()

  if (!chart) {
    chart = new Chart(canvasRef.value, getChartConfig())
  }
  else {
    chart.data.labels = barDays.value.map(d => d.day)
    chart.data.datasets[0]!.data = barDays.value.map(d => d.eggs)
    chart.data.datasets[0]!.backgroundColor = colors.bg
    chart.data.datasets[0]!.hoverBackgroundColor = colors.hoverBg

    if (chart.options.scales?.x?.ticks) {
      chart.options.scales.x.ticks.color = colors.tickColors
    }
    if (chart.options.scales?.y) {
      chart.options.scales.y.suggestedMax = Math.max(1, maxEggs.value)
    }
    chart.update('none')
  }
}

watch([barDays, isDark], () => {
  nextTick(() => initOrUpdateChart())
})

onMounted(() => {
  updateContainerWidth()
  initOrUpdateChart()
  window.addEventListener('resize', updateContainerWidth)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateContainerWidth)
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>

<template>
  <div class="flex flex-col justify-between rounded-2xl bg-default border border-default/70 p-5 shadow-xs">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <UIcon
            name="i-lucide-trending-up"
            class="size-4.5"
          />
        </div>
        <div>
          <span class="text-sm font-bold text-highlighted block">Production Trend</span>
          <span class="text-[11px] text-muted">Daily volume over the past 7 days</span>
        </div>
      </div>
      <UBadge
        color="neutral"
        variant="subtle"
        size="sm"
      >
        Last 7 days
      </UBadge>
    </div>

    <!-- Chart Container -->
    <div
      ref="containerRef"
      class="relative h-32 pt-4 pb-1 px-1 touch-pan-y"
    >
      <canvas
        ref="canvasRef"
        class="w-full h-full touch-pan-y"
        role="img"
        aria-label="Daily volume over the past 7 days"
      />

      <!-- Custom Headless Floating Tooltip -->
      <div
        v-if="activeDay"
        class="pointer-events-none absolute top-1 z-10 w-max max-w-44 rounded-md bg-neutral-900 dark:bg-neutral-800 text-white px-2.5 py-1.5 text-[11px] shadow-md ring ring-black/10 transition-transform duration-75"
        :style="activeDay.side === 'right' ? { left: `calc(${caretX}px + 8px)` } : { right: `calc(${containerWidth - caretX}px + 8px)` }"
        aria-hidden="true"
      >
        <p class="font-bold text-primary">
          {{ activeDay.qty }}
        </p>
        <p class="text-neutral-300 text-[10px]">
          {{ activeDay.label }}
        </p>
      </div>
    </div>
  </div>
</template>
