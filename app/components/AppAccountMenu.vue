<!--
  Account menu (T21: AC13, AC14, AC19a, AC21). Header (not an item): farm name + email.
  Items: Settings (feature 02: a link, closes the menu), Dark mode / Light mode (stays open so the change
  is visible) and Sign out (no confirmation).
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
const route = useRoute()
const { signOut } = useAuthActions()

const isDark = computed(() => colorMode.value === 'dark')

const items = computed<DropdownMenuItem[][]>(() => {
  const accountGroup: DropdownMenuItem[] = [{
    type: 'label',
    slot: 'account',
    label: props.farmName || 'My Farm',
  }]

  const navGroup: DropdownMenuItem[] = [{
    // Feature 02 (owner decision Q3): Settings lives here, not in a sixth tab. A link item: selecting it
    // navigates and closes the menu; on /settings it shows as the current item.
    label: SIZE_COPY.menuItem,
    icon: 'i-lucide-settings',
    to: '/settings',
    active: route.path === '/settings',
  }, {
    label: isDark.value ? 'Light mode' : 'Dark mode',
    icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
    onSelect(event: Event) {
      // Keep the menu open so the owner sees the switch (§2.5 Flow F). Remembered per device.
      event.preventDefault()
      colorMode.preference = isDark.value ? 'light' : 'dark'
    },
  }]

  const authGroup: DropdownMenuItem[] = props.email
    ? [{
        label: 'Sign out',
        icon: 'i-lucide-log-out',
        color: 'error',
        onSelect() {
          signOut()
        },
      }]
    : [{
        label: 'Sign in / Sync',
        icon: 'i-lucide-cloud',
        to: '/settings',
      }]

  return [accountGroup, navGroup, authGroup]
})
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
        :farm-name="props.farmName || 'My Farm'"
        :email="props.email"
        :compact="props.variant === 'avatar'"
      />
    </button>

    <template #account>
      <span class="block min-w-0 text-left">
        <span class="block truncate text-base font-semibold text-highlighted">{{ props.farmName || 'My Farm' }}</span>
        <span class="block truncate text-sm font-normal text-muted">{{ props.email || 'Local Farm (Free)' }}</span>
      </span>
    </template>
  </UDropdownMenu>
</template>
