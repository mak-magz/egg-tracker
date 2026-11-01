<!--
  Dashboard (Feature 00 Scaffold / Live Overview).
  Design: docs/design/source/template.html (lines 6152-6212).
  Responsive grid with 5 live cards:
    1. Today's production (trays + loose, size badges, rejects)
    2. On hand now (total computed inventory, per-size breakdown)
    3. Owed on open orders (total owed on orders, preview)
    4. Recent sales (latest 4 sales with customer, qty, price)
    5. This week's production (7-day daily volume bar chart)
-->
<script setup lang="ts">
import { inventoryTotals } from '#shared/utils/inventory'
import { addDays } from '#shared/utils/local-date'
import { formatPrice } from '#shared/utils/price'
import { formatQty, formatQtySigned } from '#shared/utils/quantity'

const { trayEggs, currency, sizeById } = useFarm()
const prod = useProductionDays()
const inv = useInventory()
const salesComposable = useSales()
const clientsComposable = useClients()

const initialLoading = ref(true)

async function loadAll() {
  try {
    await Promise.all([
      prod.reload({ silent: true }),
      inv.load(),
      salesComposable.load(salesComposable.filters.value, { silent: true }),
      clientsComposable.load({ silent: true }),
    ])
  }
  finally {
    initialLoading.value = false
  }
}

onMounted(() => {
  void loadAll()
})

function onVisible() {
  if (document.visibilityState === 'visible') {
    void loadAll()
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))

