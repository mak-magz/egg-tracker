<!--
  Clients (feature 03). Design: docs/design/source/template.html (Clients screen, Add client dialog); UX:
  docs/features/03-clients.md §2.5; technical design §3.4.
  Search + status filter -> the list (table when wide, cards when narrow). The top-bar "Add client" button (md+) and the
  FAB (<md) come from the layout via `primaryAction`. The list is fetched on the client after mount (personal data:
  it is never rendered on the server, so SSR renders the loading state), lives in memory only (useClients), and
  the search text and status filter are page-local refs that never touch the URL (AC30).
  A change is applied to the list only when the server says yes (UX R1). Marking a client inactive / active needs no
  confirmation. There is no delete anywhere (AC21).
-->
<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { Client } from '#shared/types/api'
import { clientMatchesFilters, filterClients } from '#shared/utils/client-list'
import type { ClientStatusFilter } from '#shared/utils/client-list'
import { CLIENT_MESSAGES } from '#shared/constants/clients'
import type { ClientSavedEvent } from '~/components/ClientForm.vue'

definePageMeta({
  // The subtitle is the client count, known only after the list loads: see utils/shell-subtitle.ts.
  ownSubtitle: true,
  primaryAction: { label: 'Add client', ariaLabel: 'Add client', icon: 'i-lucide-plus', fab: true },
})

const toast = useToast()
const primary = usePrimaryAction()
const list = useClients()
const mutations = useClientMutations()
const { setSubtitle } = useShellSubtitle()

// ---- Subtitle: "5 customers" (all clients, active and inactive; filters never change it: AC1, AC6) ----
// `null` while the list loads, so it never says "0 customers" for a farm that has clients.
setSubtitle(null)
watchEffect(() => setSubtitle(list.hasList.value ? CLIENT_COPY.subtitle(list.count.value) : null))

// ---- Search and status filter (memory only: AC30) ------------------------------------------------------
const search = ref('')
const status = ref<ClientStatusFilter>('all')
const filters = computed(() => ({ search: search.value, status: status.value }))
const filtering = computed(() => search.value.trim() !== '' || status.value !== 'all')
const visible = computed(() => filterClients(list.sorted.value, filters.value))

const toolbar = useTemplateRef<{ focusSearch: () => void }>('toolbar')
const listView = useTemplateRef<{ ensureRendered: (id: string) => Promise<void> }>('listView')

function clearFilters() {
  search.value = ''
  status.value = 'all'
  toolbar.value?.focusSearch()
}

// A polite live region tells a screen-reader user what the search did, once typing pauses (about 500ms).
const liveText = ref('')
const announce = useDebounceFn(() => {
  liveText.value = CLIENT_COPY.liveCount(visible.value.length)
}, 500)
watch(filters, () => {
  if (list.hasList.value) void announce()
})

// ---- Load states (AC22, AC23) ----------------------------------------------------------------------------
// Never the empty state while loading. A failed quiet refresh keeps the list and toasts.
const loadFailed = computed(() => list.status.value === 'error')
const loading = computed(() => !list.hasList.value && !loadFailed.value)
const firstUse = computed(() => list.hasList.value && list.count.value === 0)
const noMatch = computed(() => list.hasList.value && list.count.value > 0 && visible.value.length === 0)
const noMatchNote = computed(() => {
  if (search.value.trim() !== '') return null
  if (status.value === 'inactive') return CLIENT_COPY.noMatchInactive
  if (status.value === 'active') return CLIENT_COPY.noMatchActive
  return null
})

onMounted(() => {
  // A visit with a known list shows it at once and refreshes quietly.
  void list.load({ silent: list.hasList.value })
})

watch(() => list.refreshFailed.value, (now, before) => {
  if (now > before) {
    toast.add({
      id: 'clients-refresh-failed',
      title: CLIENT_COPY.refreshFailed,
      color: 'error',
      icon: 'i-lucide-cloud-off',
      duration: 0,
      close: { class: 'size-11 justify-center' },
      actions: [{ label: CLIENT_COPY.tryAgain, color: 'neutral', variant: 'outline', size: 'lg', class: 'min-h-11', onClick: () => void list.load() }],
    })
  }
})

