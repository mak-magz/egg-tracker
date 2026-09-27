<!--
  The Add / Edit client overlay (feature 03 UX "Add client: mobile bottom sheet / desktop dialog", AC8, AC17):
  a thin host for ClientForm, like ProductionFormOverlay. One UModal styled by breakpoint (SSR-safe, no JS
  breakpoint): below md the design's bottom sheet, lifted above the keypad; at md+ a centred 420px dialog (the
  design's). Every close (✕, Cancel, overlay tap, Esc) goes through the discard check and is blocked while saving.
  Like Production's sheet it is not swipe-to-close: a drawer that could be swiped would still need the discard
  check, and vaul can't run it (feature 01 §3.4 fallback).
  Sales hosts this same overlay on top of the sale form (AC34): nothing here knows which screen opened it.
  Focus: Add focuses Name on open (all widths: the sheet is short and lifted above the keypad); Edit focuses Name
  with its text selected on desktop only, and on phones lets focus start on the sheet so no keypad opens before
  the owner picks a field. On close the host decides where focus goes (`closed`), because the opener may be gone.
-->
<script setup lang="ts">
import type { Client } from '#shared/types/api'
import type { ClientSavedEvent } from '~/components/ClientForm.vue'

const props = defineProps<{
  mode: 'add' | 'edit'
  client?: Client | null
  initialName?: string
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'saved': [event: ClientSavedEvent]
  'changed-elsewhere': []
  /** The overlay has closed and its focus return was suppressed: put focus where it belongs. */
  'closed': []
}>()

// ClientForm's exposed API (refs are unwrapped on the component instance).
const form = useTemplateRef<{ dirty: boolean, saving: boolean, focusName: (select?: boolean) => void }>('form')
const discardOpen = ref(false)

function requestClose() {
  if (form.value?.saving) return
  if (form.value?.dirty) {
    discardOpen.value = true
    return
  }
  open.value = false
}

function onSaved(event: ClientSavedEvent) {
  open.value = false
  emit('saved', event)
}

function onChangedElsewhere() {
  open.value = false
  emit('changed-elsewhere')
}

function onOpenAutoFocus(event: Event) {
  if (props.mode === 'add') {
    event.preventDefault()
    nextTick(() => form.value?.focusName())
    return
  }
  if (!window.matchMedia('(min-width: 1024px)').matches) return
  event.preventDefault()
  nextTick(() => form.value?.focusName(true))
}

// Reka would return focus to whatever had it before (a FAB that was hidden meanwhile, a menu that closed). The host
// knows better.
function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

// Keep the sheet above the on-screen keyboard (feature 01 AC5).
useSheetKeyboard(open)
const ui = sheetUi(420)

const discardBody = computed(() => (props.mode === 'edit' && props.client
  ? CLIENT_COPY.discardEditBody(props.client.name)
  : CLIENT_COPY.discardAddBody))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="mode === 'edit' ? CLIENT_COPY.editTitle : CLIENT_COPY.addTitle"
    :dismissible="false"
    :close="false"
    :content="{ onOpenAutoFocus, onCloseAutoFocus }"
    :ui="ui"
    @close:prevent="requestClose"
  >
    <template #content>
      <ClientForm
        ref="form"
        :mode="mode"
        :client="client"
        :initial-name="initialName"
        @cancel="requestClose"
        @saved="onSaved"
        @changed-elsewhere="onChangedElsewhere"
      />
    </template>
  </UModal>

  <ConfirmDiscardDialog
    v-model:open="discardOpen"
    :title="CLIENT_COPY.discardTitle"
    :body="discardBody"
    @discard="open = false"
  />
</template>
