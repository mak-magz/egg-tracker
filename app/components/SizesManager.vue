<!--
  Settings > Sizes (feature 02 §2.5, §3.4). The Sizes card (active sizes: rows with ↑ ↓ ⋮, an Add size button
  or the inline form) plus the Archived card and the archive dialog. It owns useSizeMutations, so one
  in-flight change covers everything on the screen (AC18): the pressed control spins, every other control is
  disabled, and the cards are aria-busy. Every change is its own request; the list only updates when the
  server says yes (applied to the farm context, so the Production form, day cards and chart follow at once).

  Where messages go (R2): name problems on the field; failed add/rename in the form's alert; failed move or
  restore and "changed somewhere else" (AC20) in the alert at the top of the card; a failed archive in the
  dialog. Toasts only confirm success. Focus rules follow §2.5 "Accessibility".
-->
<script setup lang="ts">
import type { FarmSize, SizeNameMatch } from '#shared/types/api'
import { SIZE_MESSAGES } from '#shared/constants/sizes'
import type { SizeError } from '~/utils/size-errors'
import type { MoveDirection } from '~/utils/size-order'
import type { SizeNameProblem } from '~/components/SizeNameForm.vue'

const toast = useToast()
const { sizes, activeSizes, archivedSizes, refreshSizes } = useFarm()
const mutations = useSizeMutations()
const pending = mutations.pending
const busy = computed(() => pending.value !== null)

// ---- Load states (AC21, AC22) ---------------------------------------------------------------------
// The list normally comes with /api/me, so the first paint has it. Loading (no list yet) shows skeletons,
// never an empty list; a failed load, or a load that still has no active size (never expected: AC22), shows
// the failure card. A quiet refresh that fails while a list is showing changes nothing on screen.
const loading = ref(false)
const loadFailed = ref(false)
const hasList = computed(() => activeSizes.value.length > 0)
const showSkeleton = computed(() => !hasList.value && !loadFailed.value)
const showLoadError = computed(() => !hasList.value && loadFailed.value)

async function load() {
  loading.value = true
  await refreshSizes()
  loading.value = false
  loadFailed.value = !hasList.value
}
onMounted(load)

// ---- Notice at the top of the card (failed move/restore, AC20) ------------------------------------
const notice = ref<{ kind: 'error' | 'info', message: string } | null>(null)
function showConflict() {
  notice.value = { kind: 'info', message: SIZE_MESSAGES.changedElsewhere }
}

// ---- Highlight, focus, scroll -----------------------------------------------------------------------
const highlightedId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
function flash(id: string) {
  clearTimeout(highlightTimer)
  highlightedId.value = null
  void nextTick(() => {
    highlightedId.value = id
    highlightTimer = setTimeout(() => {
      highlightedId.value = null
    }, 1600)
  })
}
onBeforeUnmount(() => clearTimeout(highlightTimer))

