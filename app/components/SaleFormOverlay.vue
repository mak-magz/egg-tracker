<!--
  The Log / Edit sale overlay (feature 04 §2.5 "Log a sale: mobile bottom sheet" / "desktop dialog", AC12,
  AC32, AC40): a thin host for SaleForm, exactly like ClientFormOverlay/ProductionFormOverlay. One UModal
  styled by breakpoint (SSR-safe, no JS breakpoint): below md the design's bottom sheet, lifted above the
  keypad; at md+ a centred 640px dialog (UX S1: a line needs size + qty + price + total in view). Every
  close (X, Cancel, overlay tap, Esc) goes through the discard check and is blocked while saving. Not
  swipe-to-close (feature 01's own reasoning: a drawer that could be swiped would still need the discard
  check, and vaul can't run it).
-->
<script setup lang="ts">
import type { IsoDate, Sale } from '#shared/types/api'
import { SALE_COPY } from '~/utils/sale-copy'
import type { SaleSavedEvent } from '~/components/SaleForm.vue'

const props = defineProps<{
  mode: 'add' | 'edit'
  sale?: Sale | null
  today: IsoDate
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'saved': [event: SaleSavedEvent]
  'changed-elsewhere': []
  /** The overlay has closed and its focus return was suppressed: put focus where it belongs. */
  'closed': []
}>()

const form = useTemplateRef<{ dirty: boolean, saving: boolean, focusFirstProblem: () => void }>('form')
const discardOpen = ref(false)

function requestClose() {
  if (form.value?.saving) return
  if (form.value?.dirty) {
    discardOpen.value = true
    return
  }
  open.value = false
}

function onSaved(event: SaleSavedEvent) {
  open.value = false
  emit('saved', event)
}

function onChangedElsewhere() {
  open.value = false
  emit('changed-elsewhere')
}

function onOpenAutoFocus(_event: Event) {
  // Always let the modal auto-focus its first focusable field. Edit-on-desktop used to call
  // event.preventDefault() here on the assumption that "the Client field takes focus itself" — nothing
  // actually did, so focus stayed on the row menu's (now aria-hidden) trigger button when opened from a
  // row's ⋮ menu, which is exactly the "Blocked aria-hidden on an element because its descendant retained
  // focus" browser warning. Add and mobile-Edit never suppressed this and never hit the bug.
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  emit('closed')
}

useSheetKeyboard(open)
const ui = sheetUi(640)

const discardBody = computed(() => (props.mode === 'edit' && props.sale
  ? SALE_COPY.discardEditBody(props.sale.saleNumber)
  : SALE_COPY.discardLogBody))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="mode === 'edit' && sale ? SALE_COPY.editTitle(sale.saleNumber) : SALE_COPY.logTitle"
    :dismissible="false"
    :close="false"
    :content="{ onOpenAutoFocus, onCloseAutoFocus }"
    :ui="ui"
    @close:prevent="requestClose"
  >
    <template #content>
      <SaleForm
        ref="form"
        :mode="mode"
        :sale="sale"
        :today="today"
        @cancel="requestClose"
        @saved="onSaved"
        @changed-elsewhere="onChangedElsewhere"
      />
    </template>
  </UModal>

  <ConfirmDiscardDialog
    v-model:open="discardOpen"
    :title="SALE_COPY.discardTitle"
    :body="discardBody"
    @discard="open = false"
  />
</template>