const retrying = ref(false)
async function retry() {
  retrying.value = true
  await list.load()
  retrying.value = false
  // Focus moves to the first row once the list appears (UX "Accessibility").
  await nextTick()
  document.querySelector<HTMLElement>('[data-client-focus^="name:"]')?.focus()
}

// ---- Highlight, scroll, focus ---------------------------------------------------------------------------
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

async function reveal(id: string) {
  // The list draws rows in steps: make sure this one is in the DOM before scrolling to it.
  await listView.value?.ensureRendered(id)
  await nextTick()
  document.querySelector(`[data-client-row="${id}"]`)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
}

/** Focus a control (`data-client-focus`) once the list has re-rendered; the first key that can take it wins. */
async function focusControl(...keys: string[]) {
  await nextTick()
  for (const key of keys) {
    const el = document.querySelector<HTMLElement>(`[data-client-focus="${key}"]`)
    if (el && !(el as HTMLButtonElement).disabled) {
      el.focus({ preventScroll: true })
      return
    }
  }
}

/** The client just saved is on screen, at its A to Z place (AC14): clear a search or filter that would hide it. */
function showSaved(client: Client) {
  if (!clientMatchesFilters(client, filters.value)) {
    search.value = ''
    status.value = 'all'
  }
  flash(client.id)
  void reveal(client.id)
}

// ---- The Add / Edit overlay ---------------------------------------------------------------------------
type Opener = { kind: 'primary' } | { kind: 'empty' } | { kind: 'row', id: string }
const formOpen = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const editClient = ref<Client | null>(null)
let opener: Opener = { kind: 'primary' }

// The FAB hides while the sheet is open (UX "Layouts").
watch(formOpen, (isOpen) => {
  primary.hidden.value = isOpen
})

function openAdd(from: Opener = { kind: 'primary' }) {
  if (formOpen.value) return
  opener = from
  formMode.value = 'add'
  editClient.value = null
  formOpen.value = true
}
primary.onPrimaryAction(() => openAdd({ kind: 'primary' }))

function openEdit(client: Client) {
  if (formOpen.value) return
  opener = { kind: 'row', id: client.id }
  formMode.value = 'edit'
  editClient.value = { ...client }
  formOpen.value = true
}

/** After the overlay closes, focus goes back to what opened it (the FAB may have been hidden meanwhile). */
async function onFormClosed() {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  if (opener.kind === 'row') return focusControl(`name:${opener.id}`, `menu:${opener.id}`, 'search')
  if (opener.kind === 'empty') {
    // The empty card is replaced by the list after the first save: fall back to the top-bar / FAB button.
    const card = document.querySelector<HTMLElement>('[data-client-focus="empty-add"]')
    if (card) return card.focus({ preventScroll: true })
  }
  const visibleButton = [...document.querySelectorAll<HTMLElement>('[data-primary-action]')].find(el => el.getClientRects().length > 0)
  if (visibleButton) visibleButton.focus({ preventScroll: true })
  else await focusControl('search')
}

function onSaved({ kind, client }: ClientSavedEvent) {
  if (kind === 'unchanged') return // nothing changed: no request, no toast (AC18)
  const title = kind === 'added'
    ? CLIENT_COPY.toastAdded(client.name)
    : kind === 'updated' ? CLIENT_COPY.toastUpdated(client.name) : CLIENT_COPY.toastMarkedActive(client.name)
  toast.add({ title, icon: 'i-lucide-check' })
  showSaved(client)
}

/** AC19: the client changed elsewhere. The mutations already refreshed the list; typed edits are dropped. */
function onChangedElsewhere() {
  errorToast('clients-changed', CLIENT_MESSAGES.changedElsewhere)
}

/** An error toast that stays until dismissed (UX R2): the owner may be far down a long list, and the row itself still tells the truth. */
function errorToast(id: string, title: string, retry?: () => void) {
  toast.add({
    id,
    title,
    color: 'error',
    icon: 'i-lucide-circle-alert',
    duration: 0,
    close: { class: 'size-11 justify-center' },
    actions: retry
      ? [{
          label: CLIENT_COPY.tryAgain,
          color: 'neutral',
          variant: 'outline',
          size: 'lg',
          class: 'min-h-11',
          onClick: () => {
            toast.remove(id)
            retry()
          },
        }]
      : undefined,
  })
}

