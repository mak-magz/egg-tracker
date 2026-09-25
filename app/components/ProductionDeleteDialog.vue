<!--
  Delete day confirm (feature 01 AC24–AC26; §2.5 "Confirm dialogs"). Names the date and lists what is
  removed (lines above zero only). The AC24 variant (Edit with every amount at 0) adds a lead line and
  offers "Keep editing". Cancel/Keep editing is first in the DOM so it gets focus; on phones the
  buttons stack full width with Delete day on top. Delete shows a spinner; a failure shows an inline
  error, keeps the dialog open and leaves the day unchanged; Delete day retries.
-->
<script setup lang="ts">
import type { IsoDate, ProductionDay } from '#shared/types/api'
import { PRODUCTION_MESSAGES } from '#shared/constants/production'
import { formatLabelledQty } from '#shared/utils/quantity'

const props = defineProps<{
  day: ProductionDay | null
  today: IsoDate
  eggsPerTray: number
  /** AC24: opened from Edit because every amount was set to 0. */
  fromEdit?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'deleted': [removed: ProductionDay]
  'not-found': [date: IsoDate]
}>()

const mutations = useProductionMutations()
const deleting = ref(false)
const error = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) error.value = null
})

const title = computed(() => (props.day ? PRODUCTION_COPY.deleteTitle(formatDayPhrase(props.day.date, props.today)) : ''))
const removes = computed(() => {
  const d = props.day
  if (!d) return []
  const lines: string[] = []
  if (d.goodTotal > 0) lines.push(formatLabelledQty('Good', d.goodTotal, props.eggsPerTray))
  if (d.rejects > 0) lines.push(formatLabelledQty('Rejects', d.rejects, props.eggsPerTray))
  return lines
})

async function confirm() {
  const d = props.day
  if (!d || deleting.value) return
  error.value = null
  deleting.value = true
  const result = await mutations.remove(d.date)
  deleting.value = false
  if (!result) return
  if (result.ok) {
    open.value = false
    emit('deleted', result.data.removed)
  }
  else if (result.error.kind === 'not_found') {
    open.value = false
    emit('not-found', d.date)
  }
  else {
    error.value = PRODUCTION_MESSAGES.deleteFailed
  }
}

function onUpdateOpen(value: boolean) {
  if (!value && deleting.value) return // can't close mid-delete
  open.value = value
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :close="false"
    :dismissible="!deleting"
    :ui="{ content: 'max-w-[400px] rounded-2xl', body: 'flex flex-col gap-2 text-base text-default', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <p v-if="fromEdit">
        {{ PRODUCTION_COPY.deleteLeadFromEdit }}
      </p>
      <p>{{ PRODUCTION_COPY.deleteRemoves }}</p>
      <ul class="flex flex-col gap-0.5 ps-4">
        <li
          v-for="line in removes"
          :key="line"
          class="font-medium text-highlighted"
        >
          {{ line }}
        </li>
      </ul>
      <p class="text-muted">
        {{ PRODUCTION_COPY.deleteNoUndo }}
      </p>
      <UAlert
        v-if="error"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="justify-center max-sm:w-full"
        :label="fromEdit ? PRODUCTION_COPY.keepEditing : PRODUCTION_COPY.cancel"
        :disabled="deleting"
        @click="open = false"
      />
      <UButton
        color="error"
        size="xl"
        icon="i-lucide-trash-2"
        class="justify-center max-sm:w-full"
        :label="PRODUCTION_COPY.deleteDay"
        :loading="deleting"
        @click="confirm"
      />
    </template>
  </UModal>
</template>
