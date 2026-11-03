<script setup lang="ts">
import { sheetUi } from '~/utils/sheet-ui'
import type { AdminUserItem } from '~/composables/useAdmin'

const props = defineProps<{
  user?: AdminUserItem | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  assigned: []
}>()

const admin = useAdmin()
const toast = useToast()

const selectedTenantId = ref('')
const submitting = ref(false)

const tenantOptions = computed(() =>
  admin.tenants.value.map(t => ({
    label: `${t.name} (${t.id.slice(0, 8)}...)`,
    value: t.id,
  })),
)

watch(() => props.user, (u) => {
  if (u?.tenantId) {
    selectedTenantId.value = u.tenantId
  }
  else if (tenantOptions.value[0]) {
    selectedTenantId.value = tenantOptions.value[0].value
  }
  else {
    selectedTenantId.value = ''
  }
})

async function onConfirm() {
  if (!props.user || !selectedTenantId.value) return
  submitting.value = true
  try {
    if (props.user.tenantId) {
      // Reassign / transfer
      await admin.reassignUser(props.user.uid, selectedTenantId.value)
      toast.add({
        title: `Transferred ${props.user.email} to selected farm`,
        color: 'success',
      })
    }
    else {
      // Assign
      await admin.assignUser(props.user.uid, selectedTenantId.value)
      toast.add({
        title: `Assigned ${props.user.email} to farm`,
        color: 'success',
      })
    }
    emit('assigned')
    open.value = false
  }
  catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    toast.add({
      title: 'Action failed',
      description: e.data?.message || 'Server error assigning farm',
      color: 'error',
    })
  }
  finally {
    submitting.value = false
  }
}

const ui = sheetUi(480)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="user?.tenantId ? 'Transfer User to Another Farm' : 'Assign User to Farm'"
    :ui="ui"
  >
    <template #content>
      <div
        v-if="user"
        class="p-6 space-y-4"
      >
        <!-- Caution Warning (AC21) -->
        <div
          v-if="user.tenantId"
          class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 space-y-1"
        >
          <div class="font-bold flex items-center gap-1.5">
            <UIcon
              name="i-lucide-alert-triangle"
              class="size-4 shrink-0"
            />
            <span>CAUTION: DATA ACCESS TRANSFER</span>
          </div>
          <div>
            The user will immediately lose access to <strong class="text-highlighted">{{ user.farmName }}</strong> and will see records for the destination farm. Active user sessions will be revoked.
          </div>
        </div>

        <div class="text-sm">
          <span class="text-muted block text-xs">Target User:</span>
          <span class="font-semibold text-highlighted">{{ user.email }}</span>
          <span class="text-xs text-muted font-mono block mt-0.5">UID: {{ user.uid }}</span>
        </div>

        <div>
          <label class="text-xs font-semibold text-highlighted block mb-1">Select Destination Farm</label>
          <USelect
            v-model="selectedTenantId"
            :items="tenantOptions"
            placeholder="Choose an egg farm..."
            class="w-full"
          />
        </div>

        <div class="flex gap-3 pt-3">
          <UButton
            color="neutral"
            variant="ghost"
            size="md"
            label="Cancel"
            :disabled="submitting"
            class="flex-1 min-h-11"
            @click="open = false"
          />
          <UButton
            color="primary"
            size="md"
            :label="user.tenantId ? 'Confirm Transfer' : 'Confirm Assignment'"
            :loading="submitting"
            :disabled="!selectedTenantId || (user.tenantId === selectedTenantId)"
            class="flex-1 min-h-11"
            @click="onConfirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
