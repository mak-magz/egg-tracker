<!--
  Production (feature 01). Design: docs/design/source/template.html (Production screen, Log production
  form); UX: docs/features/01-production-logging.md §2.5; technical design §3.4.
  Filters -> trend chart -> day cards, newest first. The top-bar "Add production" button (md+) and the
  FAB (<md) come from the layout via `primaryAction`. Data is fetched on the client only (the range
  depends on the device's date), so SSR renders the loading state.
-->
<script setup lang="ts">
import type { IsoDate, ProductionDay } from '#shared/types/api'
import type { ProductionFormMode } from '#shared/schemas/production-form'
import type { ProductionSavedEvent } from '~/composables/useProductionMutations'

definePageMeta({
  primaryAction: { label: 'Add production', ariaLabel: 'Log production', icon: 'i-lucide-plus', fab: true },
})

const { eggsPerTray } = useFarm()
const list = useProductionDays()
const toast = useToast()
const primary = usePrimaryAction()

const today = computed(() => list.today.value)

// ---- Overlays -------------------------------------------------------------------------------------
const formOpen = ref(false)
const formMode = ref<ProductionFormMode>('log')
const editDay = ref<ProductionDay | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<ProductionDay | null>(null)
const deleteFromEdit = ref(false)

// The FAB hides while the sheet or a dialog is open (§2.5 Layouts).
watch([formOpen, deleteOpen], ([f, d]) => {
  primary.hidden.value = f || d
})

function openLog() {
  if (formOpen.value) return
  list.syncToday() // the form's default date, max and future check use today (QA S1)
  formMode.value = 'log'
  editDay.value = null
  formOpen.value = true
}
primary.onPrimaryAction(openLog)

function openEdit(day: ProductionDay) {
  list.syncToday()
  formMode.value = 'edit'
  editDay.value = day
  formOpen.value = true
}

function openDelete(day: ProductionDay, fromEdit = false) {
  deleteTarget.value = day
  deleteFromEdit.value = fromEdit
  deleteOpen.value = true
}

// ---- Cards: expand, reveal, highlight ------------------------------------------------------------
const expanded = ref(new Set<IsoDate>())
const highlighted = ref<IsoDate | null>(null)
const cardRefs = new Map<IsoDate, { focus: () => void }>()

function setCardRef(date: IsoDate, el: unknown) {
  if (el) cardRefs.set(date, el as { focus: () => void })
  else cardRefs.delete(date)
}

function toggle(date: IsoDate) {
  const next = new Set(expanded.value)
  if (next.has(date)) next.delete(date)
  else next.add(date)
  expanded.value = next
}

// Today's card starts expanded (older ones collapsed).
const stopInitialExpand = watch(() => list.status.value, (s) => {
  if (s === 'ready') {
    expanded.value = new Set([...expanded.value, today.value])
    stopInitialExpand()
  }
})

const pendingReveal = ref<IsoDate | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined

function tryReveal() {
  const date = pendingReveal.value
  if (!date || !list.days.value.some(d => d.date === date)) return
  pendingReveal.value = null
  expanded.value = new Set([...expanded.value, date])
  highlighted.value = date
  clearTimeout(highlightTimer)
  // Let the tint paint, then fade it out over 1.5s (the card's transition).
  highlightTimer = setTimeout(() => {
    highlighted.value = null
  }, 150)
  nextTick(() => {
    document.querySelector(`[data-day="${date}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
watch(() => list.days.value, () => nextTick(tryReveal))
onBeforeUnmount(() => clearTimeout(highlightTimer))

// ---- After mutations ------------------------------------------------------------------------------
function phrase(date: IsoDate) {
  return formatDayPhrase(date, today.value)
}

function onSaved({ kind, day }: ProductionSavedEvent) {
  const p = phrase(day.date)
  const title = kind === 'updated' ? PRODUCTION_COPY.toastUpdated(p) : kind === 'added' ? PRODUCTION_COPY.toastAdded(p) : PRODUCTION_COPY.toastLogged(p)
  toast.add({ title, icon: 'i-lucide-check' })
  pendingReveal.value = day.date
  if (list.dateInView(day.date)) {
    list.upsertDay(day)
  }
  else {
    // Q1: switch the range to that date so the saved card is visible; Clear returns to the chip.
    list.upsertDay(day)
    list.showDate(day.date)
  }
  nextTick(tryReveal)
}

function onDeleted(removed: ProductionDay) {
  const index = list.days.value.findIndex(d => d.date === removed.date)
  formOpen.value = false // AC24: the delete came from Edit
  list.removeDay(removed.date)
  toast.add({ title: PRODUCTION_COPY.toastDeleted(phrase(removed.date)), icon: 'i-lucide-check' })
  // Focus moves to the next card (or the previous one when it was the last); after the dialog's own
  // focus return, which targets the removed card's ⋮.
  setTimeout(() => {
    const next = list.days.value[Math.min(index, list.days.value.length - 1)]
    if (next) cardRefs.get(next.date)?.focus()
    else emptyAction.value?.$el?.focus?.()
  }, 250)
}

function onNotFound(date: IsoDate) {
  formOpen.value = false
  list.removeDay(date)
  toast.add({ title: PRODUCTION_COPY.toastAlreadyDeleted, icon: 'i-lucide-info' })
  void list.reload({ silent: true })
}

// A refetch failed while content was showing: keep it, offer Try again (AC30).
watch(() => list.refreshFailed.value, () => {
  toast.add({
    title: PRODUCTION_COPY.toastRefreshFailed,
    color: 'error',
    icon: 'i-lucide-cloud-off',
    actions: [{ label: PRODUCTION_COPY.tryAgain, color: 'neutral', variant: 'outline', onClick: () => void list.reload() }],
  })
})

// ---- States ---------------------------------------------------------------------------------------
const retrying = ref(false)
async function retry() {
  retrying.value = true
  await list.reload()
  retrying.value = false
}

const emptyAction = useTemplateRef<{ $el?: HTMLElement }>('emptyAction')
const showContent = computed(() => (list.status.value === 'ready' || list.status.value === 'refreshing') && list.hasAny.value)
const firstUse = computed(() => list.status.value === 'ready' && !list.hasAny.value)
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Load failure (AC30) -->
    <AppPlaceholder
      v-if="list.status.value === 'error'"
      icon="i-lucide-cloud-off"
      :title="PRODUCTION_COPY.loadFailedTitle"
      :body="PRODUCTION_COPY.loadFailedBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-refresh-cw"
        :label="PRODUCTION_COPY.tryAgain"
        :loading="retrying"
        class="w-full justify-center sm:w-auto"
        @click="retry"
      />
    </AppPlaceholder>

    <!-- First use (AC27) -->
    <AppPlaceholder
      v-else-if="firstUse"
      icon="i-lucide-clipboard"
      :title="PRODUCTION_COPY.firstUseTitle"
      :body="PRODUCTION_COPY.firstUseBody"
    >
      <UButton
        ref="emptyAction"
        size="xl"
        icon="i-lucide-plus"
        :label="PRODUCTION_COPY.fabLabel"
        class="w-full justify-center sm:w-auto"
        @click="openLog"
      />
    </AppPlaceholder>

    <template v-else>
      <ProductionFilters
        v-model:from="list.from.value"
        v-model:to="list.to.value"
        :chip="list.chip.value"
        :range-active="list.rangeActive.value"
        :range-error="list.rangeError.value"
        :today="today"
        :disabled="list.status.value === 'loading'"
        @select-chip="list.selectChip"
        @clear="list.clearDates"
      />

      <!-- Loading (AC29): skeletons, never the empty state -->
      <template v-if="list.status.value === 'loading'">
        <USkeleton class="h-[206px] w-full rounded-2xl" />
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-16 w-full rounded-2xl"
        />
      </template>

      <template v-else-if="showContent && eggsPerTray">
        <ProductionTrendChart
          :days="list.days.value"
          :today="today"
          :eggs-per-tray="eggsPerTray"
          :from="list.applied.value.from"
          :to="list.applied.value.to"
          :refreshing="list.status.value === 'refreshing'"
        />

        <div
          v-if="list.days.value.length"
          class="flex flex-col gap-3"
        >
          <ProductionDayCard
            v-for="day in list.days.value"
            :key="day.date"
            :ref="(el: unknown) => setCardRef(day.date, el)"
            :day="day"
            :today="today"
            :eggs-per-tray="eggsPerTray"
            :expanded="expanded.has(day.date)"
            :highlighted="highlighted === day.date"
            @toggle="toggle(day.date)"
            @edit="openEdit(day)"
            @delete="openDelete(day)"
          />
        </div>

        <!-- Empty range (AC28) -->
        <div
          v-else
          class="flex flex-col items-center gap-3 p-10 text-center"
        >
          <p class="text-base text-muted">
            {{ PRODUCTION_COPY.emptyRange }}
          </p>
          <UButton
            v-if="list.rangeActive.value"
            color="neutral"
            variant="ghost"
            size="xl"
            :label="PRODUCTION_COPY.clearDates"
            @click="list.clearDates"
          />
          <UButton
            v-else-if="list.chip.value === 'week'"
            color="neutral"
            variant="ghost"
            size="xl"
            :label="PRODUCTION_COPY.showLast30"
            @click="list.selectChip('month')"
          />
        </div>
      </template>
    </template>

    <template v-if="eggsPerTray">
      <ProductionFormOverlay
        v-model:open="formOpen"
        :mode="formMode"
        :edit-day="editDay"
        :today="today"
        :eggs-per-tray="eggsPerTray"
        @saved="onSaved"
        @request-delete="(day: ProductionDay) => openDelete(day, true)"
        @not-found="onNotFound"
      />
      <ProductionDeleteDialog
        v-model:open="deleteOpen"
        :day="deleteTarget"
        :from-edit="deleteFromEdit"
        :today="today"
        :eggs-per-tray="eggsPerTray"
        @deleted="onDeleted"
        @not-found="onNotFound"
      />
    </template>
  </div>
</template>
