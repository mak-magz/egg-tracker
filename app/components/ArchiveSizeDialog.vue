<!--
  Archive confirmation (feature 02 AC11, AC14; §2.5 "Archive confirmation"). Modelled on
  ProductionDeleteDialog: UModal, 400px, Cancel first in the DOM so it takes focus, buttons stacked on
  phones with Archive on top. A plain confirmation, not a red "delete" one: nothing is lost and Restore
  undoes it. While it saves, Archive spins and the dialog can't be closed. A failure shows an alert
  inside and keeps the dialog open (Archive retries). The parent runs the request.
-->
<script setup lang="ts">
const props = defineProps<{
  /** The size's current name. */
  name: string
  saving: boolean
  /** The failure message shown inside the dialog. */
  error: string | null
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  confirm: []
}>()

function onUpdateOpen(value: boolean) {
  if (!value && props.saving) return // can't close mid-save
  open.value = value
}
</script>

<template>
  <UModal
    :open="open"
    :title="SIZE_COPY.archiveTitle(name)"
    :close="false"
    :dismissible="!saving"
    :ui="{ content: 'max-w-[400px] rounded-2xl', body: 'flex flex-col gap-2 text-base text-default', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <p>{{ SIZE_COPY.archiveBody(name) }}</p>
      <p class="text-sm text-muted">
        {{ SIZE_COPY.archiveRestoreNote }}
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
        :label="SIZE_COPY.cancel"
        :disabled="saving"
        @click="open = false"
      />
      <UButton
        size="xl"
        icon="i-lucide-archive"
        class="justify-center max-sm:w-full"
        :label="SIZE_COPY.archive"
        :loading="saving"
        @click="emit('confirm')"
      />
    </template>
  </UModal>
</template>
