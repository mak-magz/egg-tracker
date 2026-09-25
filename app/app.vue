<script setup lang="ts">
import type { AppProps } from '@nuxt/ui'

// On mobile screens with a FAB, toasts sit above it so they never cover the FAB or the tabs
// (feature 01 §2.5 States "Toasts", D8). Tabs 64px + safe area + FAB 52px + gaps = 84px.
const { hasFab } = usePrimaryAction()
const toaster = computed<AppProps['toaster']>(() => ({
  position: 'bottom-center',
  duration: 2600,
  ui: hasFab.value ? { viewport: 'bottom-[calc(4rem+env(safe-area-inset-bottom)+84px)] md:bottom-4' } : undefined,
}))
</script>

<template>
  <UApp :toaster="toaster">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
