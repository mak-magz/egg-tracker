<script setup lang="ts">
import type { AdminUserItem } from '~/composables/useAdmin'

const admin = useAdmin()
const toast = useToast()

const selectedUser = ref<AdminUserItem | null>(null)
const transferModalOpen = ref(false)

type UserFilterType = 'all' | 'tenant' | 'admin'
const userTypeFilter = ref<UserFilterType>('all')

onMounted(() => {
  admin.fetchUsers()
  if (admin.tenants.value.length === 0) {
    admin.fetchTenants()
  }
})

function onSearch() {
  admin.fetchUsers(admin.userSearch.value)
}

const counts = computed(() => {
  const total = admin.users.value.length
  const admins = admin.users.value.filter(u => Boolean(u.isAdmin)).length
  const tenants = total - admins
  return { total, admins, tenants }
})

const filterPills = computed(() => [
  { id: 'all' as const, label: 'All', count: counts.value.total },
  { id: 'tenant' as const, label: 'Tenant Users', count: counts.value.tenants, icon: 'i-lucide-users' },
  { id: 'admin' as const, label: 'Platform Admins', count: counts.value.admins, icon: 'i-lucide-shield-check' },
])

const displayedUsers = computed(() => {
  let list = admin.users.value
  if (userTypeFilter.value === 'tenant') {
    list = list.filter(u => !u.isAdmin)
  }
  else if (userTypeFilter.value === 'admin') {
    list = list.filter(u => Boolean(u.isAdmin))
  }
  return list
})

function openTransferModal(user: AdminUserItem) {
  selectedUser.value = user
  transferModalOpen.value = true
}

async function handleUnlink(user: AdminUserItem) {
  if (!confirm(`Are you sure you want to unlink ${user.email} from their farm?`)) return
  try {
    const res = await admin.unlinkUser(user.uid)
    toast.add({
      title: res.wasSoleMember ? 'User unlinked (Farm now has no active owner)' : 'User unlinked from farm',
      color: res.wasSoleMember ? 'warning' : 'success',
    })
    admin.fetchUsers()
  }
  catch {
    toast.add({ title: 'Failed to unlink user', color: 'error' })
  }
}

