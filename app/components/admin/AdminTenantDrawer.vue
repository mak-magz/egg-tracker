<script setup lang="ts">
import { detailUi } from '~/utils/sheet-ui'
import type { AdminTenantDetail, AdminTestConnectionResponse } from '~/composables/useAdmin'

const props = defineProps<{
  tenantId?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  'settings-updated': []
}>()

const admin = useAdmin()
const toast = useToast()

const loading = ref(false)
const details = ref<AdminTenantDetail | null>(null)

const testing = ref(false)
const testResult = ref<AdminTestConnectionResponse | null>(null)

const editing = ref(false)
const editState = reactive({
  name: '',
  tier: 'premium' as 'free' | 'premium',
  eggsPerTray: 30,
  currency: 'PHP',
})

watch(() => props.tenantId, async (id) => {
  if (!id) return
  loading.value = true
  testResult.value = null
  editing.value = false
  try {
    const res = await admin.fetchTenantDetails(id)
    details.value = res
    editState.name = res.tenant.name
    editState.tier = res.tenant.tier
    editState.eggsPerTray = res.tenant.eggsPerTray
    editState.currency = res.tenant.currency
  }
  finally {
    loading.value = false
  }
})

async function runPing() {
  if (!props.tenantId) return
  testing.value = true
  try {
    const res = await admin.testConnection(props.tenantId)
    testResult.value = res
  }
  finally {
    testing.value = false
  }
}

async function saveSettings() {
  if (!props.tenantId) return
  try {
    await admin.updateTenantSettings(props.tenantId, {
      name: editState.name,
      tier: editState.tier,
      eggsPerTray: Number(editState.eggsPerTray),
      currency: editState.currency,
    })
    toast.add({
      title: 'Farm settings updated',
      color: 'success',
    })
    editing.value = false
    emit('settings-updated')
  }
  catch {
    toast.add({
      title: 'Failed to update farm settings',
      color: 'error',
    })
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied to clipboard', color: 'success' })
}

const ui = detailUi()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="details ? `Tenant Inspector: ${details.tenant.name}` : 'Tenant Inspector'"
    :ui="ui"
  >
    <template #content>
      <div
        v-if="loading"
        class="p-6 space-y-4"
      >
        <USkeleton class="h-8 w-3/4 rounded" />
        <USkeleton class="h-32 w-full rounded-xl" />
        <USkeleton class="h-32 w-full rounded-xl" />
      </div>

      <div
        v-else-if="details"
        class="p-6 space-y-6 overflow-y-auto max-h-[85vh]"
      >
        <!-- Metadata -->
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-muted mb-2">
            Metadata
          </h4>
          <div class="rounded-xl border border-default p-4 space-y-2 text-sm bg-elevated/40">
            <div class="flex items-center justify-between">
              <span class="text-muted">Tenant ID:</span>
              <button
                type="button"
                class="font-mono text-xs hover:text-primary flex items-center gap-1 min-h-11 md:min-h-7 cursor-pointer"
                @click="copyText(details.tenant.id)"
              >
                <span>{{ details.tenant.id }}</span>
                <UIcon
                  name="i-lucide-copy"
                  class="size-3.5"
                />
              </button>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Created:</span>
              <span>{{ new Date(details.tenant.createdAt).toLocaleString() }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Tier:</span>
              <UBadge
                :color="details.tenant.tier === 'premium' ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ details.tenant.tier === 'premium' ? 'Premium Tier' : 'Free Tier' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Settings:</span>
              <span>{{ details.tenant.eggsPerTray }} eggs/tray · {{ details.tenant.currency }}</span>
            </div>
          </div>
        </div>

        <!-- Database Connection -->
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-muted mb-2">
            Database Connection
          </h4>
          <div class="rounded-xl border border-default p-4 space-y-3 text-sm bg-elevated/40">
            <div class="flex items-center justify-between">
              <span class="text-muted">Target:</span>
              <span class="font-medium text-highlighted">{{ details.tenant.dbUrl.startsWith('file:') ? 'Local SQLite File DB' : 'Turso Cloud Edge Database' }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Endpoint:</span>
              <button
                type="button"
                class="font-mono text-xs hover:text-primary flex items-center gap-1 min-h-11 md:min-h-7 cursor-pointer"
                @click="copyText(details.tenant.dbUrl)"
              >
                <span>{{ details.tenant.dbUrl }}</span>
                <UIcon
                  name="i-lucide-copy"
                  class="size-3.5"
                />
              </button>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Token Status:</span>
              <UBadge
                :color="details.tenant.hasToken ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ details.tenant.hasToken ? '● Configured' : '○ Local Dev (None)' }}
              </UBadge>
            </div>

            <!-- Ping Connection Action -->
            <div class="pt-2 flex items-center justify-between">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-zap"
                label="Test Connection"
                :loading="testing"
                class="min-h-11 md:min-h-8"
                @click="runPing"
              />
              <div v-if="testResult">
                <UBadge
                  v-if="testResult.connected"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  ● Connected ({{ testResult.latencyMs }}ms)
                </UBadge>
                <UBadge
                  v-else
                  color="error"
                  variant="subtle"
                  size="sm"
                >
                  ✕ {{ testResult.error || 'Connection Failed' }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>

        <!-- Linked Members -->
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-muted mb-2">
            Linked Members ({{ details.members.length }})
          </h4>
          <div
            v-if="details.members.length === 0"
            class="text-xs text-muted p-4 border border-default rounded-xl"
          >
            No active members linked to this farm.
          </div>
          <div
            v-else
            class="space-y-2"
          >
            <div
              v-for="member in details.members"
              :key="member.userId"
              class="rounded-xl border border-default p-3 text-xs bg-elevated/40 space-y-1"
            >
              <div class="flex items-center justify-between font-semibold text-highlighted">
                <span>{{ member.email || 'No Email' }}</span>
                <UBadge
                  color="primary"
                  variant="subtle"
                  size="xs"
                >
                  {{ member.role }}
                </UBadge>
              </div>
              <div class="flex items-center justify-between text-muted font-mono">
                <span>UID: {{ member.userId.slice(0, 10) }}...</span>
                <span>Joined {{ new Date(member.createdAt).toLocaleDateString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Edit Farm Settings Form -->
        <div class="pt-2 border-t border-default">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-muted">
              Farm Configuration
            </h4>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              :label="editing ? 'Cancel' : 'Edit Settings'"
              class="min-h-11 md:min-h-7"
              @click="editing = !editing"
            />
          </div>

          <div
            v-if="editing"
            class="space-y-3 p-4 rounded-xl border border-default bg-elevated/40"
          >
            <div>
              <label class="text-xs font-medium text-muted block mb-1">Farm Name</label>
              <UInput
                v-model="editState.name"
                class="w-full"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-muted block mb-1">Eggs Per Tray</label>
                <UInput
                  v-model="editState.eggsPerTray"
                  type="number"
                  inputmode="numeric"
                  class="w-full"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-muted block mb-1">Currency Code</label>
                <UInput
                  v-model="editState.currency"
                  class="w-full uppercase"
                />
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-muted block mb-1">Subscription Tier</label>
              <div class="flex gap-4">
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    v-model="editState.tier"
                    type="radio"
                    value="premium"
                  >
                  Premium
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    v-model="editState.tier"
                    type="radio"
                    value="free"
                  >
                  Free
                </label>
              </div>
            </div>
            <UButton
              color="primary"
              size="sm"
              block
              label="Save Settings"
              class="min-h-11 md:min-h-8 mt-2"
              @click="saveSettings"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
