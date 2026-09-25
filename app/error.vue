<!--
  Unexpected errors (T23, AC20). Replaces app.vue, so it has its own UApp. A standalone card with no
  farm data and no technical detail; "Go to Dashboard" clears the error (the guard then decides).
  Unknown routes normally hit pages/[...slug].vue; a thrown 404 lands here with the 404 copy.
-->
<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)
useHead({ title: computed(() => `${isNotFound.value ? 'Page not found' : 'Something went wrong'} · Tamago`) })

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <div class="flex min-h-svh w-full items-start justify-center bg-muted p-6 pt-12 md:items-center md:pt-6">
      <AppPlaceholder
        :icon="isNotFound ? 'i-lucide-search-x' : 'i-lucide-triangle-alert'"
        :eyebrow="isNotFound ? '404' : undefined"
        :title="isNotFound ? 'Page not found' : 'Something went wrong'"
        :body="isNotFound ? 'We couldn\'t find that page.' : 'Something went wrong on our side. Try again.'"
      >
        <UButton
          size="xl"
          block
          label="Go to Dashboard"
          @click="goHome"
        />
      </AppPlaceholder>
    </div>
  </UApp>
</template>
