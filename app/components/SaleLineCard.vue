<!--
  One line of the Log/Edit sale form (feature 04 §2.5 "Log a sale: mobile bottom sheet", AC12, AC15 to AC22,
  AC25): a fieldset with a hidden legend "Size {n}", the size chip picker, the per-line on-hand hint, the
  shared trays + loose QuantityInput, the price field (with the farm's currency prefix and a "Usual price"
  note while the value came from the client's default) and the live line total (a dash until both the size,
  quantity and price are valid, R7). The remove (🗑) button is hidden while only one line remains (AC15).
  Self-contained styling only: SaleForm owns every value and every check; this component only renders and
  emits granular updates so SaleForm can move focus and recompute totals centrally.
-->
<script setup lang="ts">
import { currencySymbol, formatPrice } from '#shared/utils/price'
import { formatQty } from '#shared/utils/quantity'
import type { SizeChipOption } from './SizeChipPicker.vue'
import type { QuantityValue } from '~/utils/sale-validation'
import { SALE_COPY } from '~/utils/sale-copy'

const props = defineProps<{
  index: number
  sizeName: string | null
  sizeOptions: readonly SizeChipOption[]
  usedSizeIds: readonly string[]
  eggsPerTray: number
  currency: string | null
  onHandEggs?: number | null
  onHandStatus?: 'loading' | 'ready' | 'error'
  /** Orders don't touch stock (feature 05 AC10): no per-line on-hand hint. */
  hideOnHand?: boolean
  /** An order line that already has deliveries (feature 05 AC19): the size is shown read-only with this accessible name. */
  lockedLabel?: string
  /** The least this line may be, in eggs (Edit after a delivery): the minus steppers stop there. */
  minEggs?: number
  /** Always-visible note under the quantity, e.g. "At least 20 trays delivered". */
  minNote?: string
  /** Muted note under the price, e.g. "Price changes only affect future deliveries." */
  priceNote?: string
  /** "In this order" on the order form; the sale form keeps "In this sale". */
  usedLabel?: string
  usedOptionLabel?: (name: string) => string
  /** Unique per form so the radio ids never clash. */
  idPrefix?: string
  showUsualPriceNote: boolean
  lineTotal: number | null
  removable: boolean
  disabled?: boolean
  sizeError?: string
  quantityError?: string
  priceError?: string
}>()

const emit = defineEmits<{
  'remove': []
  /** A size was chosen on a line that had nothing else typed: move focus to Trays (AC UX flow A). */
  'size-chosen': []
  'price-edited': []
}>()

const sizeId = defineModel<string | null>('sizeId', { required: true })
const qty = defineModel<QuantityValue>('qty', { required: true })
const priceRaw = defineModel<string>('priceRaw', { required: true })

const legend = computed(() => SALE_COPY.lineGroupLabel(props.index + 1))
const quantityLabel = computed(() => props.sizeName ?? `Line ${props.index + 1}`)

function onSizeUpdate(id: string | null) {
  const wasEmpty = sizeId.value === null
  const qtyEmpty = qty.value.trays === null && qty.value.loose === null
  sizeId.value = id
  if (wasEmpty && qtyEmpty && id !== null) emit('size-chosen')
}

const prefix = computed(() => props.idPrefix ?? 'sale-line')

const onHandText = computed(() => {
  if (props.onHandStatus === 'loading') return SALE_COPY.onHandLoading
  if (props.onHandStatus === 'error') return SALE_COPY.onHandFailed
  return SALE_COPY.onHand(formatQty(props.onHandEggs ?? 0, props.eggsPerTray))
})

const lineTotalText = computed(() => (props.lineTotal !== null ? formatPrice(props.lineTotal, props.currency) : null))

function onPriceInput() {
  emit('price-edited')
}
</script>

