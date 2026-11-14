<script setup lang="ts">
import type { FailedOutboxMutation } from '#shared/types/api'
import { exportFarmDataToJson } from '../local/export'
import { sheetUi } from '../utils/sheet-ui'

const {
  conflictsModalOpen,
  failedCount,
  isSyncing,
  getFailedMutations,
  retryMutation,
  retryAllMutations,
  discardMutation,
} = useSync()

const toast = useToast()

const items = ref<FailedOutboxMutation[]>([])
const loading = ref(false)
const busyId = ref<string | null>(null)
const retryingAll = ref(false)
const backingUp = ref(false)
const discardConfirmId = ref<string | null>(null)

async function loadItems() {
  loading.value = true
  try {
    items.value = await getFailedMutations()
  }
  catch {
    items.value = []
  }
  finally {
    loading.value = false
  }
}

watch(conflictsModalOpen, (isOpen) => {
  if (isOpen) {
    discardConfirmId.value = null
    void loadItems()
  }
})

watch([failedCount, isSyncing], ([, syncingNow], [, syncingPrev]) => {
  if (conflictsModalOpen.value && ((!syncingNow && syncingPrev) || failedCount.value !== items.value.length)) {
    void loadItems()
  }
})

async function handleBackup() {
  backingUp.value = true
  try {
    await exportFarmDataToJson()
    toast.add({
      title: 'Backup downloaded',
      description: 'Saved JSON backup of this device.',
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: 'Backup failed',
      description: 'Could not export local data.',
      color: 'error',
    })
  }
  finally {
    backingUp.value = false
  }
}

async function handleRetry(id: string) {
  busyId.value = id
  discardConfirmId.value = null
  try {
    await retryMutation(id)
    await loadItems()
    if (items.value.length === 0) {
      toast.add({
        title: 'Change synced',
        description: 'All queued changes are up to date.',
        color: 'success',
      })
    }
  }
  catch {
    await loadItems()
  }
  finally {
    busyId.value = null
  }
}

async function handleRetryAll() {
  retryingAll.value = true
  discardConfirmId.value = null
  try {
    await retryAllMutations()
    await loadItems()
    if (items.value.length === 0) {
      toast.add({
        title: 'All sync issues resolved',
        description: 'Your device is up to date with the cloud.',
        color: 'success',
      })
    }
  }
  finally {
    retryingAll.value = false
  }
}

async function handleConfirmDiscard(id: string) {
  busyId.value = id
  try {
    await discardMutation(id)
    discardConfirmId.value = null
    await loadItems()
    toast.add({
      title: 'Change discarded',
      description: 'Local records reconciled with cloud data.',
      color: 'neutral',
    })
  }
  catch {
    toast.add({
      title: 'Discard failed',
      description: 'Could not discard this change. Try again.',
      color: 'error',
    })
  }
  finally {
    busyId.value = null
  }
}

function formatCreatedAt(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  catch {
    return iso.slice(0, 10)
  }
}
</script>

<template>
  <UModal
    v-model:open="conflictsModalOpen"
    :ui="sheetUi(520)"
  >
    <template #content>
      <div class="p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85svh] flex flex-col">
        <div class="flex items-start justify-between gap-3 mb-3 shrink-0">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-highlighted">
                Sync Issues
              </h3>
              <UBadge
                v-if="items.length > 0"
                color="error"
                variant="subtle"
                size="sm"
              >
                {{ items.length }}
              </UBadge>
            </div>
            <p class="text-sm text-muted mt-0.5">
              Unsynced offline changes that need review before uploading.
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Close"
            class="size-11 shrink-0 justify-center"
            @click="conflictsModalOpen = false"
          />
        </div>

        <div
          v-if="items.length > 0"
          class="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-default shrink-0"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            class="min-h-11"
            :loading="backingUp"
            @click="handleBackup"
          >
            Backup JSON
          </UButton>
          <UButton
            color="primary"
            icon="i-lucide-refresh-cw"
            class="min-h-11"
            :loading="retryingAll || isSyncing"
            @click="handleRetryAll"
          >
            Retry All
          </UButton>
        </div>

        <div class="overflow-y-auto flex-1 space-y-3 pr-0.5">
          <div
            v-if="loading && items.length === 0"
            class="py-10 text-center text-sm text-muted"
          >
            Loading sync issues...
          </div>

          <div
            v-else-if="items.length === 0"
            class="py-8 text-center flex flex-col items-center gap-3"
          >
            <div class="size-12 rounded-full bg-success/15 text-success flex items-center justify-center">
              <UIcon
                name="i-lucide-check-circle-2"
                class="size-6"
              />
            </div>
            <div>
              <p class="text-base font-semibold text-highlighted">
                All sync issues resolved!
              </p>
              <p class="text-sm text-muted mt-1">
                Your device is up to date with the cloud.
              </p>
            </div>
            <UButton
              color="primary"
              class="min-h-11 px-6 mt-1"
              @click="conflictsModalOpen = false"
            >
              Done
            </UButton>
          </div>

          <div
            v-for="item in items"
            :key="item.id"
            class="rounded-xl border border-default bg-default p-4 space-y-2.5"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-highlighted truncate">
                  {{ item.entityLabel }}
                </p>
                <p class="text-xs text-muted mt-0.5">
                  {{ item.detailLabel }}
                </p>
              </div>
              <span class="text-xs text-muted shrink-0">
                {{ formatCreatedAt(item.createdAt) }}
              </span>
            </div>

            <div class="rounded-lg bg-error/10 border border-error/20 px-3 py-2 text-xs text-error">
              <span class="font-semibold">Cloud rejected:</span>
              {{ item.errorMessage }}
            </div>

            <div
              v-if="discardConfirmId === item.id"
              class="rounded-lg bg-elevated border border-error/30 p-3 space-y-2.5"
            >
              <p class="text-xs font-medium text-default">
                Discard unsynced change? This change will be permanently deleted from this device and your local numbers will match the cloud. This cannot be undone.
              </p>
              <div class="flex items-center justify-end gap-2">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  class="min-h-11"
                  :disabled="busyId === item.id"
                  @click="discardConfirmId = null"
                >
                  Cancel
                </UButton>
                <UButton
                  size="sm"
                  color="error"
                  class="min-h-11"
                  :loading="busyId === item.id"
                  @click="handleConfirmDiscard(item.id)"
                >
                  Discard change
                </UButton>
              </div>
            </div>

            <div
              v-else
              class="flex items-center justify-between gap-2 pt-1"
            >
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                icon="i-lucide-refresh-cw"
                class="min-h-11"
                :loading="busyId === item.id"
                :disabled="retryingAll"
                @click="handleRetry(item.id)"
              >
                Retry
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                class="min-h-11"
                :disabled="busyId === item.id || retryingAll"
                @click="discardConfirmId = item.id"
              >
                Discard
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