async function handlePasswordReset(user: AdminUserItem) {
  try {
    await admin.resetUserPassword(user.uid)
    toast.add({
      title: `Password reset dispatched to ${user.email}`,
      color: 'success',
    })
  }
  catch {
    toast.add({ title: 'Failed to send password reset', color: 'error' })
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied to clipboard', color: 'success' })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <div class="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <UInput
          v-model="admin.userSearch.value"
          icon="i-lucide-search"
          placeholder="Search email, UID, or farm name..."
          class="w-full sm:max-w-xs"
          @update:model-value="onSearch"
        />

        <!-- Filter tabs / pills -->
        <div
          role="group"
          aria-label="Filter user list"
          class="flex items-center gap-1.5 p-1 rounded-xl bg-muted/20 border border-default/50 self-start sm:self-auto overflow-x-auto max-w-full"
        >
          <UButton
            v-for="pill in filterPills"
            :key="pill.id"
            :icon="pill.icon"
            :color="userTypeFilter === pill.id ? 'primary' : 'neutral'"
            :variant="userTypeFilter === pill.id ? 'subtle' : 'ghost'"
            size="xs"
            class="rounded-lg font-medium cursor-pointer shrink-0"
            :aria-pressed="userTypeFilter === pill.id"
            @click="userTypeFilter = pill.id"
          >
            <span>{{ pill.label }}</span>
            <UBadge
              :color="userTypeFilter === pill.id ? 'primary' : 'neutral'"
              variant="subtle"
              size="xs"
              class="tabular-nums ml-1"
            >
              {{ pill.count }}
            </UBadge>
          </UButton>
        </div>
      </div>

      <span class="text-xs text-muted shrink-0 self-center sm:self-auto">
        Showing {{ displayedUsers.length }} of {{ admin.usersTotal.value }} users
      </span>
    </div>

    <!-- Skeletons -->
    <div
      v-if="admin.usersLoading.value"
      class="space-y-3"
    >
      <USkeleton
        v-for="n in 5"
        :key="n"
        class="h-16 w-full rounded-xl bg-accented"
      />
    </div>

    <!-- Empty State (No users at all / No search matches) -->
    <div
      v-else-if="admin.users.value.length === 0"
      class="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-default"
    >
      <UIcon
        name="i-lucide-users"
        class="size-12 text-muted mb-3"
      />
      <h3 class="text-base font-bold text-highlighted mb-1">
        {{ admin.userSearch.value ? 'No matching users found' : 'No Firebase Auth users found' }}
      </h3>
      <p class="text-sm text-muted max-w-sm mb-4">
        {{ admin.userSearch.value ? `No accounts match "${admin.userSearch.value}".` : 'No registered Firebase accounts exist in this project yet.' }}
      </p>
    </div>

    <!-- Filter Empty State (Users exist, but current pill filter yields 0) -->
    <div
      v-else-if="displayedUsers.length === 0"
      class="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-default"
    >
      <UIcon
        name="i-lucide-filter-x"
        class="size-12 text-muted mb-3"
      />
      <h3 class="text-base font-bold text-highlighted mb-1">
        No users match filter
      </h3>
      <p class="text-sm text-muted max-w-sm mb-4">
        No {{ userTypeFilter === 'admin' ? 'platform admins' : 'tenant users' }} found{{ admin.userSearch.value ? ` matching "${admin.userSearch.value}"` : '' }}.
      </p>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        label="Show All Users"
        @click="userTypeFilter = 'all'"
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
              Email Address
            </th>
            <th class="px-4 py-3">
              UID
            </th>
            <th class="px-4 py-3">
              Verified
            </th>
            <th class="px-4 py-3">
              Farm
            </th>
            <th class="px-4 py-3">
              Registered
            </th>
            <th class="px-4 py-3">
              Last Sign-In
            </th>
            <th class="px-4 py-3 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr
            v-for="user in displayedUsers"
            :key="user.uid"
            class="hover:bg-muted/10 transition-colors"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-highlighted">
                  {{ user.email || '(No email)' }}
                </span>
                <UBadge
                  v-if="user.isAdmin"
                  color="primary"
                  variant="subtle"
                  size="xs"
                  class="inline-flex items-center gap-1 font-medium"
                >
                  <UIcon
                    name="i-lucide-shield-check"
                    class="size-3 shrink-0"
                  />
                  <span>{{ user.adminRole === 'superadmin' ? 'Superadmin' : 'Platform Operator' }}</span>
                </UBadge>
              </div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted">
              <button
                type="button"
                class="hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
                @click="copyText(user.uid)"
              >
                <span>{{ user.uid.slice(0, 8) }}...</span>
                <UIcon
                  name="i-lucide-copy"
                  class="size-3.5"
                />
              </button>
            </td>
            <td class="px-4 py-3">
              <UBadge
                :color="user.emailVerified ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ user.emailVerified ? 'Verified' : 'Unverified' }}
              </UBadge>
            </td>
            <td class="px-4 py-3">
              <span
                v-if="user.isAdmin"
                class="inline-flex items-center gap-1.5 text-xs text-muted"
              >
                <UIcon
                  name="i-lucide-shield"
                  class="size-3.5 text-primary"
                />
                <span class="font-medium text-highlighted">Platform Fleet</span>
              </span>
              <span
                v-else-if="user.farmName"
                class="font-medium text-highlighted"
              >
                {{ user.farmName }}
              </span>
              <UBadge
                v-else
                color="warning"
                variant="subtle"
                size="xs"
              >
                ⚠ Unassigned
              </UBadge>
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              {{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown' }}
            </td>
            <td class="px-4 py-3 text-xs text-muted">
              {{ user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'Never' }}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <template v-if="!user.isAdmin">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :label="user.tenantId ? 'Transfer' : 'Assign'"
                    class="min-h-11 md:min-h-7"
                    @click="openTransferModal(user)"
                  />
                  <UButton
                    v-if="user.tenantId"
                    color="error"
                    variant="ghost"
                    size="xs"
                    label="Unlink"
                    class="min-h-11 md:min-h-7"
                    @click="handleUnlink(user)"
                  />
                </template>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-key-round"
                  title="Send Password Reset"
                  class="min-h-11 md:min-h-7"
                  @click="handlePasswordReset(user)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards View -->
    <div
      v-if="displayedUsers.length > 0"
      class="md:hidden space-y-3"
    >
      <div
        v-for="user in displayedUsers"
        :key="user.uid"
        class="p-4 rounded-2xl border border-default bg-elevated/40 space-y-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-bold text-highlighted text-base truncate">
                {{ user.email || '(No email)' }}
              </h4>
              <UBadge
                v-if="user.isAdmin"
                color="primary"
                variant="subtle"
                size="xs"
                class="inline-flex items-center gap-1 font-medium"
              >
                <UIcon
                  name="i-lucide-shield-check"
                  class="size-3 shrink-0"
                />
                <span>{{ user.adminRole === 'superadmin' ? 'Superadmin' : 'Platform Operator' }}</span>
              </UBadge>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs font-mono text-muted">{{ user.uid.slice(0, 10) }}...</span>
              <button
                type="button"
                class="text-muted hover:text-primary min-h-11 min-w-11 flex items-center justify-center -m-3 cursor-pointer"
                @click="copyText(user.uid)"
              >
                <UIcon
                  name="i-lucide-copy"
                  class="size-4"
                />
              </button>
            </div>
          </div>
          <UBadge
            :color="user.emailVerified ? 'success' : 'neutral'"
            variant="subtle"
            size="xs"
            class="shrink-0"
          >
            {{ user.emailVerified ? 'Verified' : 'Unverified' }}
          </UBadge>
        </div>

        <div class="text-xs text-muted pt-2 border-t border-default/50 space-y-1">
          <div v-if="user.isAdmin">
            Farm:
            <span class="font-medium text-highlighted inline-flex items-center gap-1 ml-1">
              <UIcon
                name="i-lucide-shield"
                class="size-3 text-primary"
              />
              Platform Fleet
            </span>
          </div>
          <div v-else>
            Farm:
            <span
              v-if="user.farmName"
              class="font-semibold text-highlighted ml-1"
            >
              {{ user.farmName }}
            </span>
            <UBadge
              v-else
              color="warning"
              variant="subtle"
              size="xs"
              class="ml-1"
            >
              ⚠ Unassigned
            </UBadge>
          </div>
          <div>Registered: {{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown' }}</div>
          <div>Last Sign-In: {{ user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'Never' }}</div>
        </div>

        <div class="pt-2 flex flex-wrap gap-2 justify-end border-t border-default/50">
          <template v-if="!user.isAdmin">
            <UButton
              color="primary"
              variant="outline"
              size="sm"
              :label="user.tenantId ? 'Transfer Farm' : 'Assign to Farm'"
              class="min-h-11 flex-1"
              @click="openTransferModal(user)"
            />
            <UButton
              v-if="user.tenantId"
              color="error"
              variant="ghost"
              size="sm"
              label="Unlink"
              class="min-h-11"
              @click="handleUnlink(user)"
            />
          </template>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-key-round"
            label="Reset Password"
            class="min-h-11"
            :class="{ 'flex-1': user.isAdmin }"
            @click="handlePasswordReset(user)"
          />
        </div>
      </div>
    </div>

    <!-- User Transfer / Assignment Modal -->
    <AdminUserTransferModal
      v-model:open="transferModalOpen"
      :user="selectedUser"
      @assigned="admin.fetchUsers()"
    />
  </div>
</template>
