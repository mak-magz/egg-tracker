<script setup lang="ts">
import { signOut as firebaseSignOut } from 'firebase/auth'

defineProps<{
  tab: string
}>()

const emit = defineEmits<{
  'update:tab': [val: string]
}>()

const router = useRouter()
const auth = useFirebaseAuth()
const operatorEmail = computed(() => auth?.currentUser?.email ?? 'operator@tamago.farm')
const admin = useAdmin()

async function handleSignOut() {
  if (auth) {
    await firebaseSignOut(auth)
  }
  await router.push('/admin/login')
}

const pendingMigrations = computed(() => admin.metrics.value?.fleet.pendingMigrationsCount ?? 0)

const tabs = computed(() => [
  { id: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { id: 'tenants', label: 'Tenants', icon: 'i-lucide-building-2' },
  { id: 'users', label: 'Auth Users', icon: 'i-lucide-users' },
  {
    id: 'migrations',
    label: pendingMigrations.value > 0 ? `Migrations (${pendingMigrations.value})` : 'Migrations',
    icon: 'i-lucide-database-zap',
  },
  { id: 'sync', label: 'Sync Telemetry', icon: 'i-lucide-refresh-cw' },
  { id: 'audit', label: 'Audit Log', icon: 'i-lucide-scroll' },
])
</script>

<template>
  <header class="border-b border-default bg-elevated/40 backdrop-blur-md sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/admin"
            class="flex items-center gap-2 group"
          >
            <span class="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 font-bold select-none">
              🍳
            </span>
            <div class="flex flex-col">
              <span class="font-bold text-highlighted tracking-tight text-base sm:text-lg flex items-center gap-2">
                Tamago Control Plane
                <UBadge
                  :color="admin.metrics.value?.turso.isLocalDev ? 'neutral' : 'success'"
                  variant="subtle"
                  size="xs"
                >
                  {{ admin.metrics.value?.turso.isLocalDev ? 'Local Dev' : 'Production Cloud' }}
                </UBadge>
              </span>
              <span class="text-xs text-muted hidden sm:inline">Operator Fleet Administration</span>
            </div>
          </NuxtLink>
        </div>

        <div class="flex items-center gap-4">
          <span class="text-xs text-muted hidden md:inline">
            Operator: <span class="text-highlighted font-medium">{{ operatorEmail }}</span>
          </span>
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-arrow-left"
            label="Back to Farm App"
            class="min-h-11 md:min-h-9"
          />
          <UButton
            color="neutral"
            variant="subtle"
            size="sm"
            icon="i-lucide-log-out"
            label="Sign Out"
            class="min-h-11 md:min-h-9"
            @click="handleSignOut"
          />
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex space-x-1 overflow-x-auto py-2 border-t border-default/50 scrollbar-none">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          class="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 min-h-11 cursor-pointer"
          :class="tab === item.id ? 'bg-primary/15 text-primary' : 'text-muted hover:text-highlighted hover:bg-muted/10'"
          @click="emit('update:tab', item.id)"
        >
          <UIcon
            :name="item.icon"
            class="size-4.5"
          />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
  </header>
</template>
