<!--
  The ⋮ menu on a client row or card (feature 03 UX "Row menu", AC18, AC20, AC21): Edit first, then Mark inactive
  (active client) or Mark active (inactive client). Neither is red: nothing is deleted, and there is no Delete.
  Items are 44px on phones and tablets (36px at lg); the trigger is 44px (40px at lg). While that row's request runs
  the trigger shows a spinner and is disabled (R1). The trigger's accessible name is "Actions for {Name}".
  Nothing here changes data: it emits.
  A list can hold 500 rows, and a mounted UDropdownMenu per row made the whole list slow to draw (about 1.3s to
  show 500 rows again after clearing a search). So each row starts as a plain button, and the real menu is mounted,
  already open, the first time that row's ⋮ is pressed.
-->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Client } from '#shared/types/api'

const props = defineProps<{
  client: Pick<Client, 'id' | 'name' | 'active'>
  /** This row's mark inactive / active request is running. */
  busy?: boolean
}>()

const emit = defineEmits<{
  edit: []
  archive: []
  restore: []
}>()

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: CLIENT_COPY.edit,
    icon: 'i-lucide-pencil',
    onSelect: () => emit('edit'),
  },
  props.client.active
    ? { label: CLIENT_COPY.markInactive, icon: 'i-lucide-user-x', onSelect: () => emit('archive') }
    : { label: CLIENT_COPY.markActive, icon: 'i-lucide-user-check', onSelect: () => emit('restore') },
])
const activated = ref(false)
const open = ref(false)
function activate() {
  open.value = true
  activated.value = true
}
</script>

<template>
  <UDropdownMenu
    v-if="activated"
    v-model:open="open"
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'w-48', item: 'min-h-11 lg:min-h-9' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-ellipsis-vertical"
      :aria-label="CLIENT_COPY.actionsFor(client.name)"
      :data-client-focus="`menu:${client.id}`"
      class="size-11 shrink-0 justify-center lg:size-10"
      :loading="busy"
      :disabled="busy"
    />
  </UDropdownMenu>
  <UButton
    v-else
    color="neutral"
    variant="ghost"
    icon="i-lucide-ellipsis-vertical"
    :aria-label="CLIENT_COPY.actionsFor(client.name)"
    aria-haspopup="menu"
    aria-expanded="false"
    :data-client-focus="`menu:${client.id}`"
    class="size-11 shrink-0 justify-center lg:size-10"
    :loading="busy"
    :disabled="busy"
    @click="activate"
  />
</template>
