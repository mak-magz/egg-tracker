<!--
  Account menu (T21: AC13, AC14, AC19a, AC21). Header (not an item): farm name + email.
  Items: Dark mode / Light mode (stays open so the change is visible) and Sign out (no confirmation).
  `variant`: 'row' = the expanded sidebar footer (opens upward, left-aligned);
             'avatar' = tablet rail (opens to the right) and mobile top bar (opens downward, right-aligned).
-->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  farmName: string
  email: string
  variant?: 'row' | 'avatar'
  /** Where the panel opens (the trigger's position differs per breakpoint). */
  side?: 'top' | 'right' | 'bottom'
  align?: 'start' | 'end'
}>(), {
  variant: 'row',
  side: 'top',
  align: 'start',
})

const colorMode = useColorMode()
const { signOut } = useAuthActions()

const isDark = computed(() => colorMode.value === 'dark')

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    type: 'label',
    slot: 'account',
    label: props.farmName,
  }],
  [{
    label: isDark.value ? 'Light mode' : 'Dark mode',
    icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
    onSelect(event: Event) {
      // Keep the menu open so the owner sees the switch (§2.5 Flow F). Remembered per device.
      event.preventDefault()
      colorMode.preference = isDark.value ? 'light' : 'dark'
    },
  }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    color: 'error',
    onSelect() {
      signOut()
    },
  }],
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ side: props.side, align: props.align, sideOffset: 8 }"
    size="lg"
    :ui="{
      content: 'w-60 rounded-lg p-0.5',
      label: 'p-2.5',
      item: 'min-h-11 md:min-h-0 px-2.5 py-2 text-base gap-2.5 items-center',
      itemLeadingIcon: 'size-4',
    }"
  >
    <button
      type="button"
      aria-label="Account menu"
      class="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-elevated/50"
      :class="props.variant === 'row' ? 'w-full px-0.5' : ''"
    >
      <AppAccountSummary
        :farm-name="props.farmName"
        :email="props.email"
        :compact="props.variant === 'avatar'"
      />
    </button>

    <template #account>
      <span class="block min-w-0 text-left">
        <span class="block truncate text-base font-semibold text-highlighted">{{ props.farmName }}</span>
        <span class="block truncate text-sm font-normal text-muted">{{ props.email }}</span>
      </span>
    </template>
  </UDropdownMenu>
</template>
