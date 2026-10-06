<!--
  An order's deliveries (feature 05 AC7, flow H, §2.5 "Order detail"): each row is a 56px+ button that opens that
  sale (stacked, read-only, D3/U2). A voided delivery is kept and marked Voided with "Not counted". `deliveries`
  is null while they load (skeleton) and `failed` shows a plain message with Try again.
-->
<script setup lang="ts">
import type { IsoDate, OrderDelivery } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { formatShortDate } from '~/utils/day-label'
import { ORDER_COPY } from '~/utils/order-copy'

defineProps<{
  deliveries: readonly OrderDelivery[] | null
  failed?: boolean
  today: IsoDate
}>()

const emit = defineEmits<{
  open: [delivery: OrderDelivery]
  retry: []
}>()

const { sizeById, trayEggs } = useFarm()

function linesText(delivery: OrderDelivery): string {
  return delivery.lines.map(l => `${sizeById(l.sizeId).name} ${formatQty(l.eggs, trayEggs.value)}`).join(', ')
}
</script>

<template>
  <section
    class="flex flex-col gap-2"
    :aria-label="ORDER_COPY.deliveriesHeading"
  >
    <h3 class="text-base font-semibold text-highlighted">
      {{ ORDER_COPY.deliveriesHeading }}
    </h3>

    <div
      v-if="failed"
      class="flex flex-col items-start gap-2"
    >
      <p
        class="text-base text-muted"
        role="alert"
      >
        {{ ORDER_COPY.deliveriesLoadFailed }}
      </p>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="min-h-11"
        :label="ORDER_COPY.tryAgain"
        @click="emit('retry')"
      />
    </div>
    <USkeleton
      v-else-if="deliveries === null"
      class="h-14 w-full rounded-xl bg-accented"
      aria-hidden="true"
    />
    <p
      v-else-if="deliveries.length === 0"
      class="text-base text-muted"
    >
      {{ ORDER_COPY.noDeliveries }}
    </p>
    <ul
      v-else
      role="list"
      class="flex flex-col gap-2"
    >
      <li
        v-for="delivery in deliveries"
        :key="delivery.saleId"
      >
        <button
          type="button"
          class="flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left ring ring-inset ring-default transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :aria-label="ORDER_COPY.openSaleAria(delivery.saleNumber)"
          :data-order-focus="`sale:${delivery.saleId}`"
          @click="emit('open', delivery)"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-base font-semibold text-highlighted">{{ ORDER_COPY.saleRow(delivery.saleNumber, formatShortDate(delivery.deliveredDate, today)) }}</span>
              <UBadge
                v-if="delivery.voidedAt"
                color="neutral"
                variant="subtle"
                size="md"
                :label="ORDER_COPY.voided"
              />
            </span>
            <span class="text-sm wrap-anywhere text-default">
              {{ linesText(delivery) }}<template v-if="delivery.voidedAt"> · {{ ORDER_COPY.notCounted }}</template>
            </span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-dimmed"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </section>
</template>
