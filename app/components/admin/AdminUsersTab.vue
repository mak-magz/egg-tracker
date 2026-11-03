<script setup lang="ts">
import type { AdminUserItem } from '~/composables/useAdmin'

const admin = useAdmin()
const toast = useToast()

const selectedUser = ref<AdminUserItem | null>(null)
const transferModalOpen = ref(false)

onMounted(() => {
  admin.fetchUsers()
  if (admin.tenants.value.length === 0) {
    admin.fetchTenants()
  }
})

function onSearch() {
  admin.fetchUsers(admin.userSearch.value)
}

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
    <div class="flex items-center justify-between gap-3">
      <UInput
        v-model="admin.userSearch.value"
        icon="i-lucide-search"
        placeholder="Search email, UID, or farm name..."
        class="w-full sm:max-w-md"
        @update:model-value="onSearch"
      />
      <span class="text-xs text-muted">
        Showing {{ admin.users.value.length }} of {{ admin.usersTotal.value }} users
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

    <!-- Empty State -->
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
              Assigned Farm
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
            v-for="user in admin.users.value"
            :key="user.uid"
            class="hover:bg-muted/10 transition-colors"
          >
            <td class="px-4 py-3 font-semibold text-highlighted">
              {{ user.email || '(No email)' }}
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
                v-if="user.farmName"
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
      v-if="admin.users.value.length > 0"
      class="md:hidden space-y-3"
    >
      <div
        v-for="user in admin.users.value"
        :key="user.uid"
        class="p-4 rounded-2xl border border-default bg-elevated/40 space-y-3"
      >
        <div class="flex items-start justify-between">
          <div>
            <h4 class="font-bold text-highlighted text-base">
              {{ user.email }}
            </h4>
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
          >
            {{ user.emailVerified ? 'Verified' : 'Unverified' }}
          </UBadge>
        </div>

        <div class="text-xs text-muted pt-2 border-t border-default/50 space-y-1">
          <div>Farm: <span class="font-semibold text-highlighted">{{ user.farmName || 'Unassigned' }}</span></div>
          <div>Registered: {{ user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown' }}</div>
        </div>

        <div class="pt-2 flex flex-wrap gap-2 justify-end border-t border-default/50">
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
