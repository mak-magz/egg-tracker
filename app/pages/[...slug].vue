<!--
  404 (T23, AC20; D12). A catch-all page (not error.vue) so the middleware runs and `me` is known:
  signed in with a farm → inside the shell (title "Page not found", no nav item highlighted);
  otherwise → the same card standalone, with no farm name (AC9). HTTP status 404 on SSR.
  Sign-up style URLs (/signup, /register) land here too: there is no sign-up (AC2).
-->
<script setup lang="ts">
definePageMeta({ layout: false, auth: 'public', title: 'Page not found' })

const { me } = useMe()
const event = useRequestEvent()
if (event) setResponseStatus(event, 404, 'Page Not Found')

const inShell = computed(() => !!me.value?.farm)
useHead({ title: 'Page not found · Tamago' })
</script>

<template>
  <NuxtLayout :name="inShell ? 'default' : 'auth'">
    <AppPlaceholder
      icon="i-lucide-search-x"
      eyebrow="404"
      title="Page not found"
      body="We couldn't find that page."
    >
      <UButton
        to="/"
        size="xl"
        block
        label="Go to Dashboard"
      />
    </AppPlaceholder>
  </NuxtLayout>
</template>
