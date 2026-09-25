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

// ---- Keep the sheet above the on-screen keyboard (visual viewport) ----------------------------------
function setViewportVars() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement.style
  root.setProperty('--sheet-kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
  root.setProperty('--sheet-vvh', `${Math.round(vv.height)}px`)
}
function clearViewportVars() {
  const root = document.documentElement.style
  root.removeProperty('--sheet-kb')
  root.removeProperty('--sheet-vvh')
}
watch(open, (isOpen) => {
  const vv = import.meta.client ? window.visualViewport : null
  if (!vv) return
  if (isOpen) {
    setViewportVars()
    vv.addEventListener('resize', setViewportVars)
    vv.addEventListener('scroll', setViewportVars)
  }
  else {
    vv.removeEventListener('resize', setViewportVars)
    vv.removeEventListener('scroll', setViewportVars)
    clearViewportVars()
  }
})
onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.visualViewport?.removeEventListener('resize', setViewportVars)
  window.visualViewport?.removeEventListener('scroll', setViewportVars)
  clearViewportVars()
})

const sheetUi = {
  overlay: 'bg-[rgba(15,23,43,.5)] backdrop-blur-[4px]',
  content: [
    // Phone: the design's bottom sheet, lifted by the keyboard inset.
    'inset-x-0 left-0 top-auto bottom-(--sheet-kb,0px) translate-x-0 translate-y-0 w-full max-w-none',
    'rounded-t-2xl rounded-b-none ring-0 shadow-xl divide-y-0',
    'max-h-[min(88dvh,calc(var(--sheet-vvh,100dvh)-1rem))] sm:max-h-[min(88dvh,calc(var(--sheet-vvh,100dvh)-1rem))]',
    'data-[state=open]:animate-[slide-in-from-bottom_200ms_var(--ease-out)] data-[state=closed]:animate-[slide-out-to-bottom_200ms_var(--ease-out)]',
    'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
    // md+: the centred 520px dialog.
    'md:inset-x-auto md:top-1/2 md:left-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
    'md:w-[calc(100vw-2rem)] md:max-w-[520px] md:rounded-2xl md:max-h-[85vh]',
    'md:data-[state=open]:animate-[scale-in_200ms_var(--ease-out)] md:data-[state=closed]:animate-[scale-out_200ms_var(--ease-out)]',
  ].join(' '),
}

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
    :ui="sheetUi"
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
