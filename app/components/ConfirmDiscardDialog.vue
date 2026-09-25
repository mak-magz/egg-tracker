<!--
  "Discard this entry?" / "Discard your changes?" (feature 01 AC14, §2.5 "Confirm dialogs").
  Centred at every width, max 400px. Keep editing is first in the DOM, so it gets focus on open
  (the safe choice); on mobile the buttons stack full width with Discard on top.
-->
<script setup lang="ts">
defineProps<{
  title: string
  body: string
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ discard: [] }>()

function discard() {
  open.value = false
  emit('discard')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="body"
    :close="false"
    :ui="{ content: 'max-w-[400px] rounded-2xl', footer: 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' }"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        class="justify-center max-sm:w-full"
        :label="PRODUCTION_COPY.keepEditing"
        @click="open = false"
      />
      <UButton
        color="error"
        variant="soft"
        size="xl"
        class="justify-center max-sm:w-full"
        :label="PRODUCTION_COPY.discard"
        @click="discard"
      />
    </template>
  </UModal>
</template>
