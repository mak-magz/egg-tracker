<!--
  The detail's Status control (feature 05 flow C, AC21, owner decision D1): a three-option choice
  Requested | Confirmed | Ready with the current one selected; any option is one tap, forward or back, no
  confirmation. A radio group named "Status"; the selected option has a check, a ring and bold text. The tapped
  option shows a spinner and the others wait (O-R1). Shown by the detail only for Requested, Confirmed and Ready.
-->
<script setup lang="ts">
import type { OrderManualStatus } from '#shared/types/api'
import { ORDER_MANUAL_STATUSES } from '#shared/constants/orders'
import { ORDER_STATUS_LABEL } from '#shared/utils/order-status'
import { ORDER_COPY } from '~/utils/order-copy'

defineProps<{
  current: OrderManualStatus
  /** The option whose request is running, if any. */
  busyStatus: OrderManualStatus | null
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [status: OrderManualStatus] }>()
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ORDER_COPY.detailStatus"
    class="grid grid-cols-3 gap-2"
  >
    <UButton
      v-for="status in ORDER_MANUAL_STATUSES"
      :key="status"
      role="radio"
      :aria-checked="current === status"
      :color="current === status ? 'primary' : 'neutral'"
      :variant="current === status ? 'soft' : 'outline'"
      size="xl"
      class="min-h-11 justify-center px-2 ring-inset"
      :class="current === status ? 'font-bold ring-2 ring-primary' : 'font-medium'"
      :loading="busyStatus === status"
      :disabled="disabled || (busyStatus !== null && busyStatus !== status)"
      :data-order-focus="`status:${status}`"
      @click="current !== status && emit('select', status)"
    >
      <UIcon
        v-if="current === status && busyStatus !== status"
        name="i-lucide-check"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      {{ ORDER_STATUS_LABEL[status] }}
    </UButton>
  </div>
</template>
