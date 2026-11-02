<!--
  One size on the Inventory screen (feature 06 §2.5). Read-only. Dot + name in a stable color pill,
  trays, egg count, stock health indicator, owed row, and negative/short warning badges.
-->
<script setup lang="ts">
import type { InventorySize } from '#shared/types/api'
import { shortByEggs } from '#shared/utils/inventory'
import { formatQty, formatQtySigned } from '#shared/utils/quantity'

const props = defineProps<{ size: InventorySize, eggsPerTray: number }>()

const trays = computed(() => formatQtySigned(props.size.onHandEggs, props.eggsPerTray))
const eggsLine = computed(() => eggsOnHandLine(props.size.onHandEggs))
const owed = computed(() => (props.size.owedEggs > 0 ? formatQty(props.size.owedEggs, props.eggsPerTray) : null))
const short = computed(() => {
  const n = shortByEggs(props.size.onHandEggs, props.size.owedEggs)
  return n > 0 ? INVENTORY_COPY.shortBy(formatQty(n, props.eggsPerTray)) : null
})
const negative = computed(() => props.size.onHandEggs < 0)
const color = computed(() => sizeColor(props.size.colorSlot))
</script>

<template>
  <div
    role="group"
    :aria-label="INVENTORY_COPY.groupLabel(size.name, trays)"
    class="rounded-2xl border bg-default p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group"
    :class="negative ? 'border-red-200 dark:border-red-900/50' : 'border-default/70 hover:border-default'"
  >
    <div>
      <!-- Header: Size pill + Stock health indicator -->
      <div class="flex items-center justify-between gap-2">
        <div
          class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-current/10 border border-current/20 text-xs font-bold min-w-0"
          :class="color.class"
        >
          <span class="size-2 rounded-full bg-current shrink-0" />
          <span class="truncate">{{ size.name }}</span>
        </div>

        <UBadge
          v-if="!size.active"
          color="neutral"
          variant="outline"
          size="sm"
          :label="INVENTORY_COPY.inactiveBadge"
        />
        <span
          v-else-if="negative"
          class="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="size-3"
          />
          Negative
        </span>
        <span
          v-else-if="size.onHandEggs > 0"
          class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full"
        >
          <UIcon
            name="i-lucide-check"
            class="size-3"
          />
          In Stock
        </span>
      </div>

      <!-- Value: Hero trays & eggs -->
      <div class="mt-4">
        <p
          class="text-3xl font-black tabular-nums tracking-tight"
          :class="negative ? 'text-red-600 dark:text-red-400' : 'text-highlighted'"
        >
          {{ trays }}
        </p>
        <p
          class="text-xs font-semibold mt-0.5 tabular-nums"
          :class="negative ? 'text-red-500/80 dark:text-red-400/80' : 'text-muted'"
        >
          {{ eggsLine }}
        </p>
      </div>

      <!-- Negative Note Callout -->
      <div
        v-if="negative"
        class="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1.5"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-3.5 shrink-0"
        />
        <span>{{ INVENTORY_COPY.negativeNote }}</span>
      </div>
    </div>

    <!-- Footer: Owed status & Short alert -->
    <div
      class="mt-5 pt-3.5 border-t border-default/60 flex items-center justify-between text-xs"
      :class="negative ? 'border-red-100 dark:border-red-950/80' : ''"
    >
      <div
        class="flex items-center gap-1.5"
        :class="owed ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-muted'"
      >
        <UIcon
          name="i-lucide-truck"
          class="size-3.5 shrink-0"
        />
        <span>{{ INVENTORY_COPY.owedSize }}:</span>
      </div>
      <span
        v-if="short"
        class="font-black text-red-600 dark:text-red-400 tabular-nums bg-red-500/10 px-2 py-0.5 rounded-md"
      >
        {{ short }}
      </span>
      <span
        v-else-if="owed"
        class="font-bold text-blue-600 dark:text-blue-400 tabular-nums bg-blue-500/10 px-2 py-0.5 rounded-md"
      >
        {{ owed }}
      </span>
      <span
        v-else
        class="font-bold text-muted tabular-nums"
      >
        0 trays
      </span>
    </div>
  </div>
</template>
