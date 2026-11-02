<!--
  The client list (feature 03 UX "Layouts", AC3, AC4, AC24, AC25, R6 to R8): the design's table when the area is
  wide enough, stacked cards when it isn't. It renders the given, already sorted and filtered, list ONCE, in
  one layout: the switch is the list area's own width (>= 640px), measured with useElementSize, not the screen
  width, so a tablet with the sidebar collapsed gets the table and one with it expanded gets cards.
  The name is a real <button> ("Edit {Name}") and opens Edit; on cards it stretches over the whole card, and the
  ⋮ sits above it. A missing phone is a dash with a spoken label. Names wrap, never truncate. Nothing
  here changes data: it emits.
  Rendering: a farm can hold 500 clients, and drawing 500 rows of Nuxt UI components took about a second in dev. So
  only the first ROWS_PER_STEP rows are in the DOM, and more are added as the owner scrolls near the end (an
  IntersectionObserver sentinel). Search and the status filter still run over the whole list, so "Showing x of n" and
  the empty states are exact; `ensureRendered(id)` adds the rows up to a client (a new client far down the list).
-->
<script setup lang="ts">
import { useElementSize, useIntersectionObserver } from '@vueuse/core'
import type { Client } from '#shared/types/api'
import { clientInitials } from '#shared/utils/client-list'

const props = defineProps<{
  clients: readonly Client[]
  /** Show 5 skeletons in the chosen layout instead of the list. */
  loading?: boolean
  /** The row that just changed: the short tint. */
  highlightedId?: string | null
  /** Ids whose mark inactive / active is running. */
  busyIds?: readonly string[]
  /** Changes when the search or status filter changes: the list starts from the top again (fewer rows in the DOM). */
  resetKey?: string
}>()

const emit = defineEmits<{
  edit: [client: Client]
  archive: [client: Client]
  restore: [client: Client]
}>()

/** The content width from which the four-column table fits (UX: about 640px). */
const TABLE_MIN_WIDTH = 640
// Measure a zero-height marker at the top, not the list itself: the list's own height changes with every render,
// which made the browser report "ResizeObserver loop completed with undelivered notifications".
const sizer = useTemplateRef<HTMLElement>('sizer')
const { width } = useElementSize(sizer)
const wide = computed(() => width.value >= TABLE_MIN_WIDTH)

const busy = computed(() => new Set(props.busyIds ?? []))
const { formatPrice } = useFarm()

// ---- Rows in the DOM: the first ROWS_PER_STEP, then more as the end comes near -------------------------
const ROWS_PER_STEP = 60
const limit = ref(ROWS_PER_STEP)
const rendered = computed(() => props.clients.slice(0, limit.value))
const hasMore = computed(() => limit.value < props.clients.length)
const sentinel = useTemplateRef<HTMLElement>('sentinel')

/** Adds another step when the end marker is within a screen or so of the viewport. */
function fillIfNeeded() {
  const el = sentinel.value
  if (!el || !hasMore.value) return
  if (el.getBoundingClientRect().top < window.innerHeight + 600) limit.value += ROWS_PER_STEP
}
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) fillIfNeeded()
}, { rootMargin: '600px' })
// The end marker can still be in range after a step (a tall screen): look again once the rows are drawn.
watch(limit, () => nextTick(fillIfNeeded))
watch(() => props.resetKey, () => {
  limit.value = ROWS_PER_STEP
})

/** Makes sure the row for `id` is in the DOM (a client saved far down the list), so it can be scrolled to and focused. */
async function ensureRendered(id: string): Promise<void> {
  const index = props.clients.findIndex(c => c.id === id)
  if (index >= limit.value) limit.value = index + 1
  await nextTick()
}
defineExpose({ ensureRendered })

const flash = 'animate-[size-row-flash_1.5s_ease-out] motion-reduce:animate-none'
</script>

