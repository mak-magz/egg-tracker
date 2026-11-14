<script setup lang="ts">
import { detailUi } from '~/utils/sheet-ui'
import type { AdminChangeLogItem, AdminSyncIssueItem } from '~/composables/useAdmin'

const props = defineProps<{
  tenantId?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })

const admin = useAdmin()
const toast = useToast()

const activeSubTab = ref<'changelog' | 'issues'>('changelog')
const loading = ref(false)
const changes = ref<AdminChangeLogItem[]>([])
const issues = ref<AdminSyncIssueItem[]>([])
const resetting = ref(false)

const entityFilter = ref('all')
const deviceFilter = ref('all')

const entityOptions = [
  { label: 'All Entities', value: 'all' },
  { label: 'Production', value: 'production' },
  { label: 'Sales', value: 'sales' },
  { label: 'Orders', value: 'orders' },
  { label: 'Clients', value: 'clients' },
  { label: 'Sizes', value: 'sizes' },
]

async function loadData() {
  if (!props.tenantId) return
  loading.value = true
  try {
    const [changeRes, issueRes] = await Promise.all([
      admin.fetchChangeLog(props.tenantId, 1, 50, entityFilter.value, deviceFilter.value),
      admin.fetchSyncIssues(props.tenantId),
    ])
    changes.value = changeRes.changes
    issues.value = issueRes.issues
  }
  finally {
    loading.value = false
  }
}

watch(() => props.tenantId, () => {
  if (props.tenantId) loadData()
})

async function triggerSnapshotReset() {
  if (!props.tenantId) return
  if (!confirm('Prepare fresh sync snapshot baseline for this tenant? Client devices will rebase upon next connection.')) return
  resetting.value = true
  try {
    const res = await admin.prepareFreshSnapshot(props.tenantId)
    toast.add({
      title: `Fresh snapshot baseline prepared (v${res.baseVersion})`,
      color: 'success',
    })
    loadData()
  }
  catch {
    toast.add({ title: 'Failed to prepare sync snapshot', color: 'error' })
  }
  finally {
    resetting.value = false
  }
}

const ui = detailUi()
</script>

<template>
  <UModal
    v-model:open="open"
    title="Sync Inspector & Change Log Stream"
    :ui="ui"
  >
    <template #content>
      <div class="p-6 space-y-4 overflow-y-auto max-h-[85vh]">
        <!-- Sub-tabs -->
        <div class="flex items-center justify-between border-b border-default pb-3">
          <div class="flex gap-2">
            <UButton
              :color="activeSubTab === 'changelog' ? 'primary' : 'neutral'"
              :variant="activeSubTab === 'changelog' ? 'solid' : 'ghost'"
              size="xs"
              label="Change Log"
              class="min-h-11 md:min-h-7"
              @click="activeSubTab = 'changelog'"
            />
            <UButton
              :color="activeSubTab === 'issues' ? 'primary' : 'neutral'"
              :variant="activeSubTab === 'issues' ? 'solid' : 'ghost'"
              size="xs"
              :label="`Sync Issues (${issues.length})`"
              class="min-h-11 md:min-h-7"
              @click="activeSubTab = 'issues'"
            />
          </div>

          <UButton
            color="warning"
            variant="outline"
            size="xs"
            icon="i-lucide-refresh-cw"
            label="Prepare Fresh Snapshot"
            :loading="resetting"
            class="min-h-11 md:min-h-7"
            @click="triggerSnapshotReset"
          />
        </div>

        <!-- Filters -->
        <div
          v-if="activeSubTab === 'changelog'"
          class="flex gap-3"
        >
          <USelect
            v-model="entityFilter"
            :items="entityOptions"
            size="xs"
            class="w-40"
            @update:model-value="loadData"
          />
        </div>

        <!-- Skeletons -->
        <div
          v-if="loading"
          class="space-y-3"
        >
          <USkeleton
            v-for="n in 4"
            :key="n"
            class="h-14 w-full rounded-xl bg-accented"
          />
        </div>

        <!-- Change Log Stream -->
        <div v-else-if="activeSubTab === 'changelog'">
          <div
            v-if="changes.length === 0"
            class="text-xs text-muted text-center py-8"
          >
            No change log records captured yet.
          </div>
          <div
            v-else
            class="space-y-2 font-mono text-xs"
          >
            <div
              v-for="c in changes"
              :key="c.version"
              class="rounded-xl border border-default p-3 bg-elevated/40 space-y-2"
            >
              <div class="flex items-center justify-between font-sans">
                <span class="font-bold text-highlighted">v{{ c.version }} · {{ c.entityType }} ({{ c.action }})</span>
                <span class="text-xs text-muted">{{ c.deviceId }} · {{ new Date(c.occurredAt).toLocaleTimeString() }}</span>
              </div>
              <pre class="p-2 bg-muted/10 rounded overflow-x-auto text-[11px] text-muted">{{ JSON.stringify(c.data, null, 2) }}</pre>
            </div>
          </div>
        </div>

        <!-- Issues Stream -->
        <div v-else-if="activeSubTab === 'issues'">
          <div
            v-if="issues.length === 0"
            class="text-xs text-muted text-center py-8"
          >
            ✓ No sync conflicts or rejected mutations recorded.
          </div>
          <div
            v-else
            class="space-y-2 font-mono text-xs"
          >
            <div
              v-for="iss in issues"
              :key="iss.id"
              class="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2"
            >
              <div class="flex items-center justify-between gap-2 text-red-400 font-sans font-semibold">
                <div class="flex items-center gap-2 min-w-0">
                  <UBadge
                    color="error"
                    variant="subtle"
                    size="xs"
                  >
                    {{ iss.errorCode || 'rejected' }}
                  </UBadge>
                  <span class="truncate">{{ iss.mutationType }} · {{ iss.entityRef }}</span>
                </div>
                <span class="text-xs text-muted shrink-0">{{ iss.deviceId }} · {{ new Date(iss.rejectedAt || iss.occurredAt).toLocaleTimeString() }}</span>
              </div>
              <p class="text-xs font-sans text-default">
                {{ iss.reason || iss.error }}
              </p>
              <pre
                v-if="iss.payload && Object.keys(iss.payload).length > 0"
                class="p-2 bg-muted/10 rounded overflow-x-auto text-[11px] text-muted"
              >{{ JSON.stringify(iss.payload, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
