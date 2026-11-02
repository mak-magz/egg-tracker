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
const { isFree } = useTier()

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
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20"
        >
          <div class="space-y-0.5">
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full bg-primary animate-pulse" />
              <p class="font-bold text-highlighted text-sm">
                Free Offline Mode
              </p>
            </div>
            <p class="text-xs text-muted">
              Your data is stored securely in your browser's local database. Upgrade to Cloud Sync for automated multi-device sync.
            </p>
          </div>
          <UButton
            color="primary"
            icon="i-lucide-cloud-upload"
            size="md"
            class="shrink-0 font-bold"
            @click="upgradeModalOpen = true"
          >
            Upgrade to Cloud
          </UButton>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UButton
            variant="outline"
            color="neutral"
            size="lg"
            icon="i-lucide-download"
            :loading="exporting"
            class="justify-start p-3.5 rounded-xl border border-default/70 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            @click="handleExportJson"
          >
            <div class="flex flex-col items-start gap-0.5">
              <span class="font-bold text-highlighted text-sm">Export Full Backup</span>
              <span class="text-xs text-muted font-normal">Complete farm snapshot (.json)</span>
            </div>
          </UButton>

          <UButton
            variant="outline"
            color="neutral"
            size="lg"
            icon="i-lucide-upload"
            class="justify-start p-3.5 rounded-xl border border-default/70 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            @click="triggerImport"
          >
            <div class="flex flex-col items-start gap-0.5">
              <span class="font-bold text-highlighted text-sm">Restore Farm Backup</span>
              <span class="text-xs text-muted font-normal">Restore from .json backup file</span>
            </div>
          </UButton>
        </div>

        <!-- CSV Spreadsheets Group -->
        <div class="pt-3 border-t border-default/60 flex flex-col gap-2">
          <p class="text-xs font-bold uppercase tracking-wider text-muted">
            CSV Spreadsheets
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              variant="outline"
              color="neutral"
              size="sm"
              icon="i-lucide-file-spreadsheet"
              class="rounded-lg border-default/70 hover:bg-muted font-semibold text-xs"
              @click="handleExportProduction"
            >
              Export Production
            </UButton>

            <UButton
              variant="outline"
              color="neutral"
              size="sm"
              icon="i-lucide-file-spreadsheet"
              class="rounded-lg border-default/70 hover:bg-muted font-semibold text-xs"
              @click="handleExportSales"
            >
              Export Sales
            </UButton>

            <UButton
              variant="outline"
              color="neutral"
              size="sm"
              icon="i-lucide-file-spreadsheet"
              class="rounded-lg border-default/70 hover:bg-muted font-semibold text-xs"
              @click="handleExportClients"
            >
              Export Clients
            </UButton>
          </div>
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
