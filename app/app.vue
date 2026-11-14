<script setup lang="ts">
import type { AppProps } from '@nuxt/ui'

// On phones toasts never cover the bottom tabs (feature 02 R4; feature 01 §2.5 "Toasts", D8):
//   - a screen with a FAB: above the FAB. Tabs 64px + safe area + FAB 52px + gaps = 84px.
//   - any other app screen (Settings has no FAB): above the tab bar. Tabs 64px + safe area + 16px.
//   - screens with no tab bar (sign-in, reset): the default bottom offset.
const route = useRoute()
const { hasFab } = usePrimaryAction()
// The invoice layout has no tab bar (feature 07), and a toast must never print or cover its Print button.
const hasTabs = computed(() => (route.meta.auth === undefined || route.meta.auth === 'farm') && route.meta.layout !== 'invoice')
const toaster = computed<AppProps['toaster']>(() => ({
  position: 'bottom-center',
  duration: 2600,
  ui: hasFab.value
    ? { viewport: 'print:hidden bottom-[calc(4rem+env(safe-area-inset-bottom)+84px)] md:bottom-4' }
    : hasTabs.value
      ? { viewport: 'print:hidden bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:bottom-4' }
      : route.meta.layout === 'invoice'
        // Above the fixed Print bar (48px + padding + safe area) on phones.
        ? { viewport: 'print:hidden bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4' }
        : { viewport: 'print:hidden' },
}))
</script>

<template>
  <UApp :toaster="toaster">
    <NuxtLoadingIndicator
      color="var(--ui-primary)"
      :height="3"
    />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ConfirmReplaceLocalDialog />
  </UApp>
</template>
