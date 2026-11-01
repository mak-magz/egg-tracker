<!--
  Settings (feature 02, feature 08). Reached from the account menu, not a sixth tab.
  Sizes card, Data & Backup section (AC6 manual export/import), and Cloud Sync Upgrade (AC2, AC8).
-->
<script setup lang="ts">
import {
  exportClientsCsv,
  exportFarmDataToJson,
  exportProductionCsv,
  exportSalesCsv,
  importFarmSnapshotFromJson,
} from '~/local/export'

definePageMeta({ title: 'Settings', subtitle: 'Farm settings', back: true })

const toast = useToast()
const { me } = useMe()
const isFree = computed(() => !me.value?.email)

const upgradeModalOpen = ref(false)
const exporting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function handleExportJson() {
  exporting.value = true
  try {
    await exportFarmDataToJson()
    toast.add({ title: 'Export Complete', description: 'Full JSON backup downloaded.', color: 'success' })
  }
  catch (err: unknown) {
    toast.add({ title: 'Export Failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    exporting.value = false
  }
}

async function handleExportProduction() {
  try {
    await exportProductionCsv(me.value?.farm?.eggsPerTray || 30)
    toast.add({ title: 'Export Complete', description: 'Production CSV downloaded.', color: 'success' })
  }
  catch (err: unknown) {
    toast.add({ title: 'Export Failed', description: (err as Error).message, color: 'error' })
  }
}

async function handleExportSales() {
  try {
    await exportSalesCsv()
    toast.add({ title: 'Export Complete', description: 'Sales CSV downloaded.', color: 'success' })
  }
  catch (err: unknown) {
    toast.add({ title: 'Export Failed', description: (err as Error).message, color: 'error' })
  }
}

async function handleExportClients() {
  try {
    await exportClientsCsv()
    toast.add({ title: 'Export Complete', description: 'Clients CSV downloaded.', color: 'success' })
  }
  catch (err: unknown) {
    toast.add({ title: 'Export Failed', description: (err as Error).message, color: 'error' })
  }
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleFileSelected(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    await importFarmSnapshotFromJson(text)
    toast.add({ title: 'Import Successful', description: 'Farm data restored.', color: 'success' })
    window.location.reload()
  }
  catch (err: unknown) {
    toast.add({ title: 'Import Failed', description: (err as Error)?.message || 'Invalid backup file.', color: 'error' })
  }
  finally {
    target.value = ''
  }
}
</script>

<template>
  <div class="space-y-6">
    <SizesManager />

    <SettingsSection
      title="Data & Backup"
      help="Export your farm data to CSV spreadsheets or full JSON backup, or restore from a backup file."
    >
      <div class="space-y-4">
        <div
          v-if="isFree"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-primary/10 border border-primary/20"
        >
          <div>
            <p class="font-medium text-highlighted text-sm">
              Free Offline Mode
            </p>
            <p class="text-xs text-muted">
              Your data is stored securely on this device. Upgrade to Cloud Sync for automated multi-device sync.
            </p>
          </div>
          <UButton
            color="primary"
            icon="i-lucide-cloud-upload"
            size="sm"
            @click="upgradeModalOpen = true"
          >
            Upgrade to Cloud
          </UButton>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-download"
            :loading="exporting"
            @click="handleExportJson"
          >
            Export Full Backup (JSON)
          </UButton>

          <UButton
            variant="outline"
            color="neutral"
            icon="i-lucide-upload"
            @click="triggerImport"
          >
            Restore Backup (JSON)
          </UButton>

          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-file-spreadsheet"
            @click="handleExportProduction"
          >
            Export Production (CSV)
          </UButton>

          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-file-spreadsheet"
            @click="handleExportSales"
          >
            Export Sales (CSV)
          </UButton>

          <UButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-file-spreadsheet"
            @click="handleExportClients"
          >
            Export Clients (CSV)
          </UButton>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="handleFileSelected"
        >
      </div>
    </SettingsSection>

    <UpgradeModal v-model:open="upgradeModalOpen" />
  </div>
</template>
