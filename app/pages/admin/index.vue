<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
  layout: false,
  auth: 'public',
})

useHead({
  title: 'Control Plane · Tamago Admin',
})

const route = useRoute()
const router = useRouter()
const admin = useAdmin()

const currentTab = computed({
  get: () => (route.query.tab as string) || 'overview',
  set: (val: string) => {
    router.replace({ query: { ...route.query, tab: val } })
  },
})

onMounted(() => {
  if (!admin.accessDenied.value) {
    admin.fetchMetrics(true)
  }
})
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <AdminAccessDenied v-if="admin.accessDenied.value" />

    <template v-else>
      <AdminNavShell v-model:tab="currentTab" />

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AdminOverviewTab v-if="currentTab === 'overview'" />
        <AdminTenantsTab v-else-if="currentTab === 'tenants'" />
        <AdminUsersTab v-else-if="currentTab === 'users'" />
        <AdminMigrationsTab v-else-if="currentTab === 'migrations'" />
        <AdminSyncTelemetryTab v-else-if="currentTab === 'sync'" />
        <AdminAuditLogsTab v-else-if="currentTab === 'audit'" />
      </main>
    </template>
  </div>
</template>