<template>
  <fieldset class="flex flex-col gap-2 rounded-md bg-muted p-3">
    <legend class="sr-only">
      {{ legend }}
    </legend>

    <div class="flex items-start justify-between gap-2">
      <p class="text-base font-medium text-default">
        {{ SALE_COPY.sizeLabel }}
      </p>
      <UButton
        v-if="removable"
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        :aria-label="SALE_COPY.removeLineAria(sizeName, index + 1)"
        class="size-11 shrink-0 justify-center lg:size-9"
        :disabled="disabled"
        @click="emit('remove')"
      />
    </div>

    <div
      v-if="lockedLabel"
      role="group"
      :aria-label="lockedLabel"
      class="flex min-h-11 items-center gap-2 rounded-md border border-default bg-default px-3 py-2 text-base font-semibold text-highlighted"
    >
      <span class="min-w-0 flex-1 wrap-anywhere">{{ sizeName }}</span>
      <UIcon
        name="i-lucide-lock"
        class="size-4 shrink-0 text-muted"
        aria-hidden="true"
      />
    </div>
    <SizeChipPicker
      v-else
      :model-value="sizeId"
      :options="sizeOptions"
      :used-ids="usedSizeIds"
      :name="`${prefix}-size-${index}`"
      :group-label="SALE_COPY.sizeLabel"
      :disabled="disabled"
      :used-label="usedLabel"
      :used-option-label="usedOptionLabel"
      @update:model-value="onSizeUpdate"
    />
    <p
      v-if="sizeError"
      class="flex items-start gap-1.5 text-sm text-error"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="mt-0.5 size-4 shrink-0"
      />
      <span>{{ sizeError }}</span>
    </p>

    <p
      v-if="sizeId && !hideOnHand"
      class="text-sm text-dimmed"
    >
      {{ onHandText }}
    </p>

    <div class="grid grid-cols-1 gap-2 lg:hidden">
      <span
        class="text-sm text-dimmed"
        aria-hidden="true"
      >{{ SALE_COPY.traysLabel }} / {{ SALE_COPY.looseLabel }}</span>
    </div>
    <QuantityInput
      v-model="qty"
      :eggs-per-tray="eggsPerTray"
      :label="quantityLabel"
      :name="`lines.${index}.qty`"
      :id-prefix="`${prefix}-qty-${index}`"
      :error="quantityError"
      :min-eggs="minEggs"
      :disabled="disabled"
      inline-labels
    />
    <p
      v-if="minNote"
      class="text-sm text-default"
    >
      {{ minNote }}
    </p>

    <div class="flex flex-wrap items-end justify-between gap-3">
      <UFormField
        :label="SALE_COPY.priceLabel"
        :hint="showUsualPriceNote ? SALE_COPY.usualPrice : undefined"
        size="xl"
        :error="priceError"
        :ui="{ label: 'text-base font-medium', hint: 'text-sm text-dimmed', error: 'mt-1.5 text-sm' }"
        class="min-w-0 flex-1"
      >
        <UInput
          v-model="priceRaw"
          type="text"
          inputmode="decimal"
          size="xl"
          class="w-full"
          :placeholder="SALE_COPY.pricePlaceholder"
          :aria-label="`${quantityLabel} ${SALE_COPY.priceLabel}`"
          :disabled="disabled"
          autocomplete="off"
          enterkeyhint="next"
          @input="onPriceInput"
        >
          <template #leading>
            <span
              class="text-base text-muted"
              aria-hidden="true"
            >{{ currencySymbol(currency) }}</span>
          </template>
        </UInput>
      </UFormField>
      <div class="flex flex-col items-end gap-1 pb-1">
        <span class="text-sm text-dimmed">{{ SALE_COPY.lineTotalLabel }}</span>
        <span
          v-if="lineTotalText"
          class="text-lg font-semibold tabular-nums text-highlighted"
        >{{ lineTotalText }}</span>
        <span
          v-else
          aria-hidden="true"
          class="text-lg font-semibold text-dimmed"
        >—</span>
        <span
          v-if="!lineTotalText"
          class="sr-only"
        >{{ SALE_COPY.lineTotalNotReady }}</span>
      </div>
    </div>
    <p
      v-if="priceNote"
      class="text-sm text-muted"
    >
      {{ priceNote }}
    </p>
  </fieldset>
</template>
