<!--
  Sale detail (feature 04 §2.5 "Sale detail", AC6, AC56; feature 05 AC39): read-only, laid out as the future invoice
  — sale number, badges (Type, "From order #n", Voided), client, sale date, every line (size, quantity, price per
  tray, line total) and the sale total, with the actions that apply: Edit and Void sale only (no Mark delivered,
  no Mark as pending, no Delete). A bottom sheet on phones, a right-hand slide-over on desktop (detailUi()); an
  overlay, not a page, so the filters/scroll position underneath survive and nothing goes in the address bar
  (AC60). Print invoice (feature 07) is a link to /sales/:id/invoice on every footer, voided and read-only included. This component only renders and emits: sales.vue owns every dialog the actions open.
  `readonly` (opened from the Orders screen on top of an order, feature 05 D10/U2): no actions, one "Open in Sales"
  link to the screen that owns them.
-->
<script setup lang="ts">
import type { IsoDate, Sale } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { formatShortDate } from '~/utils/day-label'
import { SALE_COPY } from '~/utils/sale-copy'
import { INVOICE_COPY } from '~/utils/invoice-copy'
import type { SaleMutations } from '~/composables/useSaleMutations'

const props = defineProps<{
  sale: Sale | null
  today: IsoDate
  mutations?: SaleMutations
  readonly?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'edit': [sale: Sale]
  'void': [sale: Sale]
  'open-order': [sale: Sale]
  'open-elsewhere': [sale: Sale]
}>()

const { sizeById, trayEggs, formatPrice } = useFarm()
const { sorted: allClients } = useClients()

function clientName(sale: Sale): string {
  if (!sale.clientId) return SALE_COPY.walkIn
  const c = allClients.value.find(x => x.id === sale.clientId)
  if (!c) return SALE_COPY.walkIn
  return c.active ? c.name : SALE_COPY.clientInactiveSelected(c.name)
}

const busy = computed(() => (props.sale && props.mutations ? props.mutations.pendingIds.value.includes(props.sale.id) : false))

const ui = detailUi()
</script>

<template>
  <UModal
    v-model:open="open"
    :title="sale ? SALE_COPY.detailTitle(sale.saleNumber) : ''"
    :dismissible="true"
    :ui="ui"
  >
    <template #content>
      <div
        v-if="sale"
        class="flex min-h-0 flex-1 flex-col"
      >
        <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2 sm:ps-5">
          <h2 class="flex-1 text-lg font-bold text-highlighted">
            {{ SALE_COPY.detailTitle(sale.saleNumber) }}
          </h2>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="SALE_COPY.close"
            class="size-11 justify-center lg:size-10"
            @click="open = false"
          />
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-2">
            <SaleTypeBadge :type="sale.type" />
            <FromOrderLink
              v-if="sale.orderId !== null && sale.orderNumber !== null"
              :order-number="sale.orderNumber"
              @open="emit('open-order', sale)"
            />
            <SaleVoidedBadge v-if="sale.voidedAt" />
          </div>
          <p
            v-if="sale.voidedAt"
            class="text-sm text-muted"
          >
            {{ SALE_COPY.detailVoidedNote }}
          </p>

          <dl class="flex flex-col gap-1.5 text-base">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                {{ SALE_COPY.detailClient }}
              </dt>
              <dd class="text-right font-semibold text-highlighted">
                {{ clientName(sale) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                {{ SALE_COPY.detailSaleDate }}
              </dt>
              <dd class="text-right font-semibold text-highlighted">
                {{ formatShortDate(sale.saleDate, today) }}
              </dd>
            </div>
          </dl>

          <div class="flex flex-col gap-3 border-t border-default pt-3">
            <div
              v-for="line in sale.lines"
              :key="line.sizeId"
              class="flex items-start justify-between gap-3"
            >
              <div>
                <p class="font-semibold text-highlighted">
                  {{ sizeById(line.sizeId).name }}
                  <UBadge
                    v-if="!sizeById(line.sizeId).known || !sizeById(line.sizeId).active"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    :label="SALE_COPY.archived"
                    class="ms-1"
                  />
                </p>
                <p class="text-sm text-muted">
                  {{ SALE_COPY.quantityAtPrice(formatQty(line.eggs, trayEggs), formatPrice(line.pricePerTray)) }}
                </p>
              </div>
              <p class="shrink-0 font-semibold text-highlighted">
                {{ formatPrice(line.lineTotal) }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between border-t border-default pt-3 text-lg font-bold text-highlighted">
            <span>{{ SALE_COPY.detailSaleTotal }}</span>
            <span>{{ formatPrice(sale.saleTotal) }}</span>
          </div>

          <UButton
            v-if="!readonly && !sale.voidedAt"
            color="error"
            variant="ghost"
            icon="i-lucide-ban"
            class="min-h-11 justify-start"
            :label="SALE_COPY.voidSale"
            :disabled="busy"
            @click="emit('void', sale)"
          />
        </div>

        <div
          v-if="readonly"
          class="flex shrink-0 gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4"
        >
          <UButton
            :to="`/sales/${sale.id}/invoice`"
            color="neutral"
            variant="outline"
            size="xl"
            icon="i-lucide-printer"
            class="min-h-11 flex-1 justify-center"
            :label="INVOICE_COPY.printInvoice"
          />
          <UButton
            size="xl"
            class="min-h-11 flex-1 justify-center"
            icon="i-lucide-external-link"
            :label="SALE_COPY.openInSales"
            @click="emit('open-elsewhere', sale)"
          />
        </div>
        <div
          v-else
          class="flex shrink-0 gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4"
        >
          <UButton
            v-if="!sale.voidedAt"
            color="neutral"
            variant="outline"
            size="xl"
            class="min-h-11 flex-1 justify-center"
            :label="SALE_COPY.edit"
            :disabled="busy"
            @click="emit('edit', sale)"
          />
          <UButton
            :to="`/sales/${sale.id}/invoice`"
            color="neutral"
            variant="outline"
            size="xl"
            icon="i-lucide-printer"
            class="min-h-11 flex-1 justify-center"
            :label="INVOICE_COPY.printInvoice"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
