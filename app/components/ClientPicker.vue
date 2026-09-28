<!--
  The sale form's Client field (feature 04 §2.5 "Client picker", AC13, AC14, AC41): searchable, active
  clients only (A to Z; ignores case and accents), plus the sale's own kept client if it has since become
  inactive (shown "{Name} · Inactive", not offered to switch TO). The first row is always "+ New client"; if
  the owner has typed something that matches nothing, that row reads `Add "{text}" as a new client` instead
  (flow L). Selecting it does NOT change the field: the host opens ClientFormOverlay on top and, once saved,
  calls back with the new client (AC14).
  On-site: the field is optional, and a chosen client can be cleared back to "Walk-in" with an inline ✕.
-->
<script setup lang="ts">
import { normalizeClientName } from '#shared/utils/client-name'
import { SALE_COPY } from '~/utils/sale-copy'

export interface ClientPickerOption {
  id: string
  name: string
  /** The sale's own client, kept even though it's since become inactive (AC41). */
  inactive: boolean
}

const props = defineProps<{
  options: readonly ClientPickerOption[]
  optional: boolean
  disabled?: boolean
  placeholder?: string
}>()

const modelValue = defineModel<string | null>({ required: true })

const emit = defineEmits<{
  /** The "+ New client" / "Add "{text}" as new" row was picked: open ClientFormOverlay with this starting name. */
  'add-new': [startingName: string]
}>()

const open = ref(false)
const searchTerm = ref('')

const NEW_CLIENT_ID = '__new_client__'

function foldedIncludes(haystack: string, needle: string): boolean {
  return normalizeClientName(haystack).toLocaleLowerCase().includes(normalizeClientName(needle).toLocaleLowerCase())
}

const filteredOptions = computed(() => {
  const term = searchTerm.value.trim()
  const list = term ? props.options.filter(c => foldedIncludes(c.name, term)) : props.options
  return list
})

const selectedOption = computed(() => props.options.find(c => c.id === modelValue.value) ?? null)

interface MenuItem { id: string, label: string, icon?: string }

const items = computed<MenuItem[]>(() => {
  const term = searchTerm.value.trim()
  const noMatch = term !== '' && filteredOptions.value.length === 0
  const newRow: MenuItem = { id: NEW_CLIENT_ID, label: noMatch ? SALE_COPY.addClientNamed(term) : SALE_COPY.newClientRow, icon: 'i-lucide-plus' }
  return [newRow, ...filteredOptions.value.map(c => ({ id: c.id, label: c.inactive ? SALE_COPY.clientInactiveSelected(c.name) : c.name }))]
})

function onSelect(id: string | string[] | undefined) {
  const value = Array.isArray(id) ? id[0] : id
  if (!value) return
  if (value === NEW_CLIENT_ID) {
    const startingName = searchTerm.value.trim()
    open.value = false
    searchTerm.value = ''
    emit('add-new', startingName)
    return
  }
  modelValue.value = value
  open.value = false
  searchTerm.value = ''
}

function clear() {
  modelValue.value = null
}
</script>

<template>
  <div class="flex items-stretch gap-1.5">
    <USelectMenu
      v-model:open="open"
      v-model:search-term="searchTerm"
      :items="items"
      value-key="id"
      label-key="label"
      ignore-filter
      :model-value="modelValue ?? undefined"
      :disabled="disabled"
      size="xl"
      class="min-w-0 flex-1"
      :placeholder="placeholder"
      :search-input="{ placeholder: SALE_COPY.clientFilterSearchPlaceholder }"
      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
      @update:model-value="onSelect"
    >
      <template #leading>
        <UIcon
          v-if="!selectedOption"
          name="i-lucide-search"
          class="size-5 text-dimmed"
        />
      </template>
      <template #item-leading="{ item }">
        <UIcon
          v-if="(item as MenuItem).id === NEW_CLIENT_ID"
          name="i-lucide-plus"
          class="size-4 text-primary"
        />
      </template>
    </USelectMenu>
    <UButton
      v-if="optional && modelValue"
      color="neutral"
      variant="ghost"
      icon="i-lucide-x"
      :aria-label="SALE_COPY.removeClientAria"
      class="size-11 shrink-0 justify-center lg:size-10"
      :disabled="disabled"
      @click="clear"
    />
  </div>
</template>