function reducedMotion(): boolean {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Puts focus on a control (data-size-focus) once the list has re-rendered; the first key that can take it wins. */
async function focusControl(...keys: string[]) {
  await nextTick()
  for (const key of keys) {
    const el = document.querySelector<HTMLElement>(`[data-size-focus="${key}"]`)
    if (el && !(el as HTMLButtonElement).disabled) {
      el.focus({ preventScroll: true })
      return
    }
  }
}

async function reveal(id: string) {
  await nextTick()
  document.querySelector(`[data-size-row="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
}

function sizeName(id: string): string {
  return sizes.value.find(s => s.id === id)?.name ?? ''
}

/** The changed size's name as the server saved it (normalised), falling back to what was typed. */
function savedName(list: readonly FarmSize[], id: string, fallback: string): string {
  return list.find(s => s.id === id)?.name ?? fallback
}

// ---- The inline form (Add / Rename) ---------------------------------------------------------------
const formMode = ref<{ kind: 'add' } | { kind: 'rename', id: string } | null>(null)
const formError = ref<string | null>(null)
const formName = ref<SizeNameProblem | null>(null)
const restoringFromForm = ref(false)
const renamingId = computed(() => (formMode.value?.kind === 'rename' ? formMode.value.id : null))
const formSaving = computed(() => pending.value?.action === 'add' || pending.value?.action === 'rename')

function resetFormMessages() {
  formError.value = null
  formName.value = null
}

function openAdd() {
  mutations.resetAdd() // a fresh submission id for this opening (retry rule)
  resetFormMessages()
  formMode.value = { kind: 'add' }
}

function openRename(id: string) {
  resetFormMessages()
  formMode.value = { kind: 'rename', id }
}

function closeForm(focusKey?: string) {
  formMode.value = null
  resetFormMessages()
  if (focusKey) void focusControl(focusKey)
}

// A row that was being renamed can vanish when the list refreshes (archived on another phone).
watch(activeSizes, (list) => {
  const id = renamingId.value
  if (id && !list.some(s => s.id === id)) closeForm()
})

function nameProblemFrom(error: SizeError): SizeNameProblem | null {
  const existing: SizeNameMatch | undefined = error.existing
  if (existing) {
    return {
      message: existing.archived ? SIZE_MESSAGES.nameArchived(existing.name) : SIZE_MESSAGES.nameTaken(existing.name),
      existing,
    }
  }
  return error.message ? { message: error.message } : null
}

/** A failed add/rename: the typed name stays; each kind goes where R2 says. */
function onFormFailure(error: SizeError) {
  if (error.kind === 'name_invalid' || error.kind === 'name_taken') {
    const problem = nameProblemFrom(error)
    if (problem) {
      formName.value = problem
      return
    }
  }
  if (error.kind === 'stale') {
    closeForm()
    showConflict()
    return
  }
  formError.value = SIZE_COPY.saveFailed
}

async function submitForm(rawName: string, defaultPrice?: number | null) {
  const mode = formMode.value
  if (!mode) return
  resetFormMessages()

  if (mode.kind === 'add') {
    const res = await mutations.add(rawName, defaultPrice)
    if (!res) return
    if (!res.ok) return onFormFailure(res.error)
    notice.value = null
    const name = savedName(res.data.sizes, res.data.changedId, rawName)
    toast.add({ title: SIZE_COPY.toastAdded(name), icon: 'i-lucide-check' })
    closeForm('add')
    flash(res.data.changedId)
    void reveal(res.data.changedId)
    return
  }

  const oldName = sizeName(mode.id)
  const res = await mutations.rename(mode.id, rawName, defaultPrice)
  if (!res) return
  if (!res.ok) return onFormFailure(res.error)
  notice.value = null
  const newName = savedName(res.data.sizes, res.data.changedId, rawName)
  const toastTitle = oldName !== newName
    ? SIZE_COPY.toastRenamed(oldName, newName)
    : SIZE_COPY.toastUpdated(newName)
  toast.add({ title: toastTitle, icon: 'i-lucide-check' })
  closeForm(`menu:${mode.id}`)
  flash(mode.id)
}

function cancelForm() {
  const mode = formMode.value
  closeForm(mode?.kind === 'rename' ? `menu:${mode.id}` : 'add')
}

// ---- Move (AC8–AC10) ------------------------------------------------------------------------------
const movingDirection = ref<MoveDirection | null>(null)
function movingOf(id: string): MoveDirection | null {
  return pending.value?.action === 'move' && pending.value.sizeId === id ? movingDirection.value : null
}

async function move(size: FarmSize, direction: MoveDirection) {
  const order = moveInOrder(activeSizes.value.map(s => s.id), size.id, direction)
  if (!order) return // the first ↑ and the last ↓ do nothing (AC10)
  movingDirection.value = direction
  const res = await mutations.move(size.id, order)
  movingDirection.value = null
  if (!res) return
  if (!res.ok) {
    if (res.error.kind === 'stale') showConflict()
    else notice.value = { kind: 'error', message: SIZE_COPY.moveFailed(size.name) }
    return
  }
  notice.value = null
  const name = savedName(res.data.sizes, size.id, size.name)
  toast.add({ title: direction === 'up' ? SIZE_COPY.toastMovedUp(name) : SIZE_COPY.toastMovedDown(name), icon: 'i-lucide-check' })
  flash(size.id)
  // Focus stays on the same button of the moved row, so repeated taps keep moving it; at an end that
  // button is disabled, so it falls back to the other one.
  void focusControl(`${direction}:${size.id}`, `${direction === 'up' ? 'down' : 'up'}:${size.id}`)
  void reveal(size.id)
}

// ---- Archive (AC11, AC12, AC14) -------------------------------------------------------------------
const archiveOpen = ref(false)
const archiveTarget = ref<FarmSize | null>(null)
const archiveError = ref<string | null>(null)
const archiving = computed(() => pending.value?.action === 'archive')
let archived = false

function openArchive(size: FarmSize) {
  archiveTarget.value = size
  archiveError.value = null
  archived = false
  archiveOpen.value = true
}

// Closing without archiving (Cancel, Esc, overlay) puts focus back on the ⋮ that opened it. The dropdown
// that opened the dialog has already unmounted, so the dialog's own focus return can't be relied on.
watch(archiveOpen, (isOpen) => {
  const target = archiveTarget.value
  if (isOpen || archived || !target) return
  setTimeout(() => void focusControl(`menu:${target.id}`), 60)
})

async function confirmArchive() {
  const target = archiveTarget.value
  if (!target) return
  archiveError.value = null
  const index = activeSizes.value.findIndex(s => s.id === target.id)
  const res = await mutations.archive(target.id)
  if (!res) return
  if (res.ok) {
    archived = true
    archiveOpen.value = false
    notice.value = null
    toast.add({ title: SIZE_COPY.toastArchived(target.name), icon: 'i-lucide-check' })
    flash(target.id)
    // Focus goes to the row that took its place, or the Add size button if it was the last.
    const next = activeSizes.value[index]
    void focusControl(next ? `menu:${next.id}` : 'add')
    return
  }
  switch (res.error.kind) {
    case 'last_active':
      archiveError.value = SIZE_MESSAGES.lastActive // the dialog stays; the list refreshed itself
      break
    case 'stale':
      archived = true // the list is already up to date; focus lands on the Add button
      archiveOpen.value = false
      showConflict()
      void focusControl('add')
      break
    default:
      archiveError.value = SIZE_COPY.archiveFailed
  }
}

// ---- Restore (AC16) ---------------------------------------------------------------------------------
async function restore(id: string, fromForm = false) {
  const name = fromForm ? (formName.value?.existing?.name ?? sizeName(id)) : sizeName(id)
  restoringFromForm.value = fromForm
  const res = await mutations.restore(id)
  restoringFromForm.value = false
  if (!res) return
  if (!res.ok) {
    if (res.error.kind === 'stale') {
      if (fromForm) closeForm()
      showConflict()
    }
    else {
      notice.value = { kind: 'error', message: SIZE_COPY.restoreFailed(name) }
    }
    return
  }
  notice.value = null
  const restored = savedName(res.data.sizes, id, name)
  toast.add({ title: SIZE_COPY.toastRestored(restored), icon: 'i-lucide-check' })
  if (fromForm) closeForm()
  flash(id)
  void focusControl(`menu:${id}`)
  void reveal(id)
}

// ---- Load failure retry ------------------------------------------------------------------------------
const retrying = computed(() => loading.value && showLoadError.value)
</script>

<template>
  <div class="flex flex-col gap-4">
    <SettingsSection
      :title="SIZE_COPY.sizesTitle"
      :help="SIZE_COPY.sizesHelp"
      :busy="busy || showSkeleton"
    >
      <!-- Failed move/restore, or the list changed elsewhere (AC19, AC20). Cleared by the next success. -->
      <UAlert
        v-if="notice"
        role="alert"
        :color="notice.kind === 'error' ? 'error' : 'neutral'"
        variant="subtle"
        :icon="notice.kind === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-info'"
        :title="notice.message"
        :close="{ class: 'size-11 justify-center' }"
        @update:open="notice = null"
      />

      <!-- Loading (AC21): never an empty list -->
      <div
        v-if="showSkeleton"
        class="flex flex-col gap-2"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-14 w-full rounded-md"
        />
      </div>

      <!-- Load failure (AC21) -->
      <div
        v-else-if="showLoadError"
        role="alert"
        class="flex flex-col items-center gap-3 px-2 py-6 text-center"
      >
        <span class="flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
          <UIcon
            name="i-lucide-cloud-off"
            class="size-8"
          />
        </span>
        <h3 class="text-lg font-semibold text-highlighted">
          {{ SIZE_COPY.loadFailedTitle }}
        </h3>
        <p class="text-base text-muted">
          {{ SIZE_COPY.loadFailedBody }}
        </p>
        <UButton
          size="xl"
          icon="i-lucide-refresh-cw"
          class="w-full justify-center sm:w-auto"
          :label="SIZE_COPY.tryAgain"
          :loading="retrying"
          @click="load"
        />
      </div>

      <template v-else>
        <ul
          role="list"
          class="flex flex-col gap-2"
        >
          <SizeRow
            v-for="(size, i) in activeSizes"
            :key="size.id"
            :size="size"
            :first="i === 0"
            :last="i === activeSizes.length - 1"
            :can-archive="canArchive(activeSizes.length)"
            :busy="busy"
            :moving="movingOf(size.id)"
            :highlighted="highlightedId === size.id"
            :renaming="renamingId === size.id"
            @move="(dir: MoveDirection) => move(size, dir)"
            @edit="openRename(size.id)"
            @rename="openRename(size.id)"
            @archive="openArchive(size)"
          >
            <template #form>
              <SizeNameForm
                mode="edit"
                :sizes="sizes"
                :self-id="size.id"
                :initial-name="size.name"
                :initial-price="size.defaultPrice"
                :saving="formSaving"
                :error="formError"
                :server-name="formName"
                :restoring="restoringFromForm"
                :disabled="busy && !formSaving"
                @submit="submitForm"
                @cancel="cancelForm"
                @restore="(id: string) => restore(id, true)"
              />
            </template>
          </SizeRow>
        </ul>

        <!-- The reason Archive is unavailable, on screen without opening the menu (AC14). Text + icon. -->
        <p
          v-if="activeSizes.length === 1 && activeSizes[0]"
          class="flex items-start gap-2 text-sm text-muted"
        >
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ SIZE_COPY.lastSizeLine(activeSizes[0].name) }}</span>
        </p>

        <SizeNameForm
          v-if="formMode?.kind === 'add'"
          mode="add"
          :sizes="sizes"
          :saving="formSaving"
          :error="formError"
          :server-name="formName"
          :restoring="restoringFromForm"
          :disabled="busy && !formSaving"
          @submit="submitForm"
          @cancel="cancelForm"
          @restore="(id: string) => restore(id, true)"
        />
        <UButton
          v-else
          color="neutral"
          variant="outline"
          size="xl"
          icon="i-lucide-plus"
          data-size-focus="add"
          class="w-full justify-center lg:w-auto lg:self-start lg:min-h-10"
          :label="SIZE_COPY.addSize"
          :disabled="busy"
          @click="openAdd"
        />
      </template>
    </SettingsSection>

    <!-- Only when something is archived: no empty group (AC15) -->
    <ArchivedSizesCard
      v-if="archivedSizes.length"
      :sizes="archivedSizes"
      :pending="pending"
      :highlighted-id="highlightedId"
      @restore="(id: string) => restore(id)"
    />

    <ArchiveSizeDialog
      v-model:open="archiveOpen"
      :name="archiveTarget?.name ?? ''"
      :saving="archiving"
      :error="archiveError"
      @confirm="confirmArchive"
    />
  </div>
</template>
