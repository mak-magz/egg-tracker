<script setup lang="ts">
definePageMeta({
  layout: false,
  auth: 'public',
})

const { isFree, getAuthToken } = useTier()
const { me, ensure } = useMe()
const onboardedCookie = useCookie('tamago_onboarded')
const sessionCookie = useCookie('__session')

async function resolveDestination(): Promise<string> {
  // 1. Operator clearance / session
  if (sessionCookie.value) {
    try {
      if (import.meta.server) {
        const fetcher = useRequestFetch()
        await fetcher('/api/admin/metrics')
      }
      else {
        await $fetch('/api/admin/metrics')
      }
      return '/admin'
    }
    catch {
      // Not an operator or expired
    }
  }

  // 2. Free offline farm operator (onboarded local barn context)
  if (isFree.value && (onboardedCookie.value === 'true' || me.value?.farm?.onboardingCompleted)) {
    return '/farm'
  }

  // 3. Authenticated cloud farm owner
  const token = await getAuthToken()
  if (token) {
    const status = await ensure()
    if (status === 'ready' && me.value?.farm) {
      return '/farm'
    }
    if (status === 'ready' && !me.value?.farm) {
      return '/no-farm'
    }
  }

  // 4. Unauthenticated visitor with no local farm context
  return onboardedCookie.value === 'true' ? '/login' : '/welcome'
}

const target = await resolveDestination()
await navigateTo(target, { replace: true, redirectCode: 302 })
</script>

<template>
  <div class="min-h-screen bg-muted flex items-center justify-center">
    <div class="flex flex-col items-center gap-3">
      <AppLogo :size="48" class="animate-pulse" />
      <span class="text-xs font-medium text-muted">Loading Tamago...</span>
    </div>
  </div>
</template>
