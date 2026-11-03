<script setup lang="ts">
import { sheetUi } from '~/utils/sheet-ui'
import type { AdminProvisionResponse } from '~/composables/useAdmin'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  provisioned: [result: AdminProvisionResponse]
}>()

const admin = useAdmin()
const toast = useToast()

const state = reactive({
  farmName: '',
  ownerEmail: '',
  tier: 'premium' as 'free' | 'premium',
  eggsPerTray: 30,
  currency: 'PHP',
  initialPassword: '',
})

const submitting = ref(false)
const errors = reactive<Record<string, string>>({})
const result = ref<AdminProvisionResponse | null>(null)

function validate() {
  errors.farmName = ''
  errors.ownerEmail = ''
  errors.eggsPerTray = ''
  if (!state.farmName.trim()) errors.farmName = 'Farm Name is required'
  if (!state.ownerEmail.trim()) errors.ownerEmail = 'Owner Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.ownerEmail.trim())) errors.ownerEmail = 'Valid email is required'
  if (state.eggsPerTray < 1 || state.eggsPerTray > 100) errors.eggsPerTray = 'Eggs per tray must be between 1 and 100'
  return !errors.farmName && !errors.ownerEmail && !errors.eggsPerTray
}

async function onSubmit() {
  if (!validate()) return
  submitting.value = true
  try {
    const res = await admin.provisionTenant({
      farmName: state.farmName.trim(),
      ownerEmail: state.ownerEmail.trim(),
      tier: state.tier,
      eggsPerTray: Number(state.eggsPerTray),
      currency: state.currency.trim().toUpperCase(),
      initialPassword: state.initialPassword ? state.initialPassword : undefined,
    })
    result.value = res
  }
  catch (err: unknown) {
    const e = err as { data?: { message?: string } }
    toast.add({
      title: 'Provisioning Failed',
      description: e.data?.message || 'Server error provisioning tenant',
      color: 'error',
    })
  }
  finally {
    submitting.value = false
  }
}

function copyCredentials() {
  if (!result.value) return
  const creds = [
    `Tamago Farm Credentials`,
    `Farm: ${result.value.tenant.name}`,
    `Tenant ID: ${result.value.tenant.id}`,
    `Owner Email: ${result.value.owner.email}`,
    result.value.owner.generatedPassword ? `Temporary Password: ${result.value.owner.generatedPassword}` : `Password: (As specified by operator)`,
    `Sign-in URL: ${window.location.origin}/login`,
  ].join('\n')

  navigator.clipboard.writeText(creds)
  toast.add({
    title: 'Credentials copied to clipboard',
    color: 'success',
  })
}

function onDone() {
  if (result.value) {
    emit('provisioned', result.value)
  }
  open.value = false
  result.value = null
  state.farmName = ''
  state.ownerEmail = ''
  state.initialPassword = ''
}