// --- 1. Today's Production ---
const todayDay = computed(() => prod.days.value.find(d => d.date === prod.today.value))
const todayTotalEggs = computed(() => todayDay.value?.goodTotal ?? 0)
const todayQty = computed(() => formatQty(todayTotalEggs.value, trayEggs.value))
const todayBySize = computed(() => {
  if (!todayDay.value) return []
  return todayDay.value.good
    .filter(g => g.eggs > 0)
    .map((g) => {
      const sz = sizeById(g.sizeId)
      return {
        id: g.sizeId,
        label: `${sz.name}: ${formatQty(g.eggs, trayEggs.value)}`,
        sortOrder: sz.sortOrder,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
})
const todayRejects = computed(() => todayDay.value?.rejects ?? 0)

// --- 2. On Hand Inventory ---
const inventorySizes = computed(() => inv.data.value?.sizes ?? [])
const totals = computed(() => inventoryTotals(inventorySizes.value))
const totalOnHandEggs = computed(() => totals.value.onHandEggs)
const totalOnHandQty = computed(() => formatQtySigned(totalOnHandEggs.value, trayEggs.value))
const inventoryBreakdown = computed(() => {
  return inventorySizes.value
    .filter(s => s.active || s.onHandEggs !== 0)
    .map(s => ({
      id: s.id,
      name: s.name,
      qty: formatQtySigned(s.onHandEggs, trayEggs.value),
      negative: s.onHandEggs < 0,
    }))
})

// --- 3. Owed on Open Orders ---
const totalOwedEggs = computed(() => totals.value.owedEggs)
const owedTotalQty = computed(() => formatQty(totalOwedEggs.value, trayEggs.value))
const owedPreview = computed(() => {
  return inventorySizes.value
    .filter(s => s.owedEggs > 0)
    .slice(0, 3)
    .map(s => ({
      id: s.id,
      name: s.name,
      qty: formatQty(s.owedEggs, trayEggs.value),
    }))
})

// --- 4. Recent Sales ---
const recentSales = computed(() => {
  const list = salesComposable.sales.value.filter(s => !s.voidedAt)
  return list.slice(0, 4).map((s) => {
    let clientName = 'On-site sale'
    if (s.clientId) {
      const c = clientsComposable.clients.value.find(client => client.id === s.clientId)
      if (c) clientName = c.name
    }
    const totalEggs = s.lines.reduce((sum, l) => sum + l.eggs, 0)
    return {
      id: s.id,
      client: clientName,
      qty: formatQty(totalEggs, trayEggs.value),
      price: formatPrice(s.saleTotal, currency.value),
    }
  })
})

// --- 5. This Week's Production Trend ---
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const weekDays = computed(() => {
  const res = []
  const todayStr = prod.today.value
  for (let i = 6; i >= 0; i--) {
    const dateStr = addDays(todayStr, -i)
    const dayData = prod.days.value.find(day => day.date === dateStr)
    const eggs = dayData?.goodTotal ?? 0
    const [y, m, d] = dateStr.split('-').map(Number)
    const localDate = new Date(y!, m! - 1, d!)
    const dayLabel = WEEKDAY_NAMES[localDate.getDay()]!
    res.push({
      date: dateStr,
      day: dayLabel,
      eggs,
      isToday: i === 0,
    })
  }
  return res
})

const maxWeekEggs = computed(() => Math.max(...weekDays.value.map(d => d.eggs), 1))

const weekBars = computed(() => {
  return weekDays.value.map(d => ({
    day: d.day,
    date: d.date,
    eggs: d.eggs,
    qty: formatQty(d.eggs, trayEggs.value),
    height: d.eggs > 0 ? `${Math.max(8, Math.round((d.eggs / maxWeekEggs.value) * 64))}px` : '4px',
    isToday: d.isToday,
  }))
})

// --- Empty State Detection ---
const hasAnyActivity = computed(() => {
  return (
    prod.days.value.length > 0
    || inventorySizes.value.some(s => s.onHandEggs !== 0 || s.owedEggs !== 0)
    || salesComposable.sales.value.length > 0
  )
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
    <!-- Initial Loading Skeletons -->
    <div
      v-if="initialLoading"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <USkeleton
        v-for="i in 4"
        :key="i"
        class="h-44 rounded-2xl"
      />
      <USkeleton class="sm:col-span-2 lg:col-span-3 h-36 rounded-2xl" />
    </div>

    <!-- Empty State (No records yet) -->
    <AppPlaceholder
      v-else-if="!hasAnyActivity"
      icon="i-lucide-layout-dashboard"
      title="Welcome to your farm overview"
      body="Log your first production or record a sale to start tracking your egg counts, inventory, and deliveries."
    >
      <div class="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
        <UButton
          to="/production"
          size="xl"
          icon="i-lucide-clipboard"
          label="Log Production"
          class="w-full sm:w-auto justify-center"
        />
        <UButton
          to="/sales"
          size="xl"
          color="neutral"
          variant="outline"
          icon="i-lucide-shopping-cart"
          label="Record Sale"
          class="w-full sm:w-auto justify-center"
        />
      </div>
    </AppPlaceholder>

    <!-- Active Live Dashboard -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <!-- Card 1: Today's production -->
      <NuxtLink
        to="/production"
        class="group flex flex-col justify-between rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs transition hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 text-sm font-medium text-muted group-hover:text-highlighted transition-colors">
            <UIcon
              name="i-lucide-clipboard"
              class="size-4.5"
            />
            <span>Today's production</span>
          </div>

          <div class="text-3xl font-bold tracking-tight text-highlighted tabular-nums">
            {{ todayQty }}
          </div>

          <div
            v-if="todayBySize.length > 0"
            class="flex flex-wrap gap-1.5 pt-1"
          >
            <UBadge
              v-for="s in todayBySize"
              :key="s.id"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ s.label }}
            </UBadge>
          </div>
          <p
            v-else
            class="text-xs text-muted"
          >
            No collection logged for today yet
          </p>
        </div>

        <div class="pt-3 text-xs text-dimmed">
          {{ todayRejects }} {{ todayRejects === 1 ? 'reject' : 'rejects' }} logged separately
        </div>
      </NuxtLink>

      <!-- Card 2: On hand now -->
      <NuxtLink
        to="/inventory"
        class="group flex flex-col justify-between rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs transition hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 text-sm font-medium text-muted group-hover:text-highlighted transition-colors">
            <UIcon
              name="i-lucide-package"
              class="size-4.5"
            />
            <span>On hand now</span>
          </div>

          <div
            class="text-3xl font-bold tracking-tight tabular-nums"
            :class="totalOnHandEggs < 0 ? 'text-error' : 'text-highlighted'"
          >
            {{ totalOnHandQty }}
          </div>

          <div
            v-if="inventoryBreakdown.length > 0"
            class="flex flex-col gap-1 pt-1"
          >
            <div
              v-for="item in inventoryBreakdown.slice(0, 4)"
              :key="item.id"
              class="flex justify-between items-center text-xs"
            >
              <span class="text-muted">{{ item.name }}</span>
              <span
                class="font-medium tabular-nums"
                :class="item.negative ? 'text-error font-semibold' : 'text-highlighted'"
              >
                {{ item.qty }}
              </span>
            </div>
          </div>
          <p
            v-else
            class="text-xs text-muted"
          >
            No inventory records
          </p>
        </div>

        <div class="pt-3 text-xs text-dimmed flex items-center gap-1">
          <span>Produced minus sales</span>
        </div>
      </NuxtLink>

      <!-- Card 3: Owed on open orders -->
      <NuxtLink
        to="/orders"
        class="group flex flex-col justify-between rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs transition hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 text-sm font-medium text-muted group-hover:text-highlighted transition-colors">
            <UIcon
              name="i-lucide-truck"
              class="size-4.5"
            />
            <span>Owed on open orders</span>
          </div>

          <div class="text-3xl font-bold tracking-tight text-highlighted tabular-nums">
            {{ owedTotalQty }}
          </div>

          <div
            v-if="owedPreview.length > 0"
            class="flex flex-col gap-1 pt-1"
          >
            <div
              v-for="p in owedPreview"
              :key="p.id"
              class="flex justify-between items-center text-xs"
            >
              <span class="text-muted">{{ p.name }}</span>
              <span class="font-medium text-highlighted tabular-nums">{{ p.qty }}</span>
            </div>
          </div>
          <p
            v-else
            class="text-xs text-muted"
          >
            No pending deliveries
          </p>
        </div>

        <div class="pt-3 text-xs text-dimmed">
          {{ totalOwedEggs > 0 ? 'Awaiting fulfillment' : 'All orders fulfilled' }}
        </div>
      </NuxtLink>

      <!-- Card 4: Recent sales -->
      <NuxtLink
        to="/sales"
        class="group flex flex-col justify-between rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs transition hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 text-sm font-medium text-muted group-hover:text-highlighted transition-colors">
            <UIcon
              name="i-lucide-shopping-cart"
              class="size-4.5"
            />
            <span>Recent sales</span>
          </div>

          <div
            v-if="recentSales.length > 0"
            class="flex flex-col gap-2 pt-1"
          >
            <div
              v-for="s in recentSales"
              :key="s.id"
              class="flex justify-between items-center text-sm"
            >
              <span class="truncate max-w-[130px] font-medium text-highlighted">{{ s.client }}</span>
              <span class="text-xs text-muted shrink-0 tabular-nums">
                {{ s.qty }} · <span class="font-medium text-highlighted">{{ s.price }}</span>
              </span>
            </div>
          </div>
          <p
            v-else
            class="text-xs text-muted py-2"
          >
            No sales recorded yet
          </p>
        </div>

        <div class="pt-3 text-xs text-dimmed">
          View all transactions in Sales
        </div>
      </NuxtLink>

      <!-- Card 5: This week's production (spans 2 or 3 columns) -->
      <div class="sm:col-span-2 lg:col-span-2 flex flex-col justify-between rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-medium text-muted">
            <UIcon
              name="i-lucide-trending-up"
              class="size-4.5"
            />
            <span>This week's production</span>
          </div>
          <span class="text-xs text-dimmed">Last 7 days</span>
        </div>

        <div class="flex items-end gap-2.5 h-28 pt-4 pb-1 px-1">
          <div
            v-for="bar in weekBars"
            :key="bar.date"
            class="flex-1 flex flex-col items-center justify-end h-full gap-2 group relative"
          >
            <!-- Hover Tooltip -->
            <div class="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-neutral-950 text-white text-[11px] px-2 py-0.5 rounded-md pointer-events-none whitespace-nowrap shadow-xs z-10">
              {{ bar.qty }}
            </div>

            <!-- Bar -->
            <div
              class="w-full max-w-[28px] rounded-t-sm transition-all"
              :class="bar.isToday ? 'bg-primary' : 'bg-primary/25 dark:bg-primary/30 group-hover:bg-primary/40'"
              :style="{ height: bar.height }"
            />

            <!-- Day Label -->
            <span
              class="text-xs tabular-nums"
              :class="bar.isToday ? 'font-bold text-primary' : 'text-dimmed'"
            >
              {{ bar.day }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
