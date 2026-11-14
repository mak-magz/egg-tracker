<script setup lang="ts">
import type { AdminTenantItem } from '~/composables/useAdmin'

const admin = useAdmin()
const toast = useToast()

const selectedTenantId = ref<string | null>(null)
const drawerOpen = ref(false)
const provisionModalOpen = ref(false)

onMounted(() => {
  admin.fetchTenants()
})

const tierOptions = [
  { label: 'All Tiers', value: 'all' },
  { label: 'Premium Tier', value: 'premium' },
  { label: 'Free Tier', value: 'free' },
]

function onSearch() {
  admin.fetchTenants({
    search: admin.tenantFilters.search,
    tier: admin.tenantFilters.tier,
  })
}

function clearFilters() {
  admin.tenantFilters.search = ''
  admin.tenantFilters.tier = 'all'
  admin.fetchTenants()
}

function openTenantDrawer(tenant: AdminTenantItem) {
  selectedTenantId.value = tenant.id
  drawerOpen.value = true
}

function copyToClipboard(text: string, label = 'Copied to clipboard') {
  navigator.clipboard.writeText(text)
  toast.add({
    title: label,
    color: 'success',
  })
}

function onTenantProvisioned() {
  provisionModalOpen.value = false
  admin.fetchTenants()
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <div class="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <UInput
          v-model="admin.tenantFilters.search"
          icon="i-lucide-search"
          placeholder="Search farm, tenant ID, or member..."
          class="w-full sm:max-w-xs"
          @update:model-value="onSearch"
        />
        <USelect
          v-model="admin.tenantFilters.tier"
          :items="tierOptions"
          class="w-full sm:w-44"
          @update:model-value="onSearch"
        />
        <span class="text-xs text-muted self-center">
          Showing {{ admin.tenants.value.length }} of {{ admin.tenantsTotal.value }} farms
        </span>
      </div>

      <UButton
        color="primary"
        size="md"
        icon="i-lucide-plus"
        label="Provision New Farm"
        class="min-h-11 sm:min-h-9 shrink-0"
        @click="provisionModalOpen = true"
      />
    </div>

    <!-- Skeletons -->
    <div
      v-if="admin.tenantsLoading.value"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 5"
        :key="n"
        class="h-16 w-full rounded-xl bg-accented"
      />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="admin.tenants.value.length === 0"
      class="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-default"
    >
      <UIcon
        name="i-lucide-building-2"
        class="size-12 text-muted mb-3"
      />
      <h3 class="text-base font-bold text-highlighted mb-1">
        {{ admin.tenantFilters.search ? 'No matching farms found' : 'No tenant farms registered yet' }}
      </h3>
      <p class="text-sm text-muted max-w-sm mb-4">
        {{ admin.tenantFilters.search ? `No farms match "${admin.tenantFilters.search}".` : 'Click "Provision New Farm" to create your first cloud database and onboard an egg farm.' }}
      </p>
      <UButton
        v-if="admin.tenantFilters.search"
        color="neutral"
        variant="outline"
        size="sm"
        label="Clear Filters"
        @click="clearFilters"
      />
      <UButton
        v-else
        color="primary"
        size="md"
        icon="i-lucide-plus"
        label="Provision New Farm"
        @click="provisionModalOpen = true"
      />
    </div>

    <!-- Desktop Table View -->
    <div
      v-else
      class="hidden md:block overflow-x-auto rounded-2xl border border-default bg-elevated/40"
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
              Tier
            </th>
            <th class="px-4 py-3">
              Tray / Cur
            </th>
            <th class="px-4 py-3">
              Members
            </th>
            <th class="px-4 py-3">
              Database Target
            </th>
            <th class="px-4 py-3">
              Created
            </th>
            <th class="px-4 py-3 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="tenant in admin.tenants.value"
            :key="tenant.id"
            class="hover:bg-muted/10 transition-colors cursor-pointer"
            @click="openTenantDrawer(tenant)"
          >
            <td class="px-4 py-3 font-semibold text-highlighted">
              {{ tenant.name }}
            </td>
            <td
              class="px-4 py-3 font-mono text-xs text-muted"
              @click.stop
            >
              <button
                type="button"
                class="hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
                @click="copyToClipboard(tenant.id, 'Tenant ID copied')"
              >
                <span>{{ tenant.id.slice(0, 8) }}...</span>
                <UIcon
                  name="i-lucide-copy"
                  class="size-3.5"
                />
              </button>
            </td>
            <td class="px-4 py-3">
              <UBadge
                :color="tenant.tier === 'premium' ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ tenant.tier === 'premium' ? 'Premium' : 'Free' }}
              </UBadge>
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              {{ tenant.eggsPerTray }} / {{ tenant.currency }}
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              {{ tenant.memberCount }} {{ tenant.memberCount === 1 ? 'member' : 'members' }}
            </td>
            <td class="px-4 py-3 text-xs font-mono text-muted">
              {{ tenant.dbType === 'turso' ? `tamago-${tenant.id.slice(0, 8)}` : 'file:local' }}
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              {{ new Date(tenant.createdAt).toLocaleDateString() }}
            </td>
            <td
              class="px-4 py-3 text-right"
              @click.stop
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-chevron-right"
                @click="openTenantDrawer(tenant)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards View -->
    <div
      v-if="admin.tenants.value.length > 0"
      class="md:hidden space-y-3"
    >
      <div
        v-for="tenant in admin.tenants.value"
        :key="tenant.id"
        class="p-4 rounded-2xl border border-default bg-elevated/40 space-y-3 cursor-pointer"
        @click="openTenantDrawer(tenant)"
      >
        <div class="flex items-start justify-between">
          <div>
            <h4 class="font-bold text-highlighted text-base">
              {{ tenant.name }}
            </h4>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs font-mono text-muted">{{ tenant.id.slice(0, 10) }}</span>
              <button
                type="button"
                class="text-muted hover:text-primary min-h-11 min-w-11 flex items-center justify-center -m-3 cursor-pointer"
                @click.stop="copyToClipboard(tenant.id, 'Tenant ID copied')"
              >
                <UIcon
                  name="i-lucide-copy"
                  class="size-4"
                />
              </button>
            </div>
          </div>
          <UBadge
            :color="tenant.tier === 'premium' ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ tenant.tier === 'premium' ? 'Premium' : 'Free' }}
          </UBadge>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs text-muted pt-2 border-t border-default/50">
          <div>Settings: {{ tenant.eggsPerTray }} eggs/tray · {{ tenant.currency }}</div>
          <div>Members: {{ tenant.memberCount }}</div>
          <div class="col-span-2 font-mono">
            DB: {{ tenant.dbType === 'turso' ? 'Turso Cloud' : 'Local SQLite' }}
          </div>
        </div>

        <div class="pt-2 flex justify-end">
          <UButton
            color="primary"
            variant="ghost"
            size="sm"
            label="View Details >"
            class="min-h-11"
            @click.stop="openTenantDrawer(tenant)"
          />
        </div>
      </div>
    </div>

    <!-- Details Inspector Drawer -->
    <AdminTenantDrawer
      v-model:open="drawerOpen"
      :tenant-id="selectedTenantId"
      @settings-updated="admin.fetchTenants()"
    />

    <!-- Provisioning Modal -->
    <AdminTenantProvisionModal
      v-model:open="provisionModalOpen"
      @provisioned="onTenantProvisioned"
    />
  </div>
</template>