const ui = sheetUi(520)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="result ? 'Farm Provisioned Successfully' : 'Provision New Tenant Farm'"
    :dismissible="!submitting"
    :ui="ui"
  >
    <template #content>
      <!-- Completion State (AC17) -->
      <div
        v-if="result"
        class="p-6 space-y-5"
      >
        <div class="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-sm">
          <UIcon
            name="i-lucide-check-circle-2"
            class="size-6 shrink-0"
          />
          <span>The tenant database and owner account are ready. Store these credentials now; temporary passwords cannot be retrieved again.</span>
        </div>

        <div class="rounded-xl border border-default p-4 space-y-2.5 font-mono text-xs bg-elevated/40">
          <div class="flex justify-between">
            <span class="text-muted">Farm Name:</span><span class="font-bold text-highlighted">{{ result.tenant.name }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Tenant ID:</span><span>{{ result.tenant.id }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Owner Email:</span><span>{{ result.owner.email }}</span>
          </div>
          <div
            v-if="result.owner.generatedPassword"
            class="flex justify-between items-center py-1 text-emerald-400 bg-emerald-500/5 px-2 rounded"
          >
            <span>Temporary Password:</span>
            <span class="font-bold select-all">{{ result.owner.generatedPassword }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Database:</span><span>{{ result.tenant.dbUrl.slice(0, 32) }}...</span>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 pt-2">
          <UButton
            color="primary"
            variant="outline"
            size="md"
            icon="i-lucide-clipboard"
            label="Copy Credentials"
            class="flex-1 min-h-11"
            @click="copyCredentials"
          />
          <UButton
            color="primary"
            size="md"
            label="Done"
            class="flex-1 min-h-11"
            @click="onDone"
          />
        </div>
      </div>

      <!-- Creation Form (AC14, AC18) -->
      <form
        v-else
        class="p-6 space-y-4"
        @submit.prevent="onSubmit"
      >
        <div>
          <label class="text-xs font-semibold text-highlighted block mb-1">Farm Name *</label>
          <UInput
            v-model="state.farmName"
            placeholder="e.g. Sunrise Pastures"
            :disabled="submitting"
            class="w-full"
            :class="errors.farmName ? 'ring-red-500' : ''"
          />
          <span
            v-if="errors.farmName"
            class="text-xs text-red-500 mt-1 block"
          >{{ errors.farmName }}</span>
        </div>

        <div>
          <label class="text-xs font-semibold text-highlighted block mb-1">Owner Email Address *</label>
          <UInput
            v-model="state.ownerEmail"
            type="email"
            placeholder="e.g. owner@sunrisepastures.com"
            :disabled="submitting"
            class="w-full"
            :class="errors.ownerEmail ? 'ring-red-500' : ''"
          />
          <span
            v-if="errors.ownerEmail"
            class="text-xs text-red-500 mt-1 block"
          >{{ errors.ownerEmail }}</span>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-highlighted block mb-1">Eggs Per Tray</label>
            <UInput
              v-model="state.eggsPerTray"
              type="number"
              inputmode="numeric"
              :disabled="submitting"
              class="w-full"
            />
          </div>
          <div>
            <label class="text-xs font-semibold text-highlighted block mb-1">Currency Code</label>
            <UInput
              v-model="state.currency"
              placeholder="PHP"
              :disabled="submitting"
              class="w-full uppercase"
            />
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-highlighted block mb-1">Subscription Tier</label>
          <div class="flex gap-4 p-2 rounded-lg bg-elevated/40 border border-default">
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input
                v-model="state.tier"
                type="radio"
                value="premium"
                :disabled="submitting"
              >
              <span class="font-medium text-highlighted">Premium (Cloud Sync)</span>
            </label>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input
                v-model="state.tier"
                type="radio"
                value="free"
                :disabled="submitting"
              >
              <span class="text-muted">Free Tier</span>
            </label>
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-highlighted block mb-1">Initial Password (Optional)</label>
          <UInput
            v-model="state.initialPassword"
            type="password"
            placeholder="Leave blank to generate secure password"
            :disabled="submitting"
            class="w-full"
          />
          <span class="text-xs text-muted mt-1 block">If left blank, a secure 12-char passphrase will be generated.</span>
        </div>

        <div class="p-3 rounded-xl bg-muted/10 text-xs text-muted border border-default/50 space-y-1">
          <div class="font-semibold text-highlighted">
            Orchestrated Provisioning Pipeline:
          </div>
          <div>• Creates/verifies Firebase Auth owner account</div>
          <div>• Provisions isolated Turso database (`tamago-&lt;id&gt;`)</div>
          <div>• Bootstraps full Drizzle schema &amp; seeds default egg sizes</div>
          <div>• Associates owner with tenant in Control DB</div>
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
            type="submit"
            color="primary"
            size="md"
            label="Provision Farm"
            :loading="submitting"
            class="flex-1 min-h-11"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