// ---- Mark inactive / active (AC20, UX R1, flow C): no confirmation, a spinner on that row's ⋮ ---------------
async function setActive(client: Client, active: boolean) {
  // Where focus goes if the row leaves the list: the next row, else the one above, else the search box.
  const rows = visible.value
  const at = rows.findIndex(c => c.id === client.id)
  const neighbour = rows[at + 1] ?? rows[at - 1]

  const result = active ? await mutations.restore(client.id) : await mutations.archive(client.id)
  if (!result) return // that row is already being changed
  if (!result.ok) {
    if (result.error.kind === 'changed' || result.error.kind === 'not_found') {
      onChangedElsewhere()
    }
    else {
      errorToast(`clients-mark-${client.id}`, CLIENT_COPY.markFailed(client.name, active), () => void setActive(client, active))
    }
    return
  }

  // "Already in that state" counts as done: same toast, no scary message (the server says `changed: false`).
  const updated = result.data.client
  const message = active ? CLIENT_COPY.toastMarkedActive(updated.name) : CLIENT_COPY.toastMarkedInactive(updated.name)
  if (clientMatchesFilters(updated, filters.value)) {
    toast.add({ title: message, icon: 'i-lucide-check' })
    flash(updated.id)
    void focusControl(`menu:${updated.id}`)
    void reveal(updated.id)
  }
  else {
    // O3: the status filter hides it now; say why, or the row would seem to vanish.
    const filterName = status.value === 'active' ? CLIENT_COPY.statusActive : CLIENT_COPY.statusInactive
    toast.add({ title: CLIENT_COPY.toastHiddenByFilter(message, filterName), icon: 'i-lucide-check' })
    void focusControl(...(neighbour ? [`menu:${neighbour.id}`] : []), 'search')
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Load failure (AC23) -->
    <AppPlaceholder
      v-if="loadFailed"
      icon="i-lucide-cloud-off"
      :title="CLIENT_COPY.loadFailedTitle"
      :body="CLIENT_COPY.loadFailedBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-refresh-cw"
        :label="CLIENT_COPY.tryAgain"
        :loading="retrying"
        class="w-full justify-center sm:w-auto"
        @click="retry"
      />
    </AppPlaceholder>

    <!-- First use (AC22): no filters, no sample clients -->
    <AppPlaceholder
      v-else-if="firstUse"
      icon="i-lucide-users"
      :title="CLIENT_COPY.firstUseTitle"
      :body="CLIENT_COPY.firstUseBody"
    >
      <UButton
        size="xl"
        icon="i-lucide-plus"
        data-client-focus="empty-add"
        :label="CLIENT_COPY.addLabel"
        class="w-full justify-center sm:w-auto"
        @click="openAdd({ kind: 'empty' })"
      />
    </AppPlaceholder>

    <template v-else>
      <ClientsToolbar
        ref="toolbar"
        v-model:search="search"
        v-model:status="status"
        :disabled="loading"
        :filtering="filtering && !loading"
        :shown="visible.length"
        :total="list.count.value"
        @clear="clearFilters"
      />

      <!-- Loading (AC23): skeletons, never the empty state -->
      <ClientsList
        ref="listView"
        :clients="visible"
        :reset-key="`${search}|${status}`"
        :loading="loading"
        :highlighted-id="highlightedId"
        :busy-ids="mutations.pendingIds.value"
        @edit="openEdit"
        @archive="(c: Client) => setActive(c, false)"
        @restore="(c: Client) => setActive(c, true)"
      >
        <!-- No match (AC7): the design's copy, and a way out -->
        <template
          v-if="noMatch"
          #empty
        >
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <p class="text-base text-muted">
              {{ CLIENT_COPY.noMatch }}
            </p>
            <p
              v-if="noMatchNote"
              class="text-base text-muted"
            >
              {{ noMatchNote }}
            </p>
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              :label="CLIENT_COPY.clearFilters"
              @click="clearFilters"
            />
          </div>
        </template>
      </ClientsList>
    </template>

    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ liveText }}
    </p>

    <ClientFormOverlay
      v-model:open="formOpen"
      :mode="formMode"
      :client="editClient"
      @saved="onSaved"
      @changed-elsewhere="onChangedElsewhere"
      @closed="onFormClosed"
    />
  </div>
</template>
