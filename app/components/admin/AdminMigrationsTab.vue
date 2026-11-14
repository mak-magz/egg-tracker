<script setup lang="ts">
import { sheetUi } from '~/utils/sheet-ui'
import type { AdminBatchMigrationResponse } from '~/composables/useAdmin'

const admin = useAdmin()
const toast = useToast()

const batchRunning = ref(false)
const batchModalOpen = ref(false)
const batchResult = ref<AdminBatchMigrationResponse | null>(null)

onMounted(() => {
  admin.fetchMigrations()
})

const pendingCount = computed(() => admin.migrations.value?.fleetSummary.pending ?? 0)

async function runBatch() {
  batchRunning.value = true
  batchModalOpen.value = true
  batchResult.value = null
  try {
    const res = await admin.runBatchMigrations()
    batchResult.value = res
    if (res.failed === 0) {
      toast.add({
        title: `Successfully migrated ${res.successful} databases`,
        color: 'success',
      })
    }
    else {
      toast.add({
        title: `Migrations finished: ${res.successful} succeeded, ${res.failed} failed`,
        color: res.successful > 0 ? 'warning' : 'error',
      })
    }
    admin.fetchMigrations()
  }
  catch {
    toast.add({
      title: 'Batch migration failed',
      color: 'error',
    })
  }
  finally {
    batchRunning.value = false
  }
}

async function runSingle(tenantId: string) {
  try {
    const res = await admin.runSingleMigration(tenantId)
    if (res && !res.success) {
      toast.add({
        title: 'Migration failed on tenant database',
        description: res.error || 'Migration failed',
        color: 'error',
      })
    }
    else {
      toast.add({ title: 'Migration applied to tenant database', color: 'success' })
    }
  }
  catch (err: unknown) {
    const errObj = err as { data?: { message?: string, data?: { message?: string } }, message?: string }
    const description = errObj?.data?.message || errObj?.data?.data?.message || errObj?.message || 'Migration failed on tenant database'
    toast.add({
      title: 'Migration failed on tenant database',
      description,
      color: 'error',
    })
  }
  finally {
    admin.fetchMigrations()
  }
}

const modalUi = sheetUi(520)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <div>
        <h3 class="text-base font-bold text-highlighted">
          Fleet Schema Migrations
        </h3>
        <p class="text-xs text-muted">
          Current System Version: <span class="font-mono text-highlighted">{{ admin.migrations.value?.systemVersion || 'v1.0.0-full-schema' }}</span>
          · {{ admin.migrations.value?.fleetSummary.upToDate ?? 0 }} of {{ admin.migrations.value?.fleetSummary.total ?? 0 }} up to date
        </p>
      </div>

      <UButton
        color="primary"
        size="md"
        icon="i-lucide-play"
        label="Run Migrations on All Tenants"
        :loading="batchRunning"
        :disabled="pendingCount === 0"
        class="min-h-11 sm:min-h-9"
        @click="runBatch"
      />
    </div>

    <!-- Alert if migrations pending -->
    <UAlert
      v-if="pendingCount > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-alert-circle"
      :title="`${pendingCount} Tenant Databases Require Migration`"
      description="New DDL tables or schema versions have not yet been applied to all farm databases."
    />

    <!-- Skeletons -->
    <div
      v-if="admin.migrationsLoading.value"
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
              Tenant ID
            </th>
            <th class="px-4 py-3">
              Current Version
            </th>
            <th class="px-4 py-3">
              Status
            </th>
            <th class="px-4 py-3">
              Last Error
            </th>
            <th class="px-4 py-3 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="t in admin.migrations.value?.tenants"
            :key="t.tenantId"
            class="hover:bg-muted/10 transition-colors"
          >
            <td class="px-4 py-3 font-semibold text-highlighted">
              {{ t.farmName }}
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted">
              {{ t.tenantId.slice(0, 8) }}...
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted">
              {{ t.currentVersion }}
            </td>
            <td class="px-4 py-3">
              <UBadge
                :color="t.status === 'up_to_date' ? 'success' : t.status === 'pending' ? 'warning' : 'error'"
                variant="subtle"
                size="xs"
              >
                {{ t.status === 'up_to_date' ? '✓ Up to date' : t.status === 'pending' ? '⚠ Pending' : '✕ Error' }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-xs text-red-400 font-mono max-w-xs truncate">
              {{ t.lastError || '-' }}
            </td>
            <td class="px-4 py-3 text-right">
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                :label="t.status === 'up_to_date' ? 'Re-apply' : 'Apply Migration'"
                class="min-h-11 md:min-h-7"
                @click="runSingle(t.tenantId)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Batch Progress / Completion Modal -->
    <UModal
      v-model:open="batchModalOpen"
      title="Fleet Schema Migration Batch Runner"
      :ui="modalUi"
    >
      <template #content>
        <div class="p-6 space-y-4">
          <div
            v-if="batchRunning"
            class="text-center py-6 space-y-3"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="size-10 animate-spin text-primary mx-auto"
            />
            <div class="text-sm font-semibold text-highlighted">
              Applying schema migrations sequentially across tenant databases...
            </div>
            <p class="text-xs text-muted">
              Please keep this window open until execution completes.
            </p>
          </div>

          <div
            v-else-if="batchResult"
            class="space-y-4"
          >
            <div
              class="p-3.5 rounded-xl border text-sm"
              :class="batchResult.failed === 0
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : batchResult.successful > 0
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  : 'bg-red-500/10 text-red-500 border-red-500/20'"
            >
              <span class="font-bold">Execution Finished:</span>
              {{ batchResult.successful }} succeeded, {{ batchResult.failed }} failed out of {{ batchResult.totalMigrated }} total.
            </div>

            <div class="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
              <div
                v-for="res in batchResult.results"
                :key="res.tenantId"
                class="flex items-center justify-between p-2 rounded border border-default/50"
              >
                <span>{{ res.farmName }}</span>
                <UBadge
                  :color="res.success ? 'success' : 'error'"
                  variant="subtle"
                  size="xs"
                >
                  {{ res.success ? '✓ Migrated' : '✕ ' + (res.error || 'Failed') }}
                </UBadge>
              </div>
            </div>

            <UButton
              color="primary"
              size="md"
              block
              label="Close"
              class="min-h-11"
              @click="batchModalOpen = false"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
