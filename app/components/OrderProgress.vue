<!--
  One line's progress on an order card or row (feature 05 O-R6, AC2): the size, a small decorative bar and the text
  `20 of 30 trays`. The bar is aria-hidden: the text carries the meaning, so progress never depends on colour or bar
  length. Track `bg-accented`, fill `primary`, 8px tall, rounded. A long text (`8 trays + 1 of 12 trays`) wraps UNDER
  the bar so the bar keeps its width. `compact` fixes the bar at 96px for the desktop table.
-->
<script setup lang="ts">
import type { OrderLine } from '#shared/types/api'
import { formatProgress } from '#shared/utils/order-progress'

const props = defineProps<{
  line: Pick<OrderLine, 'sizeId' | 'orderedEggs' | 'deliveredEggs'>
  compact?: boolean
  /** The detail already shows the size as a heading: only the bar and the text. */
  hideName?: boolean
}>()

const { sizeById, trayEggs } = useFarm()

const name = computed(() => sizeById(props.line.sizeId).name)
const text = computed(() => formatProgress(props.line.deliveredEggs, props.line.orderedEggs, trayEggs.value))
const percent = computed(() => {
  const { orderedEggs, deliveredEggs } = props.line
  if (orderedEggs <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((deliveredEggs / orderedEggs) * 100)))
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <span
      v-if="!hideName"
      class="max-w-[40%] min-w-14 text-base font-medium wrap-anywhere text-highlighted"
    >{{ name }}</span>
    <div class="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-3 gap-y-1">
      <span
        aria-hidden="true"
        class="h-2 overflow-hidden rounded-full bg-accented"
        :class="compact ? 'w-24 shrink-0' : 'min-w-18 flex-1'"
      >
        <span
          class="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          :style="{ width: `${percent}%` }"
        />
      </span>
      <span class="text-sm text-default tabular-nums">{{ text }}</span>
    </div>
  </div>
</template>
