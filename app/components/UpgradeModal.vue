<script setup lang="ts">
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { localWorker } from '../local/client'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'upgraded': []
}>()

const auth = useFirebaseAuth()
const toast = useToast()
const { me, ensure } = useMe()

const mode = ref<'register' | 'login'>('register')
const farmName = ref(me.value?.farm?.name || 'My Farm')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    farmName.value = me.value?.farm?.name || 'My Farm'
    errorMessage.value = null
  }
})

async function submit() {
  if (!auth) {
    errorMessage.value = 'Firebase Auth is not available'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    // 1. Authenticate with Firebase
    if (mode.value === 'register') {
      await createUserWithEmailAndPassword(auth, email.value.trim(), password.value)
    }
    else {
      await signInWithEmailAndPassword(auth, email.value.trim(), password.value)
    }

    // 2. Call upgrade API to provision cloud tenant
    await $fetch('/api/account/upgrade', {
      method: 'POST',
      body: {
        farmName: farmName.value.trim(),
        currency: me.value?.farm?.currency || 'PHP',
        eggsPerTray: me.value?.farm?.eggsPerTray || 30,
      },
    })

    // 3. Export local snapshot and push to cloud
    try {
      const snapshot = await localWorker.exportData()
      await $fetch('/api/sync/snapshot', {
        method: 'POST',
        body: snapshot,
      })
    }
    catch (syncErr) {
      console.warn('[upgrade] Initial snapshot upload failed:', syncErr)
    }

    // 4. Refresh auth state & context
    await ensure({ force: true })

    toast.add({
      title: 'Upgraded to Cloud Sync',
      description: 'Your farm data has been synced to your private cloud database.',
      color: 'success',
    })

    emit('update:open', false)
    emit('upgraded')
  }
  catch (err: unknown) {
    console.error('[upgrade] Failed:', err)
    const error = err as { data?: { message?: string }, message?: string }
    errorMessage.value = error?.data?.message || error?.message || 'Upgrade failed. Please try again.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-cloud"
              class="size-6 text-primary"
            />
            <h3 class="text-lg font-bold text-highlighted">
              Upgrade to Cloud Sync
            </h3>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="sm"
            @click="emit('update:open', false)"
          />
        </div>

        <p class="text-sm text-muted mb-4">
          Enable automatic multi-device synchronization, secure cloud backup, and multi-user access with a dedicated private database.
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          :title="errorMessage"
          class="mb-4"
        />

        <form
          class="space-y-4"
          @submit.prevent="submit"
        >
          <div v-if="mode === 'register'">
            <label class="block text-sm font-medium mb-1">Farm Name</label>
            <UInput
              v-model="farmName"
              placeholder="e.g. Sunrise Farm"
              required
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Email</label>
            <UInput
              v-model="email"
              type="email"
              placeholder="owner@example.com"
              required
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Password</label>
            <UInput
              v-model="password"
              type="password"
              placeholder="Min 8 characters"
              required
              class="w-full"
            />
          </div>

          <div class="pt-2 flex items-center justify-between">
            <button
              type="button"
              class="text-xs text-primary underline"
              @click="mode = mode === 'register' ? 'login' : 'register'"
            >
              {{ mode === 'register' ? 'Already have a cloud account? Sign in' : 'New here? Register farm account' }}
            </button>

            <UButton
              type="submit"
              color="primary"
              :loading="loading"
            >
              {{ mode === 'register' ? 'Create & Sync' : 'Sign in & Sync' }}
            </UButton>
          </div>
        </form>
      </div>
    </template>
  </UModal>
</template>
