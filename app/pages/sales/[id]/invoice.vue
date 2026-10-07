<!--
  Printable invoice for one sale (feature 07). Owns the load state, Print, Back, the title and focus.
  - Data is loaded in onMounted only (never useAsyncData/useFetch): the server renders the loading shell, so the HTML
    never holds a sale or a client (AC23). The client's name is joined in the browser from the client list.
  - Print calls window.print() directly inside the click handler (D9: no auto-print; iOS Safari needs the tap).
  - Title is "Invoice {number}" only (AC22); Unhead restores the previous title when the page unmounts.
  The shell never renders here (layout `invoice`), so nothing from the app can print.
-->
<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { buildInvoiceView, invoiceTitle } from '~/utils/invoice-view'
import { INVOICE_COPY } from '~/utils/invoice-copy'

definePageMeta({ layout: 'invoice' })

const route = useRoute()
const saleId = String(route.params.id ?? '')
const { state, load, retry } = useInvoice(saleId)
const { farm, trayEggs, formatPrice, sizeById } = useFarm()
const { handoffTo } = useDetailStack()

const view = computed(() => {
  const s = state.value
  if (s.status !== 'ready' || !farm.value) return null
  return buildInvoiceView(s.sale, {
    farmName: farm.value.name,
    clientName: s.clientName,
    eggsPerTray: trayEggs.value,
    sizeName: id => sizeById(id).name,
    formatPrice,
  })
})

useHead({ title: computed(() => (view.value ? invoiceTitle(view.value.number) : 'Invoice')) })

const sheet = ref<{ focusHeading: () => void } | null>(null)
const printBtn = ref<{ $el: HTMLElement } | null>(null)

onMounted(() => {
  void load()
})

watch(() => state.value.status, async (status) => {
  if (status !== 'ready') return
  await nextTick()
  sheet.value?.focusHeading()
})

function print() {
  window.print()
}

if (import.meta.client) useEventListener(window, 'afterprint', () => printBtn.value?.$el.focus())

function back() {
  if (state.value.status === 'ready') return handoffTo({ kind: 'sale', id: state.value.sale.id }, '/sales')
  return navigateTo('/sales')
}
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-[230mm] flex-col gap-4 p-4 pb-28 md:p-6 md:pb-6 print:max-w-none print:p-0"
    :aria-busy="state.status === 'loading'"
  >
    <div class="flex items-center justify-between gap-3 print:hidden">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        size="lg"
        class="min-h-11"
        :label="INVOICE_COPY.back"
        @click="back"
      />
      <div
        v-if="state.status === 'ready' || state.status === 'loading'"
        class="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:border-t max-md:border-default max-md:bg-default max-md:p-4 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <UButton
          ref="printBtn"
          icon="i-lucide-printer"
          size="xl"
          class="min-h-12 justify-center max-md:w-full"
          :label="INVOICE_COPY.print"
          :disabled="state.status !== 'ready'"
          @click="print"
        />
      </div>
    </div>

    <template v-if="state.status === 'loading'">
      <p
        class="text-center text-base text-muted"
        role="status"
      >
        {{ INVOICE_COPY.loading }}
      </p>
      <div class="mx-auto flex w-full max-w-[210mm] flex-col gap-4 rounded-md bg-default p-5 ring ring-default sm:p-10">
        <USkeleton class="h-5 w-40" />
        <USkeleton class="h-8 w-56" />
        <USkeleton class="h-4 w-48" />
        <USkeleton class="h-4 w-40" />
        <USkeleton class="mt-4 h-24 w-full" />
        <USkeleton class="h-8 w-40 self-end" />
      </div>
    </template>

    <template v-else-if="view">
      <UAlert
        v-if="view.voided"
        color="neutral"
        variant="subtle"
        icon="i-lucide-ban"
        role="status"
        class="print:hidden"
        :title="INVOICE_COPY.voidedNotice"
      />
      <InvoiceSheet
        ref="sheet"
        :view="view"
      />
    </template>

    <AppPlaceholder
      v-else-if="state.status === 'not_found'"
      icon="i-lucide-file-question"
      :title="INVOICE_COPY.notFoundTitle"
      :body="INVOICE_COPY.notFoundBody"
      class="print:hidden"
    >
      <UButton
        to="/sales"
        size="xl"
        class="min-h-11 w-full justify-center"
        :label="INVOICE_COPY.backToSales"
      />
    </AppPlaceholder>

    <UAlert
      v-else
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      role="alert"
      class="print:hidden"
      :title="INVOICE_COPY.errorBody"
      :actions="[{ label: INVOICE_COPY.tryAgain, color: 'neutral', variant: 'outline', size: 'lg', class: 'min-h-11', onClick: () => retry() }]"
    />
  </div>
</template>
