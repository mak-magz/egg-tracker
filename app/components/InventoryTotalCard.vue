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
  <UCard
    role="group"
    :aria-label="INVENTORY_COPY.totalGroupLabel(trays)"
    :ui="{ root: 'rounded-2xl', body: 'p-5 sm:p-6 flex flex-col items-center gap-1 text-center' }"
  >
    <p class="text-sm font-medium text-muted">
      {{ INVENTORY_COPY.totalTitle }}
    </p>
    <p class="text-4xl font-bold text-highlighted tabular-nums">
      {{ trays }}
    </p>
    <p class="text-base text-muted tabular-nums">
      {{ eggsLine }}
    </p>
    <div class="mt-3 flex w-full max-w-sm flex-col gap-1 border-t border-default pt-3 text-sm">
      <div class="flex items-center justify-center gap-2">
        <UIcon
          name="i-lucide-truck"
          class="size-4 shrink-0 text-muted"
        />
        <span class="text-muted">{{ INVENTORY_COPY.owedTotal }}</span>
        <span class="font-semibold text-default tabular-nums">{{ owed }}</span>
      </div>
      <p
        v-if="short"
        class="flex items-center justify-center gap-1.5 font-medium text-warning-700 dark:text-warning-300"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-4 shrink-0"
        />
        <span>{{ short }}</span>
      </p>
    </div>
  </UCard>
</template>
