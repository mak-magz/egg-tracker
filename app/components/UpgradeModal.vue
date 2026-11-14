<script setup lang="ts">
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'
import { normalizeFarmSnapshot } from '../../core/utils/sync-payload'
import { localWorker } from '../local/client'
import { syncEngine } from '../local/sync'

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
const { isFree, upgradeToPremium, revertToFree } = useTier()
const { requestLocalReplaceConfirmation } = useLocalReplaceGuard()

const mode = ref<'register' | 'login'>('register')
const farmName = ref(me.value?.farm?.name || 'My Farm')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const snapshotRetryPending = ref(false)
const provisionedEmail = ref<string | null>(null)

async function clearIncompleteAuthSession() {
  if (auth?.currentUser && isFree.value) {
    try {
      await firebaseSignOut(auth)
    }
    catch {
      // ignore
    }
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    farmName.value = me.value?.farm?.name || 'My Farm'
    errorMessage.value = null
  }
  else {
    snapshotRetryPending.value = false
    void clearIncompleteAuthSession()
  }
})

watch(mode, () => {
  errorMessage.value = null
  snapshotRetryPending.value = false
  void clearIncompleteAuthSession()
})

async function uploadLocalSnapshot(authHeaders: Record<string, string>) {
  const rawSnapshot = await localWorker.exportData()
  const snapshot = normalizeFarmSnapshot(rawSnapshot)
  const res = await $fetch<{ success?: boolean, baseVersion?: number }>('/api/sync/snapshot', {
    method: 'POST',
    headers: authHeaders,
    body: snapshot,
  })
  await localWorker.markSnapshotExported(res?.baseVersion ?? 1)
}

async function provisionAndUploadSnapshot(authHeaders: Record<string, string>, userEmail: string) {
  if (provisionedEmail.value !== userEmail) {
    await $fetch('/api/account/upgrade', {
      method: 'POST',
      headers: authHeaders,
      body: {
        farmName: farmName.value.trim(),
        currency: me.value?.farm?.currency || 'PHP',
        eggsPerTray: me.value?.farm?.eggsPerTray || 30,
      },
    })
    provisionedEmail.value = userEmail
  }

  try {
    await uploadLocalSnapshot(authHeaders)
    snapshotRetryPending.value = false
  }
  catch {
    snapshotRetryPending.value = true
    errorMessage.value = 'Could not upload farm data to the cloud. Please verify your connection and try again.'
    return false
  }
  return true
}

async function submit() {
  if (!auth) {
    errorMessage.value = 'Firebase Auth is not available'
    return
  }

  loading.value = true
  errorMessage.value = null

  try {
    // Pause background sync so watch(isPremium) cannot race against snapshot upload/import
    syncEngine.stop()

    const trimmedEmail = email.value.trim()
    let user = auth.currentUser

    if (!user || user.email?.toLowerCase() !== trimmedEmail.toLowerCase()) {
      const cred = mode.value === 'register'
        ? await createUserWithEmailAndPassword(auth, trimmedEmail, password.value)
        : await signInWithEmailAndPassword(auth, trimmedEmail, password.value)
      user = cred.user
    }

    const token = await user.getIdToken()
    const authHeaders = { Authorization: `Bearer ${token}` }

    if (mode.value === 'register') {
      const uploaded = await provisionAndUploadSnapshot(authHeaders, trimmedEmail.toLowerCase())
      if (!uploaded) {
        return
      }
      await localWorker.updateSyncState({ ownerUid: user.uid })
    }
    else {
      // Login mode: inspect whether account already has a cloud farm snapshot
      let existingCloudSnapshot: { snapshot: Record<string, unknown>, latestVersion?: number } | null = null
      try {
        existingCloudSnapshot = await $fetch<{ snapshot: Record<string, unknown>, latestVersion?: number }>('/api/sync/snapshot', {
          method: 'GET',
          headers: authHeaders,
        })
      }
      catch (fetchErr: unknown) {
        const status = (fetchErr as { statusCode?: number, status?: number })?.statusCode ?? (fetchErr as { status?: number })?.status
        if (status !== 404) {
          throw fetchErr
        }
      }

      if (existingCloudSnapshot?.snapshot) {
        const latestVersion = Number(existingCloudSnapshot.latestVersion ?? 0)
        const outcome = await confirmOrHydrateCloudFarm({
          getSummary: () => localWorker.getLocalDataSummary(),
          hydrateCloud: async () => {
            await localWorker.importSnapshot(existingCloudSnapshot!.snapshot, latestVersion, { tier: 'premium', ownerUid: user.uid })
            await localWorker.updateSyncState({
              status: 'synced',
              lastError: null,
              lastPulledVersion: latestVersion,
              needsReconcile: false,
              ownerUid: user.uid,
            })
          },
          requestConfirmation: requestLocalReplaceConfirmation,
          targetUid: user.uid,
          onCancel: async () => {
            try {
              await firebaseSignOut(auth)
            }
            catch {
              // ignore
            }
            revertToFree()
          },
        })

        if (outcome.status === 'cancelled') {
          toast.add({
            title: 'Sign-in cancelled',
            description: 'Your local farm data was kept intact on this device.',
            color: 'neutral',
          })
          return
        }
      }
      else {
        // Account had Firebase login only with no provisioned cloud tenant yet: provision + upload
        const uploaded = await provisionAndUploadSnapshot(authHeaders, trimmedEmail.toLowerCase())
        if (!uploaded) {
          return
        }
        await localWorker.updateSyncState({ ownerUid: user.uid })
      }
    }

    // Mark tier as premium ONLY AFTER snapshot upload/import & outbox cleanup succeed
    upgradeToPremium()

    await ensure({ force: true })

    toast.add({
      title: mode.value === 'register' ? 'Upgraded to Cloud Sync' : 'Cloud farm loaded successfully',
      description: 'Your farm data has been synced to your private cloud database.',
      color: 'success',
    })

    emit('update:open', false)
    emit('upgraded')
  }
  catch (err: unknown) {
    const error = err as { data?: { message?: string }, message?: string, code?: string }
    console.error('[upgrade] Failed:', error?.code ?? 'unknown')
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
              class="min-h-11"
              :loading="loading"
            >
              {{ snapshotRetryPending ? 'Retry Upload' : (mode === 'register' ? 'Create & Sync' : 'Sign in & Sync') }}
            </UButton>
          </div>
        </form>
      </div>
    </template>
  </UModal>
</template>
