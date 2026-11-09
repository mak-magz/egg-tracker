<script setup lang="ts">
import { computed } from 'vue'
import { useSync } from '../composables/useSync'

const { syncStatus, pendingOutboxCount, triggerSync } = useSync()

const isSpinning = computed(() => syncStatus.value === 'syncing')

function handleTap() {
  void triggerSync()
}

const pillConfig = computed(() => {
  switch (syncStatus.value) {
    case 'offline':
      return {
        label: 'Offline',
        icon: 'i-lucide-wifi-off',
        color: 'neutral' as const,
        variant: 'subtle' as const,
      }
    case 'offline_changes':
      return {
        label: `${pendingOutboxCount.value} saved offline`,
        icon: 'i-lucide-cloud-off',
        color: 'warning' as const,
        variant: 'subtle' as const,
      }
    case 'syncing':
      return {
        label: 'Syncing...',
        icon: 'i-lucide-refresh-cw',
        color: 'primary' as const,
        variant: 'subtle' as const,
      }
    case 'synced':
      return {
        label: 'Cloud synced',
        icon: 'i-lucide-cloud',
        color: 'success' as const,
        variant: 'subtle' as const,
      }
    case 'error':
      return {
        label: pendingOutboxCount.value > 0 ? `${pendingOutboxCount.value} unsynced (error)` : 'Sync error',
        icon: 'i-lucide-alert-triangle',
        color: 'error' as const,
        variant: 'subtle' as const,
      }
    case 'local_only':
    default:
      return {
        label: 'Local storage',
        icon: 'i-lucide-hard-drive',
        color: 'neutral' as const,
        variant: 'subtle' as const,
      }
  }
})
</script>

<template>
  <UBadge
    size="sm"
    :color="pillConfig.color"
    :variant="pillConfig.variant"
    class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium cursor-pointer select-none transition-opacity active:opacity-75"
    @click="handleTap"
  >
    <UIcon
      :name="pillConfig.icon"
      class="size-3.5"
      :class="{ 'animate-spin': isSpinning }"
    />
    <span class="hidden sm:inline">{{ pillConfig.label }}</span>
  </UBadge>
</template>
