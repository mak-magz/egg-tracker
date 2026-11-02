<!--
  The search box, the status filter and the "Showing x of n · Clear" line (feature 03 UX "D. Search and filter",
  AC5 to AC7, AC24, owner decision O2). Desktop keeps the design's row (search 220px at the left, status 160px at
  the right); on phones the two controls share a row and wrap to two full-width rows when they can't fit.
  Both are 44px tall. The search text and the filter are the PAGE's (v-models): nothing here touches the URL or
  any storage (AC30). Disabled while the list loads.
  The status filter is a plain <select> styled like UInput, not USelect: in Nuxt UI 4.11.2 USelect is a custom
  listbox, and the phone's own picker is what UX wanted (feature 03 §3.4 "Select control").
-->
<script setup lang="ts">
import type { ClientStatusFilter } from '#shared/utils/client-list'

defineProps<{
  disabled?: boolean
  /** A search or a status filter is on: shows the "Showing x of n" line. */
  filtering: boolean
  shown: number
  total: number
}>()

const search = defineModel<string>('search', { required: true })
const status = defineModel<ClientStatusFilter>('status', { required: true })

const emit = defineEmits<{ clear: [] }>()

const searchInput = useTemplateRef<{ inputRef: HTMLInputElement | null }>('searchInput')

function clearSearch() {
  search.value = ''
  searchInput.value?.inputRef?.focus()
}

defineExpose({ focusSearch: () => searchInput.value?.inputRef?.focus() })
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-between">
      <div class="min-w-0 flex-[1_1_180px] md:w-[220px] md:flex-none">
        <UInput
          ref="searchInput"
          v-model="search"
          type="search"
          size="xl"
          class="w-full"
          icon="i-lucide-search"
          :placeholder="CLIENT_COPY.searchPlaceholder"
          :aria-label="CLIENT_COPY.searchLabel"
          :disabled="disabled"
          :ui="{ base: [search.length > 0 && 'pe-12', '[&::-webkit-search-cancel-button]:hidden'], trailing: 'pe-0.5' }"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="search"
          data-client-focus="search"
        >
          <template
            v-if="search.length && !disabled"
            #trailing
          >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :aria-label="CLIENT_COPY.clearSearch"
              class="size-11 justify-center"
              @click="clearSearch"
            />
          </template>
        </UInput>
      </div>

      <div class="relative min-w-0 flex-[1_1_148px] md:w-40 md:flex-none">
        <select
          v-model="status"
          :aria-label="CLIENT_COPY.statusLabel"
          :disabled="disabled"
          class="h-11 w-full appearance-none rounded-xl bg-default ps-3.5 pe-10 text-base text-highlighted border border-default/70 hover:border-default shadow-2xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-75"
        >
          <option value="all">
            {{ CLIENT_COPY.statusAll }}
          </option>
          <option value="active">
            {{ CLIENT_COPY.statusActive }}
          </option>
          <option value="inactive">
            {{ CLIENT_COPY.statusInactive }}
          </option>
        </select>
        <UIcon
          name="i-lucide-chevron-down"
          class="pointer-events-none absolute inset-y-0 end-3 my-auto size-5 text-dimmed"
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- Owner decision O2: while narrowed, say so, and clear both in one tap. -->
    <div
      v-if="filtering"
      class="flex items-center text-sm text-muted"
    >
      <span>{{ CLIENT_COPY.showing(shown, total) }}</span>
      <span
        class="px-1"
        aria-hidden="true"
      >·</span>
      <UButton
        color="neutral"
        variant="link"
        size="lg"
        class="min-h-11 min-w-11 justify-center px-2"
        :label="CLIENT_COPY.clear"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
