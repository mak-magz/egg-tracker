<!--
  Inventory (feature 06). Design: docs/design/source/template.html (screen `inventory`), with the deviations in
  §2.5 (no Sellable, true negatives, owed in words). Read-only; loads on mount and when the tab becomes visible
  again, always through skeletons so no stale figure shows (AC16, AC18). No primaryAction (no FAB here).
-->
<script setup lang="ts">
import { inventoryTotals } from '#shared/utils/inventory'

const { eggsPerTray } = useFarm()
const inv = useInventory()

onMounted(() => void inv.load())

function onVisible() {
  if (document.visibilityState === 'visible') void inv.load()
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))

const sizes = computed(() => inv.data.value?.sizes ?? [])
const totals = computed(() => inventoryTotals(sizes.value))
const isEmpty = computed(() => inv.status.value === 'ready' && !inv.data.value?.hasAny)
const showContent = computed(() => inv.status.value === 'ready' && !!inv.data.value?.hasAny && !!eggsPerTray.value)
const isLoading = computed(() => inv.status.value === 'loading' || (inv.status.value === 'ready' && !eggsPerTray.value && !isEmpty.value))
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
    <div
      v-if="inv.status.value === 'error'"
      role="alert"
      class="mx-auto flex w-full max-w-[560px] flex-col gap-3"
    >
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-cloud-off"
        :title="INVENTORY_COPY.errorTitle"
        :description="INVENTORY_COPY.errorBody"
      />
      <UButton
        size="xl"
        icon="i-lucide-refresh-cw"
        :label="INVENTORY_COPY.retry"
        class="min-h-11 w-full justify-center sm:w-auto sm:self-start"
        @click="inv.load()"
      />
    </div>

    <AppPlaceholder
      v-else-if="isEmpty"
      icon="i-lucide-package"
      :title="INVENTORY_COPY.emptyTitle"
      :body="INVENTORY_COPY.emptyBody"
    >
      <UButton
        to="/production"
        size="xl"
        icon="i-lucide-clipboard"
        :label="INVENTORY_COPY.emptyAction"
        class="min-h-11 w-full justify-center sm:w-auto"
      />
    </AppPlaceholder>

    <div
      v-else-if="isLoading"
      aria-busy="true"
      class="flex flex-col gap-4"
    >
      <USkeleton class="h-[190px] w-full rounded-2xl" />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-[110px] w-full rounded-2xl"
        />
      </div>
    </div>

    <template v-else-if="showContent && eggsPerTray">
      <InventoryTotalCard
        :on-hand-eggs="totals.onHandEggs"
        :owed-eggs="totals.owedEggs"
        :eggs-per-tray="eggsPerTray"
        class="mx-auto w-full max-w-[720px]"
      />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InventorySizeCard
          v-for="size in sizes"
          :key="size.id"
          :size="size"
          :eggs-per-tray="eggsPerTray"
        />
      </div>
      <p class="mx-auto max-w-[560px] text-center text-sm text-muted">
        {{ INVENTORY_COPY.footnote }}
      </p>
    </template>
  </div>
</template>
