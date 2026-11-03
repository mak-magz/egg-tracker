<script setup lang="ts">
const auth = useFirebaseAuth()
const userEmail = computed(() => auth?.currentUser?.email ?? 'Unknown account')
const admin = useAdmin()
const checking = ref(false)

async function handleRetry() {
  checking.value = true
  try {
    await admin.checkAccess()
  }
  finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="min-h-[80vh] flex items-center justify-center p-4">
    <UCard class="max-w-md w-full text-center p-6 border-red-500/20 bg-red-500/5 shadow-xl">
      <div class="flex justify-center mb-4">
        <span class="p-3 rounded-2xl bg-red-500/10 text-red-500">
          <UIcon
            name="i-lucide-shield-alert"
            class="size-12"
          />
        </span>
      </div>
      <h1 class="text-2xl font-bold text-highlighted mb-2">
        Access Denied
      </h1>
      <p class="text-sm text-muted mb-6 leading-relaxed">
        Administrator privileges are required to view the Operator Control Plane. Your account
        <span class="font-semibold text-highlighted">({{ userEmail }})</span> is not registered in the administrator registry.
      </p>
      <div class="flex flex-col gap-3">
        <UButton
          color="primary"
          size="lg"
          block
          icon="i-lucide-refresh-cw"
          label="Retry Permission Check"
          :loading="checking"
          class="min-h-11"
          @click="handleRetry"
        />
        <UButton
          to="/admin/login"
          color="neutral"
          variant="subtle"
          size="lg"
          block
          icon="i-lucide-shield-check"
          label="Sign In with Different Account"
          class="min-h-11"
        />
        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          size="md"
          block
          icon="i-lucide-arrow-left"
          label="Return to Farm Dashboard"
        />
      </div>
    </UCard>
  </div>
</template>
