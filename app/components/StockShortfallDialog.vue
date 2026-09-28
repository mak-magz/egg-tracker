<!--
  "Not enough on hand" (feature 04 §2.5 flow F, AC26, AC35, AC42): shared by Add and Edit (Mark delivered
  shows its own warning inline, AC35). Lists only the short sizes, in the farm's order. "Go back" closes
  this dialog and returns to the still-open form with every typed value kept, focus on Save (the safe
  choice, so it is first in the DOM). "Record anyway" tells the host to resubmit with confirmShortfall=true.
-->
<script setup lang="ts">
import { SALE_COPY } from '~/utils/sale-copy'

export interface ShortfallDisplayLine {
  name: string
  onHandText: string
  neededText: string
}

defineProps<{
  lines: readonly ShortfallDisplayLine[]
  verb: 'selling' | 'delivering' | 'adding'
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ 'record-anyway': [] }>()

function recordAnyway() {
  open.value = false
  emit('record-anyway')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="SALE_COPY.shortfallTitle"
    :close="false"
    :ui="{ content: 'max-w-[400px] rounded-2xl', body: 'flex flex-col gap-2 text-base text-default', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
  >
    <template #body>
      <p>{{ verb === 'selling' ? SALE_COPY.shortfallLeadSelling : verb === 'delivering' ? SALE_COPY.shortfallLeadDelivering : SALE_COPY.shortfallLeadAdding }}</p>
      <ul class="flex flex-col gap-0.5 ps-4">
        <li
          v-for="line in lines"
          :key="line.name"
          class="font-medium text-highlighted"
        >
          {{ SALE_COPY.shortfallRow(line.name, line.onHandText, verb, line.neededText) }}
        </li>
      </ul>
      <p class="text-muted">
        {{ SALE_COPY.shortfallClosing }}
      </p>
    </template>
    <template #footer>
      <UButton
        color="primary"
        size="xl"
        class="justify-center max-sm:w-full sm:order-2"
        :label="SALE_COPY.recordAnyway"
        @click="recordAnyway"
      />
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="justify-center max-sm:w-full sm:order-1"
        autofocus
        :label="SALE_COPY.goBack"
        @click="open = false"
      />
    </template>
  </UModal>
</template>
