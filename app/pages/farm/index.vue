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
import { formatPrice } from '#shared/utils/price'
import { formatQty, formatQtySigned } from '#shared/utils/quantity'
import { sizeColor } from '~/utils/size-colors'

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
        name: sz.name,
        qty: formatQty(g.eggs, trayEggs.value),
        colorClass: sizeColor(sz.colorSlot).class,
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
      colorClass: sizeColor(s.colorSlot).class,
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
      colorClass: sizeColor(s.colorSlot).class,
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
      isDelivery: s.type === 'delivery',
      qty: formatQty(totalEggs, trayEggs.value),
      price: formatPrice(s.saleTotal, currency.value),
    }
  })
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
          to="/farm/production"
          size="xl"
          icon="i-lucide-clipboard"
          label="Log Production"
          class="w-full sm:w-auto justify-center"
        />
        <UButton
          to="/farm/sales"
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
        to="/farm/production"
        class="group relative flex flex-col justify-between rounded-2xl bg-default border border-default/70 hover:border-primary/40 p-5 shadow-xs hover:shadow-md transition-all duration-200 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <UIcon
                  name="i-lucide-egg"
                  class="size-4.5"
                />
              </div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-muted">Today's Production</span>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100"
            />
          </div>

          <div class="mt-3.5 flex items-baseline gap-2">
            <span class="text-3xl sm:text-4xl font-extrabold tracking-tight text-highlighted tabular-nums">
              {{ todayQty }}
            </span>
          </div>

          <div
            v-if="todayBySize.length > 0"
            class="mt-3 flex flex-wrap gap-1.5"
          >
            <div
              v-for="s in todayBySize"
              :key="s.id"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 text-xs font-medium text-default"
            >
              <span
                class="size-2 rounded-full shrink-0 bg-current"
                :class="s.colorClass"
              />
              <span>{{ s.name }}:</span>
              <span class="font-bold tabular-nums text-highlighted">{{ s.qty }}</span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-xs text-muted"
          >
            No collection logged for today yet
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-default/60 flex items-center justify-between text-xs">
          <div
            class="flex items-center gap-1.5"
            :class="todayRejects > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-dimmed'"
          >
            <UIcon
              :name="todayRejects > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle-2'"
              class="size-3.5"
            />
            <span>{{ todayRejects }} {{ todayRejects === 1 ? 'reject' : 'rejects' }} logged</span>
          </div>
          <span class="text-primary font-semibold group-hover:underline inline-flex items-center gap-0.5">
            Log collection
          </span>
        </div>
      </NuxtLink>

      <!-- Card 2: On hand now -->
      <NuxtLink
        to="/farm/inventory"
        class="group relative flex flex-col justify-between rounded-2xl bg-default border border-default/70 hover:border-primary/40 p-5 shadow-xs hover:shadow-md transition-all duration-200 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <UIcon
                  name="i-lucide-package"
                  class="size-4.5"
                />
              </div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-muted">On Hand Now</span>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100"
            />
          </div>

          <div class="mt-3.5 flex items-baseline justify-between gap-2">
            <span
              class="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums"
              :class="totalOnHandEggs < 0 ? 'text-error' : 'text-highlighted'"
            >
              {{ totalOnHandQty }}
            </span>
            <span
              v-if="totalOnHandEggs > 0"
              class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3"
              />
              In Stock
            </span>
            <span
              v-else-if="totalOnHandEggs < 0"
              class="inline-flex items-center gap-1 text-[11px] font-bold text-error bg-error/10 px-2.5 py-0.5 rounded-full"
            >
              <UIcon
                name="i-lucide-alert-circle"
                class="size-3"
              />
              Negative stock
            </span>
          </div>

          <div
            v-if="inventoryBreakdown.length > 0"
            class="mt-3 flex flex-col gap-1.5"
          >
            <div
              v-for="item in inventoryBreakdown.slice(0, 4)"
              :key="item.id"
              class="flex justify-between items-center text-xs"
            >
              <div class="flex items-center gap-1.5">
                <span
                  class="size-2 rounded-full shrink-0 bg-current"
                  :class="item.colorClass"
                />
                <span class="text-muted">{{ item.name }}</span>
              </div>
              <span
                class="font-bold tabular-nums"
                :class="item.negative ? 'text-error font-semibold' : 'text-highlighted'"
              >
                {{ item.qty }}
              </span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-xs text-muted"
          >
            No inventory records
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-default/60 flex items-center justify-between text-xs">
          <span class="text-dimmed">Produced minus sales</span>
          <span class="text-primary font-semibold group-hover:underline inline-flex items-center gap-0.5">
            View Inventory
          </span>
        </div>
      </NuxtLink>

      <!-- Card 3: Owed on open orders -->
      <NuxtLink
        to="/farm/orders"
        class="group relative flex flex-col justify-between rounded-2xl bg-default border border-default/70 hover:border-primary/40 p-5 shadow-xs hover:shadow-md transition-all duration-200 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <UIcon
                  name="i-lucide-truck"
                  class="size-4.5"
                />
              </div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-muted">Owed on Orders</span>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100"
            />
          </div>

          <div class="mt-3.5 flex items-baseline justify-between gap-2">
            <span class="text-3xl sm:text-4xl font-extrabold tracking-tight text-highlighted tabular-nums">
              {{ owedTotalQty }}
            </span>
            <span
              v-if="totalOwedEggs > 0"
              class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full"
            >
              <UIcon
                name="i-lucide-clock"
                class="size-3"
              />
              Pending
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full"
            >
              <UIcon
                name="i-lucide-check-check"
                class="size-3"
              />
              Fulfilled
            </span>
          </div>

          <div
            v-if="owedPreview.length > 0"
            class="mt-3 flex flex-col gap-1.5"
          >
            <div
              v-for="p in owedPreview"
              :key="p.id"
              class="flex justify-between items-center text-xs"
            >
              <div class="flex items-center gap-1.5">
                <span
                  class="size-2 rounded-full shrink-0 bg-current"
                  :class="p.colorClass"
                />
                <span class="text-muted">{{ p.name }}</span>
              </div>
              <span class="font-bold text-highlighted tabular-nums">{{ p.qty }}</span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-xs text-muted"
          >
            No pending deliveries
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-default/60 flex items-center justify-between text-xs">
          <span class="text-dimmed">{{ totalOwedEggs > 0 ? 'Awaiting fulfillment' : 'All orders fulfilled' }}</span>
          <span class="text-primary font-semibold group-hover:underline inline-flex items-center gap-0.5">
            View Orders
          </span>
        </div>
      </NuxtLink>

      <!-- Card 4: Recent sales -->
      <NuxtLink
        to="/farm/sales"
        class="group relative flex flex-col justify-between rounded-2xl bg-default border border-default/70 hover:border-primary/40 p-5 shadow-xs hover:shadow-md transition-all duration-200 focus:outline-hidden focus:ring-2 focus:ring-primary"
      >
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <UIcon
                  name="i-lucide-receipt"
                  class="size-4.5"
                />
              </div>
              <span class="text-[11px] font-bold uppercase tracking-wider text-muted">Recent Sales</span>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100"
            />
          </div>

          <div
            v-if="recentSales.length > 0"
            class="mt-3.5 flex flex-col gap-2"
          >
            <div
              v-for="s in recentSales"
              :key="s.id"
              class="flex justify-between items-center text-xs py-0.5"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="size-1.5 rounded-full shrink-0"
                  :class="s.isDelivery ? 'bg-blue-500' : 'bg-amber-500'"
                />
                <span class="truncate font-semibold text-highlighted">{{ s.client }}</span>
              </div>
              <span class="text-xs text-muted shrink-0 tabular-nums ps-2">
                {{ s.qty }} · <span class="font-bold text-highlighted">{{ s.price }}</span>
              </span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-xs text-muted py-2"
          >
            No sales recorded yet
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-default/60 flex items-center justify-between text-xs">
          <span class="text-dimmed">Latest transactions</span>
          <span class="text-primary font-semibold group-hover:underline inline-flex items-center gap-0.5">
            View Sales
          </span>
        </div>
      </NuxtLink>

      <!-- Card 5: This week's production (spans 2 or 3 columns) -->
      <DashboardProductionTrend
        :days="prod.days.value"
        :today="prod.today.value"
        :eggs-per-tray="trayEggs"
        class="sm:col-span-2 lg:col-span-2"
      />
    </div>
  </div>
</template>
