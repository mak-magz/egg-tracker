<script setup lang="ts">
import type { AdminSyncTelemetryItem } from '~/composables/useAdmin'

const admin = useAdmin()

const selectedTenantId = ref<string | null>(null)
const inspectorOpen = ref(false)

onMounted(() => {
  admin.fetchSyncTelemetry()
})

function openInspector(item: AdminSyncTelemetryItem) {
  selectedTenantId.value = item.tenantId
  inspectorOpen.value = true
}

function healthColor(h: string) {
  if (h === 'synced') return 'success'
  if (h === 'idle') return 'neutral'
  if (h === 'conflict') return 'warning'
  return 'error'
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-base font-bold text-highlighted">
          Cloud Sync Telemetry
        </h3>
        <p class="text-xs text-muted">
          Change log versions, active devices, and edge replication health
        </p>
      </div>

      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-refresh-cw"
        label="Refresh"
        :loading="admin.syncLoading.value"
        class="min-h-11 sm:min-h-9"
        @click="admin.fetchSyncTelemetry"
      />
    </div>

    <!-- Skeletons -->
    <div
      v-if="admin.syncLoading.value"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 4"
        :key="n"
        class="h-16 w-full rounded-xl bg-accented"
      />
    </div>

    <!-- Table -->
    <div
      v-else
      class="overflow-x-auto rounded-2xl border border-default bg-elevated/40"
    >
      <table class="w-full text-left text-sm">
        <thead class="border-b border-default bg-muted/20 text-xs font-semibold text-muted uppercase tracking-wider">
          <tr>
            <th class="px-4 py-3">
              Farm Name
            </th>
            <th class="px-4 py-3">
              CDC Version
            </th>
            <th class="px-4 py-3">
              Active Devices
            </th>
            <th class="px-4 py-3">
              Last Push
            </th>
            <th class="px-4 py-3">
              Health
            </th>
            <th class="px-4 py-3 text-right">
              Inspector
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="item in admin.syncTelemetry.value"
            :key="item.tenantId"
            class="hover:bg-muted/10 transition-colors cursor-pointer"
            @click="openInspector(item)"
          >
            <td class="px-4 py-3 font-semibold text-highlighted">
              {{ item.farmName }}
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted">
              v{{ item.changeLogVersion }}
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              {{ item.activeDevices30d }} {{ item.activeDevices30d === 1 ? 'device' : 'devices' }}
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              <span v-if="item.lastPush">
                {{ new Date(item.lastPush.timestamp).toLocaleTimeString() }} ({{ item.lastPush.deviceId }})
              </span>
              <span
                v-else
                class="text-muted/60"
              >Never</span>
            </td>
            <td class="px-4 py-3">
              <UBadge
                :color="healthColor(item.health)"
                variant="subtle"
                size="xs"
              >
                ● {{ item.health }}
              </UBadge>
            </td>
            <td
              class="px-4 py-3 text-right"
              @click.stop
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-search"
                label="Drill Down"
                class="min-h-11 md:min-h-7"
                @click="openInspector(item)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Sync Inspector Drawer -->
    <AdminSyncInspectorDrawer
      v-model:open="inspectorOpen"
      :tenant-id="selectedTenantId"
    />
  </div>
</template>
