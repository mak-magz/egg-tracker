<!--
  The sale list (feature 04 §2.5 "Sales list, mobile/desktop", AC3, AC4, AC48, R5 to R8; feature 05 AC39): the
  design's table when the area is wide enough (~720px, per UX), stacked cards when it isn't — the switch is the list
  area's OWN width (useElementSize), not the screen width, mirroring ClientsList.vue. Renders the given, already
  sorted and filtered, page ONCE: this is a server-paginated list (unlike Clients' 500-row client filter), so
  there is no "rows in the DOM" step-loading here. Client names are joined here from useClients() (a sale
  never carries a name, AC60); sizes from useFarm() (a line always resolves, even an archived one, AC38).
  The whole card/row is a real <button> that opens the detail; the ⋮ and the "From order #n" pill sit above it
  (z-10) so they don't trigger it. Type is always a word (R5); there is no status: every sale already left the farm.
-->
<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import type { IsoDate, Sale } from '#shared/types/api'
import { formatQty } from '#shared/utils/quantity'
import { formatShortDate } from '~/utils/day-label'
import { SALE_COPY } from '~/utils/sale-copy'

const props = defineProps<{
  sales: readonly Sale[]
  today: IsoDate
  loading?: boolean
  highlightedId?: string | null
  busyIds?: readonly string[]
}>()

const emit = defineEmits<{
  'open': [sale: Sale]
  'edit': [sale: Sale]
  'void': [sale: Sale]
  'open-order': [sale: Sale]
}>()

const { sorted: allClients } = useClients()
const { sizeById, trayEggs, formatPrice } = useFarm()

const busy = computed(() => new Set(props.busyIds ?? []))

function clientName(sale: Sale): string {
  if (!sale.clientId) return SALE_COPY.walkIn
  const c = allClients.value.find(x => x.id === sale.clientId)
  return c ? c.name : SALE_COPY.walkIn
}

const LINES_SHOWN = 3
function lineText(line: Sale['lines'][number]): string {
  return `${sizeById(line.sizeId).name} · ${formatQty(line.eggs, trayEggs.value)}`
}
function shownLines(sale: Sale): string[] {
  return sale.lines.slice(0, LINES_SHOWN).map(lineText)
}
function moreCount(sale: Sale): number {
  return Math.max(0, sale.lines.length - LINES_SHOWN)
}

const TABLE_MIN_WIDTH = 720
const sizer = useTemplateRef<HTMLElement>('sizer')
const { width } = useElementSize(sizer)
const wide = computed(() => width.value >= TABLE_MIN_WIDTH)

function rowAria(sale: Sale): string {
  const kind = sale.voidedAt ? SALE_COPY.voided : sale.type === 'delivery' ? SALE_COPY.typeDelivery : SALE_COPY.typeOnSite
  return SALE_COPY.openSaleAria(sale.saleNumber, clientName(sale), kind)
}

const flash = 'animate-[size-row-flash_1.5s_ease-out] motion-reduce:animate-none'
</script>

<template>
  <div>
    <div
      ref="sizer"
      class="h-0 w-full"
      aria-hidden="true"
    />

    <!-- Wide: the design's table -->
    <div
      v-if="wide"
      class="overflow-hidden rounded-xl bg-default ring ring-inset ring-default"
    >
      <table class="w-full border-collapse">
        <caption class="sr-only">
          {{ SALE_COPY.tableCaption }}
        </caption>
        <thead>
          <tr class="border-b border-default">
            <th
              scope="col"
              class="px-4 py-2.5 text-left text-sm font-medium text-muted"
            >
              {{ SALE_COPY.headerSale }}
            </th>
            <th
              scope="col"
              class="px-4 py-2.5 text-left text-sm font-medium text-muted"
            >
              {{ SALE_COPY.headerClient }}
            </th>
            <th
              scope="col"
              class="px-4 py-2.5 text-left text-sm font-medium text-muted"
            >
              {{ SALE_COPY.headerSizes }}
            </th>
            <th
              scope="col"
              class="px-4 py-2.5 text-right text-sm font-medium text-muted"
            >
              {{ SALE_COPY.headerTotal }}
            </th>
            <th
              scope="col"
              class="px-4 py-2.5 text-left text-sm font-medium text-muted"
            >
              {{ SALE_COPY.headerType }}
            </th>
            <th
              scope="col"
              class="w-16 px-2"
            >
              <span class="sr-only">{{ SALE_COPY.headerActions }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr
              v-for="n in 5"
              :key="n"
              class="border-b border-default last:border-b-0"
              aria-hidden="true"
            >
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-20 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-36 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-40 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="ms-auto h-5 w-16 bg-accented" />
              </td>
              <td class="px-4 py-3.5">
                <USkeleton class="h-5 w-20 bg-accented" />
              </td>
              <td class="px-2 py-3.5" />
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="sale in sales"
              :key="sale.id"
              :data-sale-row="sale.id"
              class="border-b border-default transition-colors last:border-b-0 hover:bg-muted"
              :class="highlightedId === sale.id ? flash : ''"
            >
              <td class="px-4 py-1.5">
                <button
                  type="button"
                  class="min-h-11 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  :aria-label="rowAria(sale)"
                  :data-sale-focus="`open:${sale.id}`"
                  @click="emit('open', sale)"
                >
                  <span class="block text-base font-semibold text-highlighted">{{ SALE_COPY.saleNumber(sale.saleNumber) }}</span>
                  <span class="block text-sm text-muted">{{ formatShortDate(sale.saleDate, today) }}</span>
                </button>
              </td>
              <td class="px-4 py-1.5 align-top">
                <p class="pt-2 text-base font-semibold wrap-anywhere text-highlighted">
                  {{ clientName(sale) }}
                </p>
              </td>
              <td class="px-4 py-1.5 align-top">
                <p
                  v-for="(t, i) in shownLines(sale)"
                  :key="i"
                  class="pt-2 text-base text-default first:pt-2"
                >
                  {{ t }}
                </p>
                <p
                  v-if="moreCount(sale) > 0"
                  class="text-sm text-muted"
                >
                  {{ SALE_COPY.moreSizes(moreCount(sale)) }}
                </p>
              </td>
              <td class="px-4 py-1.5 text-right align-top">
                <p class="pt-2 text-base font-semibold whitespace-nowrap text-highlighted">
                  {{ formatPrice(sale.saleTotal) }}
                </p>
              </td>
              <td class="px-4 py-1.5 align-top">
                <div class="flex flex-col items-start gap-1.5 pt-2">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <SaleTypeBadge :type="sale.type" />
                    <SaleVoidedBadge v-if="sale.voidedAt" />
                  </div>
                  <FromOrderLink
                    v-if="sale.orderId !== null && sale.orderNumber !== null"
                    :order-number="sale.orderNumber"
                    @open="emit('open-order', sale)"
                  />
                </div>
              </td>
              <td class="px-2 py-1.5 text-right align-top">
                <div class="pt-1">
                  <SaleRowMenu
                    :sale="sale"
                    :busy="busy.has(sale.id)"
                    @edit="emit('edit', sale)"
                    @void="emit('void', sale)"
                  />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <slot name="empty" />
    </div>

    <!-- Narrow: stacked cards -->
    <template v-else>
      <div
        v-if="loading"
        class="flex flex-col gap-3"
        aria-hidden="true"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-[170px] w-full rounded-2xl bg-accented"
        />
      </div>
      <ul
        v-else-if="sales.length"
        role="list"
        class="flex flex-col gap-3"
      >
        <li
          v-for="sale in sales"
          :key="sale.id"
          :data-sale-row="sale.id"
          class="relative rounded-2xl bg-default p-4 ring ring-inset ring-default transition-colors active:bg-elevated"
          :class="highlightedId === sale.id ? flash : ''"
        >
          <div class="flex items-start justify-between gap-2">
            <button
              type="button"
              class="-m-1 flex min-h-11 min-w-0 flex-1 flex-col items-start gap-0.5 rounded-2xl p-1 text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
              :aria-label="rowAria(sale)"
              :data-sale-focus="`open:${sale.id}`"
              @click="emit('open', sale)"
            >
              <span class="text-base font-semibold text-highlighted">{{ SALE_COPY.saleNumber(sale.saleNumber) }} · {{ formatShortDate(sale.saleDate, today) }}</span>
            </button>
            <div class="relative z-10 shrink-0">
              <SaleRowMenu
                :sale="sale"
                :busy="busy.has(sale.id)"
                @edit="emit('edit', sale)"
                @void="emit('void', sale)"
              />
            </div>
          </div>
          <p class="text-base wrap-anywhere text-default">
            {{ clientName(sale) }}
          </p>
          <p
            v-for="(t, i) in shownLines(sale)"
            :key="i"
            class="text-base wrap-anywhere text-default"
          >
            {{ t }}
          </p>
          <p
            v-if="moreCount(sale) > 0"
            class="text-sm text-muted"
          >
            {{ SALE_COPY.moreSizes(moreCount(sale)) }}
          </p>
          <div class="mt-1 flex items-center justify-between gap-2">
            <p class="text-lg font-semibold text-highlighted">
              {{ formatPrice(sale.saleTotal) }}
            </p>
            <span class="text-sm text-muted">{{ SALE_COPY.sizeCount(sale.lines.length) }}</span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <SaleTypeBadge :type="sale.type" />
            <SaleVoidedBadge v-if="sale.voidedAt" />
            <FromOrderLink
              v-if="sale.orderId !== null && sale.orderNumber !== null"
              :order-number="sale.orderNumber"
              @open="emit('open-order', sale)"
            />
          </div>
        </li>
      </ul>
      <div
        v-else
        class="rounded-2xl bg-default ring ring-inset ring-default"
      >
        <slot name="empty" />
      </div>
    </template>
  </div>
</template>
