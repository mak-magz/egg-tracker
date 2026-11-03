<script setup lang="ts">
const admin = useAdmin()

const search = ref('')

onMounted(() => {
  admin.fetchAuditLogs(1, 50)
})

function onSearch() {
  admin.fetchAuditLogs(1, 50, search.value)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search operator email, action type, or target ID..."
        class="w-full sm:max-w-md"
        @update:model-value="onSearch"
      />
      <span class="text-xs text-muted">
        Showing {{ admin.auditLogs.value.length }} of {{ admin.auditTotal.value }} actions
      </span>
    </div>

    <!-- Skeletons -->
    <div
      v-if="admin.auditLoading.value"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 5"
        :key="n"
        class="h-14 w-full rounded-xl bg-accented"
      />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="admin.auditLogs.value.length === 0"
      class="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-default"
    >
      <UIcon
        name="i-lucide-scroll"
        class="size-12 text-muted mb-3"
      />
      <h3 class="text-base font-bold text-highlighted mb-1">
        No administrative actions recorded yet
      </h3>
      <p class="text-sm text-muted max-w-sm">
        All operator actions (provisioning, settings updates, user reassignments) will be logged here.
      </p>
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
              Timestamp
            </th>
            <th class="px-4 py-3">
              Operator
            </th>
            <th class="px-4 py-3">
              Action Type
            </th>
            <th class="px-4 py-3">
              Target ID
            </th>
            <th class="px-4 py-3">
              Summary
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="log in admin.auditLogs.value"
            :key="log.id"
            class="hover:bg-muted/10 transition-colors"
          >
            <td class="px-4 py-3 text-xs text-muted">
              {{ new Date(log.createdAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3 font-medium text-highlighted">
              {{ log.operatorEmail }}
            </td>
            <td class="px-4 py-3">
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
              >
                {{ log.actionType }}
              </UBadge>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted">
              {{ log.targetId.slice(0, 10) }}...
            </td>
            <td class="px-4 py-3 text-sm text-highlighted">
              {{ log.summary }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