<template>
  <div>
    <div
      ref="sizer"
      class="h-0 w-full"
      aria-hidden="true"
    />
    <!-- Wide: the design's table -->
    <div
      v-if="wide"
      class="overflow-hidden rounded-2xl bg-default border border-default/80 shadow-xs"
    >
      <table
        class="w-full border-collapse"
        :aria-rowcount="loading ? undefined : clients.length + 1"
      >
        <caption class="sr-only">
          {{ CLIENT_COPY.tableCaption }}
        </caption>
        <thead>
          <tr class="border-b border-default/80 bg-muted/30">
            <th
              scope="col"
              class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ CLIENT_COPY.headerClient }}
            </th>
            <th
              scope="col"
              class="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ CLIENT_COPY.headerPhone }}
            </th>
            <th
              scope="col"
              class="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted"
            >
              {{ CLIENT_COPY.headerStatus }}
            </th>
            <th
              scope="col"
              class="w-16 px-2"
            >
              <span class="sr-only">{{ CLIENT_COPY.headerActions }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr
              v-for="n in 5"
              :key="n"
              class="border-b border-default last:border-b-0"
              aria-hidden="true"
            >
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-2.5">
                  <USkeleton class="size-8 shrink-0 rounded-full bg-accented" />
                  <USkeleton class="h-5 w-44 bg-accented" />
                </div>
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-28 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="ms-auto h-5 w-16 bg-accented" />
              </td>
              <td class="px-2 py-3.5" />
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="(client, i) in rendered"
              :key="client.id"
              :data-client-row="client.id"
              :aria-rowindex="i + 2"
              class="cursor-pointer border-b border-default transition-colors last:border-b-0 hover:bg-muted"
              :class="highlightedId === client.id ? flash : ''"
              @click="emit('edit', client)"
            >
              <td class="px-4 py-1.5 lg:py-1">
                <div class="flex items-center gap-2.5">
                  <!-- Decorative initials (the design's avatar). A plain span, not UAvatar: 500 reka avatars are slow to mount. -->
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-extrabold select-none"
                    aria-hidden="true"
                  >{{ clientInitials(client.name) }}</span>
                  <button
                    type="button"
                    class="min-h-11 min-w-0 rounded-md py-1 text-left text-base font-semibold wrap-anywhere text-highlighted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:min-h-10"
                    :aria-label="CLIENT_COPY.editAria(client.name)"
                    :data-client-focus="`name:${client.id}`"
                    @click.stop="emit('edit', client)"
                  >
                    {{ client.name }}
                  </button>
                </div>
              </td>
              <td class="px-4 py-1.5 text-base whitespace-nowrap text-default lg:py-1">
                <template v-if="client.phone">
                  {{ client.phone }}
                </template>
                <template v-else>
                  <span aria-hidden="true">—</span><span class="sr-only">{{ CLIENT_COPY.noPhone }}</span>
                </template>
              </td>
              <td class="px-4 py-1.5 text-right lg:py-1">
                <ClientStatusBadge :active="client.active" />
              </td>
              <td
                class="px-2 py-1.5 text-right lg:py-1"
                @click.stop
              >
                <ClientRowMenu
                  :client="client"
                  :busy="busy.has(client.id)"
                  @edit="emit('edit', client)"
                  @archive="emit('archive', client)"
                  @restore="emit('restore', client)"
                />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <slot name="empty" />
    </div>

    <!-- Narrow: stacked cards (phones, and a tablet with the sidebar open) -->
    <template v-else>
      <div
        v-if="loading"
        class="flex flex-col gap-3"
        aria-hidden="true"
      >
        <USkeleton
          v-for="n in 5"
          :key="n"
          class="h-[108px] w-full rounded-2xl bg-accented"
        />
      </div>
      <ul
        v-else-if="clients.length"
        role="list"
        class="flex flex-col gap-3"
      >
        <li
          v-for="(client, i) in rendered"
          :key="client.id"
          :data-client-row="client.id"
          :aria-posinset="i + 1"
          :aria-setsize="clients.length"
          class="relative rounded-2xl bg-default p-5 border border-default/70 hover:border-default shadow-xs hover:shadow-md transition-all [contain-intrinsic-size:auto_116px] [content-visibility:auto] active:bg-elevated flex flex-col justify-between gap-3 group"
          :class="highlightedId === client.id ? flash : ''"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-extrabold select-none"
                aria-hidden="true"
              >{{ clientInitials(client.name) }}</span>
              <div class="min-w-0">
                <button
                  type="button"
                  class="flex min-h-6 min-w-0 flex-1 items-start text-left text-base font-bold wrap-anywhere text-highlighted after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
                  :aria-label="CLIENT_COPY.editAria(client.name)"
                  :data-client-focus="`name:${client.id}`"
                  @click="emit('edit', client)"
                >
                  {{ client.name }}
                </button>
                <div class="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                  <UIcon
                    v-if="client.phone"
                    name="i-lucide-phone"
                    class="size-3 text-muted shrink-0"
                  />
                  <span>
                    <template v-if="client.phone">
                      {{ client.phone }}
                    </template>
                    <template v-else>
                      <span aria-hidden="true">—</span><span class="sr-only">{{ CLIENT_COPY.noPhone }}</span>
                    </template>
                  </span>
                </div>
              </div>
            </div>

            <div class="relative z-10 shrink-0">
              <ClientRowMenu
                :client="client"
                :busy="busy.has(client.id)"
                @edit="emit('edit', client)"
                @archive="emit('archive', client)"
                @restore="emit('restore', client)"
              />
            </div>
          </div>

          <div class="pt-3 border-t border-default/60 flex items-center justify-between text-xs">
            <span
              v-if="client.defaultPrice !== null"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted/60 text-xs font-semibold text-muted"
            >
              Default: {{ formatPrice(client.defaultPrice) }} / tray
            </span>
            <span
              v-else
              class="text-xs text-dimmed"
            >
              No default price
            </span>
            <ClientStatusBadge :active="client.active" />
          </div>
        </li>
      </ul>
      <div
        v-else
        class="rounded-2xl bg-default border border-default/80 shadow-xs"
      >
        <slot name="empty" />
      </div>
    </template>

    <!-- End marker: when it comes near the viewport, the next rows are added. -->
    <div
      v-if="hasMore && !loading"
      ref="sentinel"
      class="h-px"
      aria-hidden="true"
    />
  </div>
</template>
