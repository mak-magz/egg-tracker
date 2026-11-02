<!--
  Total on hand (feature 06 §2.5). Sums come from inventoryTotals of the cards shown, so it equals them exactly
  (AC3). The owed row always shows (0 trays when nothing is owed); "Short by" only when total owed exceeds it.
-->
<script setup lang="ts">
import { shortByEggs } from '#shared/utils/inventory'
import { formatQty, formatQtySigned } from '#shared/utils/quantity'

const props = defineProps<{ onHandEggs: number, owedEggs: number, eggsPerTray: number }>()

const trays = computed(() => formatQtySigned(props.onHandEggs, props.eggsPerTray))
const eggsLine = computed(() => eggsOnHandLine(props.onHandEggs).replace(/ on hand$/, ''))
const owed = computed(() => formatQty(props.owedEggs, props.eggsPerTray))
const short = computed(() => {
  const n = shortByEggs(props.onHandEggs, props.owedEggs)
  return n > 0 ? INVENTORY_COPY.shortBy(formatQty(n, props.eggsPerTray)) : null
})
</script>

<template>
  <div
    role="group"
    :aria-label="INVENTORY_COPY.totalGroupLabel(trays)"
    class="rounded-3xl border border-default/80 bg-default p-6 sm:p-8 shadow-xs text-center flex flex-col items-center gap-2 hover:shadow-md transition-all duration-200"
  >
    <!-- Category Icon Badge -->
    <div class="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
      <UIcon
        name="i-lucide-package"
        class="size-6"
      />
    </div>

    <p class="text-xs font-bold uppercase tracking-wider text-muted">
      {{ INVENTORY_COPY.totalTitle }}
    </p>

    <p class="text-4xl sm:text-5xl font-black text-highlighted tracking-tight tabular-nums">
      {{ trays }}
    </p>

    <p class="text-sm font-semibold text-muted tabular-nums">
      {{ eggsLine }}
    </p>

    <!-- Owed on orders & Short status container -->
    <div class="mt-4 pt-4 border-t border-default/70 w-full max-w-md flex flex-col items-center gap-2">
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-semibold text-default">
        <UIcon
          name="i-lucide-truck"
          class="size-4 text-blue-500 shrink-0"
        />
        <span class="text-muted">{{ INVENTORY_COPY.owedTotal }}:</span>
        <span class="font-bold text-highlighted tabular-nums">{{ owed }}</span>
      </div>

      <p
        v-if="short"
        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning-500/10 border border-warning-500/20 text-xs font-bold text-warning-700 dark:text-warning-300"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-3.5 shrink-0"
        />
        <span>{{ short }}</span>
      </p>
    </div>
  </div>
</template>
