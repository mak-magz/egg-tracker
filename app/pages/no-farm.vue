<!-- Signed in, but no farm membership (T20, AC12). No shell, no nav, no farm data. -->
<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: 'user' })
useHead({ title: 'No farm linked · Tamago' })

const { me } = useMe()
const { signOut } = useAuthActions()
const signingOut = ref(false)

async function onSignOut() {
  signingOut.value = true
  await signOut()
}
</script>

<template>
  <AuthCard
    title="No farm linked"
    description="Your account isn't linked to a farm yet. Contact support."
  >
    <p
      v-if="me?.email"
      class="text-center text-sm text-dimmed break-all"
    >
      Signed in as {{ me.email }}
    </p>
    <UButton
      color="neutral"
      variant="outline"
      size="xl"
      block
      icon="i-lucide-log-out"
      label="Sign out"
      :loading="signingOut"
      @click="onSignOut"
    />
  </AuthCard>
</template>
