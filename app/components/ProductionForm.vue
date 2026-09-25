<!--
  Log / Edit production: the multi-size entry form (feature 01 AC2–AC14, AC23–AC24; §2.5 layouts).
  Renders the whole sheet/dialog content (header, scrolling body, pinned footer) inside one UForm, so
  Enter on the last field submits. One line per farm size in the farm's order + one Rejects line.
  Everything is trays + loose on screen and eggs on the wire, through toProductionAmounts()/toEggs().

  Save (log) adds to the day with a submissionId made when the form opens; a retry of the SAME payload
  reuses it (the server replays instead of adding twice), a changed payload gets a new one (§3.4).
  Save (edit) replaces the day; unchanged -> just close; all zero -> ask to delete (AC24).
-->
<script setup lang="ts">
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'
import type { IsoDate, ProductionDay } from '#shared/types/api'
import { PRODUCTION_MESSAGES } from '#shared/constants/production'
import {
  createProductionFormSchema,
  createProductionFormState,
  isEmptyAmounts,
  PRODUCTION_FORM_PATHS,
  toProductionAmounts,
} from '#shared/schemas/production-form'
import type { ProductionFormMode } from '#shared/schemas/production-form'
import { formatLabelledQty } from '#shared/utils/quantity'
import { isIsoDate } from '#shared/utils/local-date'
import type { ProductionError } from '~/utils/production-errors'
import type { ProductionSavedEvent } from '~/composables/useProductionMutations'

const props = defineProps<{
  mode: ProductionFormMode
  /** Edit: the day being edited (its date is fixed). */
  editDay?: ProductionDay | null
  /** The device's local date. */
  today: IsoDate
  eggsPerTray: number
}>()

const emit = defineEmits<{
  'cancel': []
  'close': []
  'saved': [event: ProductionSavedEvent]
  'request-delete': [day: ProductionDay]
  'not-found': [date: IsoDate]
}>()

const { activeSizes, sizeById, refreshSizes } = useFarm()
const mutations = useProductionMutations()

const isEdit = computed(() => props.mode === 'edit')

// Size lines: active sizes in the farm's order; Edit also keeps any (archived) size already on the day.
const sizeLines = computed(() => {
  const ids = new Set(activeSizes.value.map(s => s.id))
  for (const g of props.editDay?.good ?? []) ids.add(g.sizeId)
  return [...ids].map(id => sizeById(id)).sort((a, b) => a.sortOrder - b.sortOrder)
})
const sizeIds = computed(() => sizeLines.value.map(s => s.id))

const state = reactive(createProductionFormState({
  date: props.editDay?.date ?? props.today,
  sizeIds: sizeIds.value,
  eggsPerTray: props.eggsPerTray,
  day: isEdit.value ? props.editDay : null,
}))
const initial = JSON.stringify(state)

const schema = computed(() => createProductionFormSchema({
  eggsPerTray: props.eggsPerTray,
  sizeIds: sizeIds.value,
  today: props.today,
  mode: props.mode,
}))

const amounts = computed(() => toProductionAmounts(state, props.eggsPerTray, sizeIds.value))

/** Log: any quantity typed (a changed date alone doesn't count). Edit: anything differs. */
const dirty = computed(() => {
  if (isEdit.value) return JSON.stringify(state) !== initial
  const typed = (q: { trays: number | null, loose: number | null }) => q.trays !== null || q.loose !== null
  return Object.values(state.lines).some(typed) || typed(state.rejects)
})

const saving = ref(false)
const formError = ref<string | null>(null)

// ---- AC8 "adds to" note --------------------------------------------------------------------------
const dateRef = toRef(state, 'date')
const noteEnabled = computed(() => !isEdit.value)
const { day: existingDay, refresh: refreshExistingDay } = useProductionDay(dateRef, noteEnabled, { maxDate: toRef(props, 'today') })

function amountLines(goodTotal: number, rejects: number): string[] {
  const lines: string[] = []
  if (goodTotal > 0) lines.push(formatLabelledQty('Good', goodTotal, props.eggsPerTray))
  if (rejects > 0) lines.push(formatLabelledQty('Rejects', rejects, props.eggsPerTray))
  return lines
}

const note = computed(() => {
  const d = existingDay.value
  if (!d || d.date !== state.date) return null
  const phrase = formatDayPhrase(d.date, props.today)
  return {
    title: PRODUCTION_COPY.addsToNote(phrase === 'today' ? 'Today' : phrase),
    body: amountLines(d.goodTotal, d.rejects).join(' · '),
  }
})

const dateHint = computed(() => (isIsoDate(state.date) ? formatDateHint(state.date, props.today) : undefined))

// ---- Live total ----------------------------------------------------------------------------------
const liveTotal = computed(() => {
  const good = amounts.value.good.reduce((n, g) => n + g.eggs, 0)
  const lines = amountLines(good, amounts.value.rejects)
  return lines.length ? lines.join(' · ') : PRODUCTION_COPY.nothingEnteredYet
})

