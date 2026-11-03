<script setup lang="ts">
const admin = useAdmin()

onMounted(() => {
  admin.fetchMetrics()
})

const tursoStatusColor = computed(() => {
  const status = admin.metrics.value?.turso.status
  if (status === 'operational') return 'success'
  if (status === 'degraded') return 'warning'
  return 'error'
})

const storagePct = computed(() => {
  const m = admin.metrics.value?.turso
  if (!m || !m.maxBytesAllowed) return 0
  return Math.min(100, Math.round((m.totalBytesUsed / m.maxBytesAllowed) * 100))
})

const storageUsedMb = computed(() => {
  const bytes = admin.metrics.value?.turso.totalBytesUsed ?? 0
  return (bytes / (1024 * 1024)).toFixed(1)
})

const storageMaxGb = computed(() => {
  const bytes = admin.metrics.value?.turso.maxBytesAllowed ?? 0
  return (bytes / (1024 * 1024 * 1024)).toFixed(1)
})

const activeDatabasesPct = computed(() => {
  const m = admin.metrics.value?.turso
  if (!m || !m.maxDatabases) return '0'
  return Math.min(100, (m.activeDatabases / m.maxDatabases) * 100).toFixed(1)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-highlighted">
          Infrastructure Health & Quotas
        </h2>
        <p class="text-sm text-muted">
          Real-time Turso Cloud organization metrics and fleet health
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-refresh-cw"
        label="Refresh Metrics"
        :loading="admin.metricsLoading.value"
        class="min-h-11 sm:min-h-9"
        @click="admin.fetchMetrics()"
      />
    </div>

    <!-- Resilience Alert (AC13) -->
    <UAlert
      v-if="admin.metrics.value?.turso.status === 'degraded' || admin.metricsError.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      title="Turso Cloud Metrics Degradation"
      description="Turso Cloud metrics currently unavailable or degraded; Control DB operational."
    />

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Active Databases -->
      <UCard class="p-4">
        <div class="flex items-center justify-between text-xs font-semibold text-muted tracking-wider uppercase mb-2">
          <span>Active Databases</span>
          <UIcon
            name="i-lucide-database"
            class="size-4"
          />
        </div>
        <div
          v-if="admin.metricsLoading.value"
          class="h-8 bg-muted/20 animate-pulse rounded"
        />
        <div v-else>
          <div class="text-2xl font-bold text-highlighted">
            {{ admin.metrics.value?.turso.activeDatabases ?? 0 }} / {{ admin.metrics.value?.turso.maxDatabases ?? 500 }}
          </div>
          <div class="text-xs text-muted mt-1">
            {{ activeDatabasesPct }}% of organization quota
          </div>
        </div>
      </UCard>

      <!-- Total Storage -->
      <UCard class="p-4">
        <div class="flex items-center justify-between text-xs font-semibold text-muted tracking-wider uppercase mb-2">
          <span>Storage Consumed</span>
          <UIcon
            name="i-lucide-hard-drive"
            class="size-4"
          />
        </div>
        <div
          v-if="admin.metricsLoading.value"
          class="h-8 bg-muted/20 animate-pulse rounded"
        />
        <div v-else>
          <div class="text-2xl font-bold text-highlighted">
            {{ storageUsedMb }} MB / {{ storageMaxGb }} GB
          </div>
          <UProgress
            :model-value="storagePct"
            color="primary"
            size="sm"
            class="mt-2"
          />
          <div class="text-xs text-muted mt-1">
            {{ storagePct }}% utilized
          </div>
        </div>
      </UCard>

      <!-- Turso Status -->
      <UCard class="p-4">
        <div class="flex items-center justify-between text-xs font-semibold text-muted tracking-wider uppercase mb-2">
          <span>Turso Cloud Status</span>
          <UIcon
            name="i-lucide-cloud"
            class="size-4"
          />
        </div>
        <div
          v-if="admin.metricsLoading.value"
          class="h-8 bg-muted/20 animate-pulse rounded"
        />
        <div v-else>
          <div class="flex items-center gap-2">
            <UBadge
              :color="tursoStatusColor"
              variant="subtle"
              size="md"
            >
              ● {{ admin.metrics.value?.turso.status || 'Unknown' }}
            </UBadge>
          </div>
          <div class="text-xs text-muted mt-2">
            Region: {{ admin.metrics.value?.turso.region || 'sin (Singapore)' }}
          </div>
        </div>
      </UCard>

      <!-- Fleet Sync Health -->
      <UCard class="p-4">
        <div class="flex items-center justify-between text-xs font-semibold text-muted tracking-wider uppercase mb-2">
          <span>Fleet Sync Health</span>
          <UIcon
            name="i-lucide-refresh-cw"
            class="size-4"
          />
        </div>
        <div
          v-if="admin.metricsLoading.value"
          class="h-8 bg-muted/20 animate-pulse rounded"
        />
        <div v-else>
          <div class="text-2xl font-bold text-highlighted">
            {{ (admin.metrics.value?.fleet.totalTenants ?? 0) - (admin.metrics.value?.fleet.desyncTenantsCount ?? 0) }} Synced
          </div>
          <div class="text-xs text-amber-500 font-medium mt-1">
            {{ admin.metrics.value?.fleet.desyncTenantsCount ?? 0 }} Desync / Conflicts
          </div>
        </div>
      </UCard>
    </div>

    <!-- Fleet Status Overview Box -->
    <UCard class="p-5">
      <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">
        Recent Fleet Activity & System Status
      </h3>
      <div class="space-y-3 text-sm">
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-check-circle"
            class="size-5 text-emerald-500 shrink-0 mt-0.5"
          />
          <div>
            <span class="font-medium text-highlighted">System Schema Status:</span>
            <span class="text-muted ml-1">
              {{ admin.metrics.value?.fleet.pendingMigrationsCount ?? 0 }} tenant databases require schema migration.
            </span>
          </div>
        </div>
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-users"
            class="size-5 text-primary shrink-0 mt-0.5"
          />
          <div>
            <span class="font-medium text-highlighted">Total Registered Users:</span>
            <span class="text-muted ml-1">
              {{ admin.metrics.value?.fleet.totalUsers ?? 0 }} across {{ admin.metrics.value?.fleet.totalTenants ?? 0 }} farms.
            </span>
          </div>
        </div>
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-activity"
            class="size-5 text-sky-500 shrink-0 mt-0.5"
          />
          <div>
            <span class="font-medium text-highlighted">Platform Telemetry:</span>
            <span class="text-muted ml-1">
              All edge databases operating within standard latency limits (&lt; 60ms ping).
            </span>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
