<!--
  The Log / Edit production overlay (feature 01 AC1, AC5, AC14; §2.5 "Log production").
  One UModal styled by breakpoint (SSR-safe, no JS breakpoint): below md it's the design's bottom
  sheet (full width, top corners 16px, max 88dvh, slides up); at md+ a centred 520px dialog.
  This is UX's documented fallback to UDrawer (§2.5, §3.4): vaul's drawer with `dismissible: false`
  can't be swiped closed anyway, and it repositions itself around the on-screen keyboard.
  Every close (✕, Cancel, overlay tap, Esc) goes through the discard check; closing is blocked
  while saving. The sheet follows the visual viewport, so its pinned footer (Save) stays above
  the keypad on iOS as well as Android (AC5).
-->
<script setup lang="ts">
import type { IsoDate, ProductionDay } from '#shared/types/api'
import type { ProductionFormMode } from '#shared/schemas/production-form'
import type { ProductionSavedEvent } from '~/composables/useProductionMutations'

const props = defineProps<{
  mode: ProductionFormMode
  editDay?: ProductionDay | null
  today: IsoDate
  eggsPerTray: number
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'saved': [event: ProductionSavedEvent]
  'request-delete': [day: ProductionDay]
  'not-found': [date: IsoDate]
}>()

// ProductionForm's exposed API (refs are unwrapped on the component instance).
const form = useTemplateRef<{ dirty: boolean, saving: boolean, focusFirstQuantity: () => void }>('form')
const discardOpen = ref(false)

function requestClose() {
  if (form.value?.saving) return
  if (form.value?.dirty) {
    discardOpen.value = true
    return
  }
  open.value = false
}

function onSaved(event: ProductionSavedEvent) {
  open.value = false
  emit('saved', event)
}

// Desktop: focus Small trays on open. Mobile: keep reka's default (the ✕), so the keypad doesn't
// cover the form before the owner has seen it.
function onOpenAutoFocus(event: Event) {
  if (props.mode !== 'log' || !window.matchMedia('(min-width: 1024px)').matches) return
  event.preventDefault()
  nextTick(() => form.value?.focusFirstQuantity())
}

// Keep the sheet above the on-screen keyboard (AC5); the classes are shared with the Clients overlay.
useSheetKeyboard(open)
const ui = sheetUi(520)

const discardTitle = computed(() => (props.mode === 'edit' ? PRODUCTION_COPY.discardEditTitle : PRODUCTION_COPY.discardLogTitle))
const discardBody = computed(() => (props.mode === 'edit' && props.editDay
  ? PRODUCTION_COPY.discardEditBody(formatShortDate(props.editDay.date, props.today))
  : PRODUCTION_COPY.discardLogBody))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="mode === 'edit' ? PRODUCTION_COPY.editTitle : PRODUCTION_COPY.logTitle"
    :dismissible="false"
    :close="false"
    :content="{ onOpenAutoFocus }"
    :ui="ui"
    @close:prevent="requestClose"
  >
    <template #content>
      <ProductionForm
        ref="form"
        :mode="mode"
        :edit-day="editDay"
        :today="today"
        :eggs-per-tray="eggsPerTray"
        @cancel="requestClose"
        @close="open = false"
        @saved="onSaved"
        @request-delete="(day: ProductionDay) => emit('request-delete', day)"
        @not-found="(date: IsoDate) => { open = false; emit('not-found', date) }"
      />
    </template>
  </UModal>

  <ConfirmDiscardDialog
    v-model:open="discardOpen"
    :title="discardTitle"
    :body="discardBody"
    @discard="open = false"
  />
</template>
