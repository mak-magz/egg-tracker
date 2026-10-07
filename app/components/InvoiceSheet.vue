<!--
  The printable invoice for one sale (feature 07 §3.4, §2.5). Presentational only. Always black on white (explicit
  colours, not theme tokens: dark mode would otherwise print light text on white paper). One real <table> that
  restacks below `sm` with CSS only and is always the normal table in print. The VOID stamp is text + border so it
  reads on a black-and-white printer; it has no background, so the figures stay legible under it.
-->
<script setup lang="ts">
import type { InvoiceView } from '~/utils/invoice-view'
import { invoiceHeading } from '~/utils/invoice-view'
import { INVOICE_COPY } from '~/utils/invoice-copy'

defineProps<{ view: InvoiceView }>()

const heading = ref<HTMLElement | null>(null)
defineExpose({ focusHeading: () => heading.value?.focus({ preventScroll: true }) })

const td = 'block px-0 py-0.5 before:me-2 before:text-sm before:text-neutral-700 before:content-[attr(data-label)] sm:table-cell sm:px-3 sm:py-2 sm:before:hidden print:table-cell print:px-3 print:py-2 print:before:hidden'
</script>

<template>
  <main class="mx-auto w-full max-w-[210mm] bg-white p-5 text-neutral-900 sm:border sm:border-neutral-300 sm:p-10 sm:shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
    <header class="flex flex-col gap-1">
      <p class="text-lg font-bold">
        {{ view.farmName }}
      </p>
      <h1
        ref="heading"
        tabindex="-1"
        class="text-2xl font-bold outline-none"
      >
        {{ invoiceHeading(view.number, view.voided) }}
      </h1>
    </header>

    <dl class="mt-5 flex flex-col gap-1 text-base">
      <div class="flex gap-3">
        <dt class="w-20 shrink-0 text-neutral-700">
          {{ INVOICE_COPY.date }}
        </dt>
        <dd class="font-semibold">
          {{ view.dateText }}
        </dd>
      </div>
      <div class="flex gap-3">
        <dt class="w-20 shrink-0 text-neutral-700">
          {{ INVOICE_COPY.type }}
        </dt>
        <dd class="font-semibold">
          {{ view.typeText }}
        </dd>
      </div>
      <div
        v-if="view.billTo !== null"
        class="flex gap-3"
      >
        <dt class="w-20 shrink-0 text-neutral-700">
          {{ INVOICE_COPY.billTo }}
        </dt>
        <dd class="font-semibold">
          {{ view.billTo }}
        </dd>
      </div>
      <p
        v-else-if="view.walkIn"
        class="font-semibold"
      >
        {{ INVOICE_COPY.walkIn }}
      </p>
    </dl>

    <div class="relative mt-6">
      <table class="block w-full border-collapse text-left text-base sm:table print:table print:text-[11.5pt]">
        <thead class="sr-only sm:not-sr-only sm:table-header-group print:not-sr-only print:table-header-group">
          <tr class="border-b-2 border-neutral-900 sm:table-row print:table-row">
            <th
              scope="col"
              class="px-3 py-2 font-semibold"
            >
              {{ INVOICE_COPY.headSize }}
            </th>
            <th
              scope="col"
              class="px-3 py-2 font-semibold"
            >
              {{ INVOICE_COPY.headQuantity }}
            </th>
            <th
              scope="col"
              class="px-3 py-2 text-right font-semibold"
            >
              {{ INVOICE_COPY.headPrice }}
            </th>
            <th
              scope="col"
              class="px-3 py-2 text-right font-semibold"
            >
              {{ INVOICE_COPY.headTotal }}
            </th>
          </tr>
        </thead>
        <tbody class="block sm:table-row-group print:table-row-group">
          <tr
            v-for="(line, i) in view.lines"
            :key="i"
            class="block break-inside-avoid border-b border-neutral-300 py-2 sm:table-row sm:py-0 print:table-row print:py-0"
          >
            <td
              :class="td"
              class="font-semibold"
              :data-label="`${INVOICE_COPY.headSize}:`"
            >
              {{ line.size }}
            </td>
            <td
              :class="td"
              :data-label="`${INVOICE_COPY.headQuantity}:`"
            >
              {{ line.quantity }}
            </td>
            <td
              :class="td"
              class="sm:text-right print:text-right"
              :data-label="`${INVOICE_COPY.headPrice}:`"
            >
              {{ line.price }}
            </td>
            <td
              :class="td"
              class="font-semibold sm:text-right print:text-right"
              :data-label="`${INVOICE_COPY.headTotal}:`"
            >
              {{ line.total }}
            </td>
          </tr>
        </tbody>
        <tfoot class="block break-inside-avoid sm:table-footer-group print:table-row-group">
          <tr class="flex items-baseline justify-between text-xl font-bold sm:table-row print:table-row print:text-[14pt]">
            <th
              scope="row"
              colspan="3"
              class="px-0 py-3 text-left sm:px-3 sm:text-right print:px-3 print:text-right"
            >
              {{ INVOICE_COPY.total }}
            </th>
            <td class="px-0 py-3 text-right sm:px-3 print:px-3">
              {{ view.total }}
            </td>
          </tr>
        </tfoot>
      </table>

      <p
        v-if="view.voided"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-15 border-[3px] border-solid border-neutral-900/40 px-4 text-5xl font-bold tracking-widest text-neutral-900/40 uppercase print:border-neutral-900/50 print:text-[48pt] print:text-neutral-900/50"
      >
        {{ INVOICE_COPY.void }}
      </p>
    </div>
  </main>
</template>
