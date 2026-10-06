<!--
  An order's status as a word (feature 05 O-R5, AC "Statuses"): never colour alone. `Fulfilled (closed short)` is
  allowed to wrap onto its own row; it is never cut. Fulfilled and Cancelled cards are not dimmed.
-->
<script setup lang="ts">
import type { Order, OrderStatus } from '#shared/types/api'
import { orderStatusLabel } from '#shared/utils/order-status'

const props = defineProps<{ order: Pick<Order, 'status' | 'closedShortAt'> }>()

type BadgeLook = { color: 'neutral' | 'info' | 'primary' | 'warning' | 'success', variant: 'subtle' | 'soft' | 'outline' }

const LOOKS: Record<OrderStatus, BadgeLook> = {
  requested: { color: 'neutral', variant: 'subtle' },
  confirmed: { color: 'info', variant: 'subtle' },
  ready: { color: 'primary', variant: 'subtle' },
  partially_fulfilled: { color: 'warning', variant: 'soft' },
  fulfilled: { color: 'success', variant: 'subtle' },
  cancelled: { color: 'neutral', variant: 'outline' },
}

const look = computed(() => LOOKS[props.order.status])
</script>

<template>
  <UBadge
    :color="look.color"
    :variant="look.variant"
    size="md"
    :label="orderStatusLabel(order)"
    class="shrink-0 whitespace-normal"
  />
</template>