// ---- Errors --------------------------------------------------------------------------------------
// The parts of UForm's exposed API we use (typed here to avoid a circular template-ref inference).
interface FormApi {
  errors: { id?: string, name?: string, message: string }[]
  setErrors: (errs: { name?: string, message: string }[]) => void
}
const form = useTemplateRef<FormApi>('form')
const errors = computed<FormApi['errors']>(() => form.value?.errors ?? [])

function firstError(prefix: string): string | undefined {
  return errors.value.find(e => e.name?.startsWith(prefix))?.message
}
function lineError(sizeId: string) {
  return firstError(`lines.${sizeId}.`)
}
const rejectsError = computed(() => firstError('rejects.'))
// "Enter at least one amount." clears as soon as something is entered.
const amountsError = computed<string | undefined>(() => (isEmptyAmounts(amounts.value) ? errors.value.find(e => e.name === PRODUCTION_FORM_PATHS.amounts)?.message : undefined))

const submitted = ref(false)
function onError(event: FormErrorEvent) {
  submitted.value = true
  const id = event.errors.find(e => e.id)?.id
  const el = id ? document.getElementById(id) : null
  if (el) {
    el.focus()
    el.scrollIntoView({ block: 'center' })
  }
  else if (event.errors.some(e => e.name === PRODUCTION_FORM_PATHS.amounts)) {
    focusQty(0)
  }
}

/** Server field keys -> form paths (server amounts are eggs, so a size's error marks its trays field). */
function serverFieldPath(key: string): string | null {
  if (key === 'date') return PRODUCTION_FORM_PATHS.date
  if (key === 'amounts') return PRODUCTION_FORM_PATHS.amounts
  if (key === 'rejects') return PRODUCTION_FORM_PATHS.rejects('trays')
  const m = /^good\.(.+)$/.exec(key)
  if (m && sizeIds.value.includes(m[1]!)) return PRODUCTION_FORM_PATHS.line(m[1]!, 'trays')
  return null
}

function handleFailure(error: ProductionError) {
  const failed = isEdit.value ? PRODUCTION_MESSAGES.editSaveFailed : PRODUCTION_MESSAGES.saveFailed
  if (error.kind === 'not_found' && isEdit.value) {
    emit('not-found', state.date)
    return
  }
  if (error.kind === 'stale_sizes') {
    formError.value = PRODUCTION_MESSAGES.sizesChanged
    void refreshSizes()
    return
  }
  if (error.kind === 'validation') {
    const mapped = Object.entries(error.fields ?? {})
      .map(([key, message]) => ({ name: serverFieldPath(key), message }))
      .filter((e): e is { name: string, message: string } => e.name !== null)
    if (mapped.length) {
      form.value?.setErrors(mapped)
      return
    }
  }
  formError.value = failed
}

// ---- Submit --------------------------------------------------------------------------------------
let submissionId = crypto.randomUUID()
let submissionKey: string | null = null

async function onSubmit(_event: FormSubmitEvent<unknown>) {
  if (saving.value) return
  formError.value = null
  const payload = amounts.value

  if (isEdit.value) {
    const day = props.editDay
    if (!day) return
    if (!dirty.value) return emit('close') // nothing changed: no request, no toast
    if (isEmptyAmounts(payload)) return emit('request-delete', day) // AC24
    saving.value = true
    const result = await mutations.replace(day.date, payload)
    saving.value = false
    if (!result) return
    if (result.ok) emit('saved', { kind: 'updated', day: result.data.day })
    else handleFailure(result.error)
    return
  }

  // Same payload -> same id (a retry replays); changed payload -> new intent, new id.
  const key = JSON.stringify({ date: state.date, ...payload })
  if (submissionKey !== null && submissionKey !== key) submissionId = crypto.randomUUID()
  submissionKey = key

  saving.value = true
  const result = await mutations.log({ submissionId, date: state.date, ...payload })
  saving.value = false
  if (!result) return
  if (result.ok) {
    emit('saved', { kind: result.data.hadProductionBefore ? 'added' : 'logged', day: result.data.day })
  }
  else {
    handleFailure(result.error)
    void refreshExistingDay() // if the lost attempt did land, the note shows it
  }
}

// ---- Keyboard: Enter/Next moves field to field; Enter on the last field submits --------------------
const body = useTemplateRef('body')
function qtyInputs(): HTMLInputElement[] {
  return [...(body.value?.querySelectorAll<HTMLInputElement>('input[data-qty-input]') ?? [])]
}
function focusQty(index: number) {
  const el = qtyInputs()[index]
  el?.focus()
  el?.scrollIntoView({ block: 'center' })
}
function onKeydownEnter(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (!(target instanceof HTMLInputElement) || !target.hasAttribute('data-qty-input')) return
  const inputs = qtyInputs()
  const i = inputs.indexOf(target)
  if (i >= 0 && i < inputs.length - 1) {
    event.preventDefault()
    focusQty(i + 1)
  }
}
function onFocusIn(event: FocusEvent) {
  // Keep the focused field visible above the on-screen keypad (AC5).
  const target = event.target as HTMLElement | null
  if (target instanceof HTMLInputElement && target.hasAttribute('data-qty-input') && window.matchMedia('(max-width: 1023px)').matches) {
    setTimeout(() => target.scrollIntoView({ block: 'center' }), 300)
  }
}

