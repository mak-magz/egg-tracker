<!--
  Sale detail (feature 04 §2.5 "Sale detail", AC6, AC56): read-only, laid out as the future invoice — sale
  number, badges, client, dates, every line (size, quantity, price per tray, line total) and the sale total,
  with the actions that apply. A bottom sheet on phones, a right-hand slide-over on desktop (detailUi()); an
  overlay, not a page, so the filters/scroll position underneath survive and nothing goes in the address bar
  (AC60). This component only renders and emits: sales.vue owns every dialog the actions open.
-->
<script setup lang="ts">
import type { IsoDate, Sale } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { formatShortDate } from '~/utils/day-label'
import { SALE_COPY } from '~/utils/sale-copy'
import type { SaleMutations } from '~/composables/useSaleMutations'

const props = defineProps<{
  sale: Sale | null
  today: IsoDate
  mutations: SaleMutations
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'edit': [sale: Sale]
  'mark-delivered': [sale: Sale]
  'mark-pending': [sale: Sale]
  'delete': [sale: Sale]
  'void': [sale: Sale]
}>()

const { sizeById, eggsPerTray, formatPrice } = useFarm()
const { sorted: allClients } = useClients()

function clientName(sale: Sale): string {
  if (!sale.clientId) return SALE_COPY.walkIn
  const c = allClients.value.find(x => x.id === sale.clientId)
  if (!c) return SALE_COPY.walkIn
  return c.active ? c.name : SALE_COPY.clientInactiveSelected(c.name)
}

const busy = computed(() => (props.sale ? props.mutations.pendingIds.value.includes(props.sale.id) : false))

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
            <SaleStatusBadge :status="sale.status" />
            <SaleVoidedBadge v-if="sale.voidedAt" />
          </div>
          <p
            v-if="sale.status === 'pending' && !sale.voidedAt"
            class="text-sm text-muted"
          >
            {{ SALE_COPY.detailPendingNote }}
          </p>
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
            <div
              v-if="sale.deliveredDate"
              class="flex justify-between gap-3"
            >
              <dt class="text-muted">
                {{ SALE_COPY.detailDelivered }}
              </dt>
              <dd class="text-right font-semibold text-highlighted">
                {{ formatShortDate(sale.deliveredDate, today) }}
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
                  {{ SALE_COPY.quantityAtPrice(formatQty(line.eggs, eggsPerTray ?? 30), formatPrice(line.pricePerTray)) }}
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
            v-if="!sale.voidedAt && sale.status === 'pending'"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            class="min-h-11 justify-start"
            :label="SALE_COPY.deleteSale"
            @click="emit('delete', sale)"
          />
          <UButton
            v-if="!sale.voidedAt && sale.status === 'complete'"
            color="error"
            variant="ghost"
            icon="i-lucide-ban"
            class="min-h-11 justify-start"
            :label="SALE_COPY.voidSale"
            @click="emit('void', sale)"
          />
        </div>

        <div
          v-if="!sale.voidedAt"
          class="flex shrink-0 gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4"
        >
          <UButton
            color="neutral"
            variant="outline"
            size="xl"
            class="justify-center"
            :label="SALE_COPY.edit"
            :disabled="busy"
            @click="emit('edit', sale)"
          />
          <UButton
            v-if="sale.status === 'pending'"
            color="primary"
            size="xl"
            class="flex-1 justify-center"
            :label="SALE_COPY.markDelivered"
            :loading="busy"
            @click="emit('mark-delivered', sale)"
          />
          <UButton
            v-else-if="sale.type === 'delivery'"
            color="neutral"
            variant="outline"
            size="xl"
            class="flex-1 justify-center"
            :label="SALE_COPY.menuMarkPending"
            :loading="busy"
            @click="emit('mark-pending', sale)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
