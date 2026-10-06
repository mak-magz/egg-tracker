<!--
  One size on the Inventory screen (feature 06 §2.5). Read-only. Dot + name, trays, egg count, an owed row only
  when above 0, "Short by" and the negative note as icon + words (never colour alone, AC24). Text uses
  text-muted and darker warning shades for 4.5:1 on white.
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
  <UCard
    role="group"
    :aria-label="INVENTORY_COPY.groupLabel(size.name, trays)"
    :ui="{ root: 'rounded-2xl', body: 'p-4 sm:p-4 flex flex-col gap-1' }"
  >
    <div class="flex items-center gap-2">
      <span
        aria-hidden="true"
        class="size-2.5 shrink-0 rounded-full bg-current"
        :class="color.class"
      />
      <span class="min-w-0 flex-1 truncate text-base font-semibold text-highlighted">{{ size.name }}</span>
      <UBadge
        v-if="!size.active"
        color="neutral"
        variant="outline"
        size="sm"
        :label="INVENTORY_COPY.inactiveBadge"
      />
    </div>
    <p class="text-2xl font-bold text-highlighted tabular-nums">
      {{ trays }}
    </p>
    <p class="text-sm text-muted tabular-nums">
      {{ eggsLine }}
    </p>
    <p
      v-if="negative"
      class="mt-1 flex items-start gap-1.5 text-sm font-medium text-warning-700 dark:text-warning-300"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="mt-0.5 size-4 shrink-0"
      />
      <span>{{ INVENTORY_COPY.negativeNote }}</span>
    </p>
    <template v-if="owed">
      <div class="mt-2 flex items-center gap-2 border-t border-default pt-2 text-sm">
        <UIcon
          name="i-lucide-truck"
          class="size-4 shrink-0 text-muted"
        />
        <span class="flex-1 text-muted">{{ INVENTORY_COPY.owedSize }}</span>
        <span class="font-semibold text-default tabular-nums">{{ owed }}</span>
      </div>
      <p
        v-if="short"
        class="flex items-center gap-1.5 text-sm font-medium text-warning-700 dark:text-warning-300"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-4 shrink-0"
        />
        <span>{{ short }}</span>
      </p>
    </template>
  </UCard>
</template>
