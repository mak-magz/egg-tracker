<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSync } from '../composables/useSync'

const {
  syncStatus,
  pendingOutboxCount,
  failedCount,
  lastSyncedAt,
  isSyncing,
  triggerSync,
  openConflictsModal,
} = useSync()

const popoverOpen = ref(false)

const pillConfig = computed(() => {
  if (failedCount.value > 0) {
    return {
      label: `${failedCount.value} sync issue${failedCount.value === 1 ? '' : 's'}`,
      statusText: 'Action required',
      icon: 'i-lucide-alert-circle',
      color: 'error' as const,
      variant: 'subtle' as const,
    }
  }

  switch (syncStatus.value) {
    case 'offline':
      return {
        label: 'Offline',
        statusText: 'Offline',
        icon: 'i-lucide-wifi-off',
        color: 'neutral' as const,
        variant: 'subtle' as const,
      }
    case 'offline_changes':
      return {
        label: `${pendingOutboxCount.value} saved offline`,
        statusText: 'Offline with pending edits',
        icon: 'i-lucide-cloud-off',
        color: 'warning' as const,
        variant: 'subtle' as const,
      }
    case 'syncing':
      return {
        label: 'Syncing...',
        statusText: 'Syncing to cloud',
        icon: 'i-lucide-refresh-cw',
        color: 'primary' as const,
        variant: 'subtle' as const,
      }
    case 'synced':
      return {
        label: 'Cloud synced',
        statusText: 'Connected to cloud',
        icon: 'i-lucide-cloud',
        color: 'success' as const,
        variant: 'subtle' as const,
      }
    case 'error':
      return {
        label: pendingOutboxCount.value > 0 ? `${pendingOutboxCount.value} unsynced (error)` : 'Sync error',
        statusText: 'Sync connection error',
        icon: 'i-lucide-alert-triangle',
        color: 'error' as const,
        variant: 'subtle' as const,
      }
    case 'local_only':
    default:
      return {
        label: 'Local storage',
        statusText: 'Local offline device',
        icon: 'i-lucide-hard-drive',
        color: 'neutral' as const,
        variant: 'subtle' as const,
      }
  }
})

const formattedLastSynced = computed(() => {
  if (!lastSyncedAt.value) return 'Never'
  try {
    const d = new Date(lastSyncedAt.value)
    if (Number.isNaN(d.getTime())) return 'Never'
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  catch {
    return 'Never'
  }
})

function handleSyncNow() {
  void triggerSync()
}

function handleOpenIssues() {
  popoverOpen.value = false
  openConflictsModal()
}
</script>

<template>
  <UPopover
    v-model:open="popoverOpen"
    :content="{ side: 'bottom', align: 'end', sideOffset: 8 }"
  >
    <button
      type="button"
      aria-label="Sync status"
      class="inline-flex min-h-11 md:min-h-9 items-center focus-visible:outline-2 focus-visible:outline-primary rounded-full"
    >
      <UBadge
        size="sm"
        :color="pillConfig.color"
        :variant="pillConfig.variant"
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium cursor-pointer select-none transition-opacity active:opacity-75"
      >
        <UIcon
          :name="pillConfig.icon"
          class="size-3.5"
          :class="{ 'animate-spin': isSyncing && failedCount === 0 }"
        />
        <span class="hidden sm:inline">{{ pillConfig.label }}</span>
        <span
          v-if="failedCount > 0"
          class="sm:hidden font-bold"
        >
          {{ failedCount }}
        </span>
      </UBadge>
    </button>

    <template #content>
      <div class="w-72 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">
            Cloud Sync Status
          </span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="xs"
            aria-label="Close popover"
            @click="popoverOpen = false"
          />
        </div>

        <div class="space-y-1.5 text-xs">
          <div class="flex items-center justify-between gap-2">
            <span class="text-muted">Connection</span>
            <span class="font-medium text-highlighted">{{ pillConfig.statusText }}</span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-muted">Last synced</span>
            <span class="font-medium text-default">{{ formattedLastSynced }}</span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-muted">Pending queue</span>
            <span class="font-medium text-default">{{ pendingOutboxCount }} waiting</span>
          </div>
        </div>

        <div
          v-if="failedCount > 0"
          class="rounded-lg bg-error/10 border border-error/20 p-2.5 space-y-2"
        >
          <p class="text-xs text-error font-medium">
            {{ failedCount }} change{{ failedCount === 1 ? '' : 's' }} could not be synced to the cloud.
          </p>
          <UButton
            color="error"
            size="sm"
            block
            class="min-h-11 justify-center"
            icon="i-lucide-wrench"
            @click="handleOpenIssues"
          >
            Review Sync Issues ({{ failedCount }})
          </UButton>
        </div>

        <UButton
          v-if="syncStatus !== 'local_only'"
          color="neutral"
          variant="outline"
          size="sm"
          block
          class="min-h-11 justify-center"
          icon="i-lucide-refresh-cw"
          :loading="isSyncing"
          @click="handleSyncNow"
        >
          Sync Now
        </UButton>
      </div>
    </template>
  </UPopover>
</template>
