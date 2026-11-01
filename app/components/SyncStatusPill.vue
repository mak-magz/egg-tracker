<script setup lang="ts">
import { useOnline } from '@vueuse/core'
import { localWorker } from '../local/client'

const isOnline = useOnline()
const { me } = useMe()

const pendingOutboxCount = ref(0)
const syncStatus = ref<'local_only' | 'syncing' | 'synced' | 'offline_changes' | 'offline'>('local_only')

const isFree = computed(() => !me.value?.email)

async function refreshSyncState() {
  if (typeof window === 'undefined') return
  try {
    const res = await localWorker.getSyncStatus()
    pendingOutboxCount.value = res.pendingOutboxCount

    if (!isOnline.value) {
      syncStatus.value = pendingOutboxCount.value > 0 ? 'offline_changes' : 'offline'
      return
    }

    if (isFree.value) {
      syncStatus.value = 'local_only'
      return
    }

    if (pendingOutboxCount.value > 0) {
      syncStatus.value = 'syncing'
      return
    }

    syncStatus.value = 'synced'
  }
  catch {
    syncStatus.value = isOnline.value ? 'local_only' : 'offline'
  }
}

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refreshSyncState()
  timer = setInterval(refreshSyncState, 5000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

watch(isOnline, refreshSyncState)

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
    class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium cursor-default"
  >
    <UIcon
      :name="pillConfig.icon"
      class="size-3.5"
      :class="{ 'animate-spin': syncStatus === 'syncing' }"
    />
    <span class="hidden sm:inline">{{ pillConfig.label }}</span>
  </UBadge>
</template>
