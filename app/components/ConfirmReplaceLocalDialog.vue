<script setup lang="ts">
import { exportFarmDataToJson } from '../local/export'
import { sheetUi } from '../utils/sheet-ui'

const { guardState, summaryItems, confirmReplace, cancelReplace } = useLocalReplaceGuard()
const toast = useToast()

const backupDownloading = ref(false)
const backupDownloaded = ref(false)

watch(() => guardState.value.open, (isOpen) => {
  if (isOpen) {
    backupDownloaded.value = false
    backupDownloading.value = false
  }
})

async function handleDownloadBackup() {
  backupDownloading.value = true
  try {
    await exportFarmDataToJson()
    backupDownloaded.value = true
    toast.add({
      title: 'Local backup downloaded',
      description: 'Saved JSON snapshot of your current device data.',
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: 'Backup failed',
      description: 'Could not export local farm data.',
      color: 'error',
    })
  }
  finally {
    backupDownloading.value = false
  }
}

function handleOpenChange(open: boolean) {
  if (!open) {
    cancelReplace()
  }
}
</script>

<template>
  <UModal
    :open="guardState.open"
    :dismissible="!guardState.confirming"
    :ui="sheetUi(480)"
    @update:open="handleOpenChange"
  >
    <template #content>
      <div class="p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div class="flex items-start gap-3 mb-3">
          <div class="size-10 rounded-full bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <UIcon
              name="i-lucide-alert-triangle"
              class="size-5"
            />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-lg font-bold text-highlighted">
              Replace local farm data?
            </h3>
            <p class="text-sm text-muted mt-1">
              This device has local records that haven't been synced to the cloud:
            </p>
          </div>
        </div>

        <div
          v-if="summaryItems.length > 0"
          class="rounded-xl border border-default bg-elevated/50 p-3.5 mb-4 flex flex-wrap gap-2"
        >
          <UBadge
            v-for="item in summaryItems"
            :key="item"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ item }}
          </UBadge>
        </div>

        <p class="text-sm text-default mb-4">
          Replacing local data with your cloud account will overwrite these records. This cannot be undone.
        </p>

        <UAlert
          v-if="guardState.errorMessage"
          color="error"
          variant="subtle"
          :title="guardState.errorMessage"
          class="mb-4"
        />

        <div class="flex flex-col gap-2.5">
          <UButton
            type="button"
            color="neutral"
            variant="outline"
            block
            size="lg"
            class="min-h-11 justify-center"
            :icon="backupDownloaded ? 'i-lucide-check-circle-2' : 'i-lucide-download'"
            :loading="backupDownloading"
            :disabled="guardState.confirming"
            @click="handleDownloadBackup"
          >
            {{ backupDownloaded ? 'Backup downloaded (Download again)' : 'Download Backup (JSON)' }}
          </UButton>

          <UButton
            type="button"
            color="error"
            block
            size="lg"
            class="min-h-11 justify-center"
            icon="i-lucide-refresh-cw"
            :loading="guardState.confirming"
            @click="confirmReplace"
          >
            Replace Local Data with Cloud
          </UButton>

          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            block
            size="lg"
            class="min-h-11 justify-center"
            :disabled="guardState.confirming"
            @click="cancelReplace"
          >
            Cancel and keep local data
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