defineExpose({ dirty, saving, focusFirstQuantity: () => focusQty(0) })
</script>

<template>
  <UForm
    ref="form"
    :schema="schema"
    :state="state"
    :validate-on="['blur', 'change', 'input']"
    :loading-auto="false"
    :disabled="saving"
    class="flex min-h-0 flex-1 flex-col"
    @submit="onSubmit"
    @error="onError"
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2 sm:ps-5">
      <h2 class="flex-1 text-lg font-bold text-highlighted">
        {{ isEdit ? PRODUCTION_COPY.editTitle : PRODUCTION_COPY.logTitle }}
      </h2>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        aria-label="Close"
        class="size-11 justify-center lg:size-10"
        :disabled="saving"
        @click="emit('cancel')"
      />
    </div>

    <!-- Body (scrolls) -->
    <div
      ref="body"
      class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5"
      @keydown.enter="onKeydownEnter"
      @focusin="onFocusIn"
    >
      <!-- Date -->
      <div
        v-if="isEdit"
        class="flex flex-col gap-1"
      >
        <p class="text-base font-medium text-default">
          Date
        </p>
        <p class="text-base font-semibold text-highlighted">
          {{ formatDayLabel(state.date, today) }}
        </p>
        <p class="text-sm text-dimmed">
          {{ PRODUCTION_COPY.editDateHint }}
        </p>
      </div>
      <UFormField
        v-else
        label="Date"
        name="date"
        size="xl"
        :help="dateHint"
        :eager-validation="submitted"
        :ui="{ label: 'text-base', help: 'mt-1 text-sm text-dimmed' }"
      >
        <UInput
          v-model="state.date"
          type="date"
          :max="today"
          size="xl"
          class="w-full sm:w-[180px]"
        />
      </UFormField>

      <UAlert
        v-if="note"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        :title="note.title"
        :description="note.body"
      />

      <!-- Good eggs, by size -->
      <fieldset class="flex min-w-0 flex-col gap-2">
        <legend class="mb-2 text-base font-medium text-default">
          {{ PRODUCTION_COPY.goodGroup }}
        </legend>
        <!-- Column headers once (phones/tablets); desktop rows use the design's inline labels. -->
        <div
          class="grid grid-cols-[148px_148px] gap-x-3 px-3 text-sm text-dimmed lg:hidden"
          aria-hidden="true"
        >
          <span class="text-center">Trays</span>
          <span class="text-center">Loose</span>
        </div>
        <div
          v-for="size in sizeLines"
          :key="size.id"
          class="flex flex-col gap-2 rounded-md bg-muted p-3 lg:flex-row lg:items-start lg:gap-3"
        >
          <span
            class="min-w-0 text-base font-medium break-words text-default lg:w-24 lg:shrink-0 lg:pt-2"
            :title="size.name"
          >{{ size.name }}</span>
          <QuantityInput
            v-model="state.lines[size.id]!"
            :eggs-per-tray="eggsPerTray"
            :label="size.name"
            :name="`lines.${size.id}`"
            :id-prefix="`qty-${size.id}`"
            :error="lineError(size.id)"
            :disabled="saving"
            inline-labels
            class="min-w-0"
          />
        </div>
      </fieldset>

      <!-- Rejects (no size) -->
      <fieldset class="flex min-w-0 flex-col gap-2">
        <legend class="mb-2 text-base font-medium text-default">
          {{ PRODUCTION_COPY.rejectsGroup }}
        </legend>
        <div class="flex flex-col gap-2 rounded-md bg-muted p-3 lg:flex-row lg:gap-3">
          <span
            class="hidden lg:block lg:w-24 lg:shrink-0"
            aria-hidden="true"
          />
          <QuantityInput
            v-model="state.rejects"
            :eggs-per-tray="eggsPerTray"
            :label="PRODUCTION_COPY.rejectsName"
            name="rejects"
            id-prefix="qty-rejects"
            :error="rejectsError"
            :disabled="saving"
            last
            inline-labels
            class="min-w-0"
          />
        </div>
      </fieldset>
    </div>

    <!-- Footer (pinned) -->
    <div class="flex shrink-0 flex-col gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4">
      <UAlert
        v-if="amountsError || formError"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="(amountsError || formError)!"
      />
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <p
          class="text-sm text-muted lg:flex-1"
        >
          {{ liveTotal }}
        </p>
        <div class="flex gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            size="xl"
            class="justify-center lg:min-h-10"
            :label="PRODUCTION_COPY.cancel"
            :disabled="saving"
            @click="emit('cancel')"
          />
          <UButton
            type="submit"
            size="xl"
            class="flex-1 justify-center lg:flex-none lg:px-6"
            :label="PRODUCTION_COPY.save"
            :loading="saving"
            :disabled="saving"
          />
        </div>
      </div>
    </div>
  </UForm>
</template>
