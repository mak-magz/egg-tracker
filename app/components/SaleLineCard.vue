<!--
  One size line of the Log/Edit sale and order forms.
  Follows the production logging multi-size grid: every active farm size is displayed in order.
  Each card shows:
  - Size name + color slot / archived badge + on-hand stock hint (or delivery lock status)
  - Trays + Loose steppers (QuantityInput)
  - Price per tray input (with currency symbol and client default "Usual" hint)
  - Live calculated line total (or dash if no quantity entered)
  When quantity > 0, the card subtly highlights as active.
-->
<script setup lang="ts">
import { currencySymbol, formatPrice } from '#shared/utils/price'
import { formatQty } from '#shared/utils/quantity'
import type { SizeChipOption } from './SizeChipPicker.vue'
import type { QuantityValue } from '~/utils/sale-validation'
import { SALE_COPY } from '~/utils/sale-copy'

const props = withDefaults(defineProps<{
  index: number
  sizeName: string | null
  sizeOptions?: readonly SizeChipOption[]
  usedSizeIds?: readonly string[]
  eggsPerTray: number
  currency: string | null
  archived?: boolean
  colorSlot?: number
  onHandEggs?: number | null
  onHandStatus?: 'loading' | 'ready' | 'error'
  /** Orders don't touch stock (feature 05 AC10): no per-line on-hand hint. */
  hideOnHand?: boolean
  /** An order line that already has deliveries: size is read-only with this accessible name. */
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
  /** Unique per form so ids never clash. */
  idPrefix?: string
  showUsualPriceNote?: boolean
  lineTotal: number | null
  removable?: boolean
  disabled?: boolean
  sizeError?: string
  quantityError?: string
  priceError?: string
}>(), {
  sizeOptions: () => [],
  usedSizeIds: () => [],
  archived: false,
  colorSlot: 0,
  onHandEggs: null,
  onHandStatus: 'ready',
  hideOnHand: false,
  lockedLabel: undefined,
  minEggs: undefined,
  minNote: undefined,
  priceNote: undefined,
  showUsualPriceNote: false,
  removable: false,
  disabled: false,
  sizeError: undefined,
  quantityError: undefined,
  priceError: undefined,
  idPrefix: 'sale-line',
})

const emit = defineEmits<{
  'remove': []
  'size-chosen': []
  'price-edited': []
}>()

const qty = defineModel<QuantityValue>('qty', { required: true })
const priceRaw = defineModel<string>('priceRaw', { required: true })

const legend = computed(() => props.sizeName ?? SALE_COPY.lineGroupLabel(props.index + 1))
const quantityLabel = computed(() => props.sizeName ?? `Line ${props.index + 1}`)

const prefix = computed(() => props.idPrefix ?? 'sale-line')

const onHandText = computed(() => {
  if (props.onHandStatus === 'loading') return SALE_COPY.onHandLoading
  if (props.onHandStatus === 'error') return SALE_COPY.onHandFailed
  return SALE_COPY.onHand(formatQty(props.onHandEggs ?? 0, props.eggsPerTray))
})

const hasQuantity = computed(() => {
  const t = qty.value.trays
  const l = qty.value.loose
  return (t !== null && t > 0) || (l !== null && l > 0)
})

const totalEggsEntered = computed(() => {
  const t = qty.value.trays ?? 0
  const l = qty.value.loose ?? 0
  return t * props.eggsPerTray + l
})

const hasStockShortfall = computed(() => {
  if (props.hideOnHand || !hasQuantity.value || props.onHandEggs === null) return false
  return totalEggsEntered.value > (props.onHandEggs ?? 0)
})

const lineTotalText = computed(() => (props.lineTotal !== null ? formatPrice(props.lineTotal, props.currency) : null))

function onPriceInput() {
  emit('price-edited')
}
</script>

<template>
  <fieldset
    class="flex flex-col gap-2.5 rounded-xl border p-3 transition-colors duration-150"
    :class="hasQuantity
      ? 'bg-muted border-primary/50 shadow-xs ring-1 ring-primary/20'
      : 'bg-muted/40 border-default/70 hover:border-default'"
  >
    <legend class="sr-only">
      {{ legend }}
    </legend>

    <!-- Header: Size Name + Color Slot + Stock on Hand / Delivery Lock -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="text-base font-bold text-highlighted break-words">
          {{ sizeName }}
        </span>
        <UBadge
          v-if="archived"
          color="neutral"
          variant="subtle"
          size="xs"
          label="Archived"
        />
        <UBadge
          v-if="lockedLabel"
          color="neutral"
          variant="subtle"
          size="xs"
          icon="i-lucide-lock"
          label="Delivered"
        />
      </div>

      <!-- On-hand stock hint (for Sales) -->
      <div
        v-if="!hideOnHand"
        class="text-xs font-medium shrink-0"
        :class="hasStockShortfall ? 'text-error font-semibold flex items-center gap-1' : 'text-dimmed'"
      >
        <UIcon
          v-if="hasStockShortfall"
          name="i-lucide-alert-triangle"
          class="size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span>{{ onHandText }}</span>
      </div>
    </div>

    <!-- Error on size (if server validation returns one) -->
    <p
      v-if="sizeError"
      class="flex items-start gap-1.5 text-xs text-error"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="mt-0.5 size-3.5 shrink-0"
      />
      <span>{{ sizeError }}</span>
    </p>

    <!-- Column labels hint for mobile -->
    <div
      class="grid grid-cols-[148px_148px] gap-x-3 px-1 text-xs text-dimmed lg:hidden"
      aria-hidden="true"
    >
      <span class="text-center">{{ SALE_COPY.traysLabel }}</span>
      <span class="text-center">{{ SALE_COPY.looseLabel }}</span>
    </div>

    <!-- QuantityInput: Trays + Loose -->
    <QuantityInput
      v-model="qty"
      :eggs-per-tray="eggsPerTray"
      :label="quantityLabel"
      :name="`lines.${index}.qty`"
      :id-prefix="`${prefix}-qty-${index}`"
      :error="quantityError"
      :min-eggs="minEggs"
      :disabled="disabled || (!!lockedLabel && minEggs === undefined)"
      inline-labels
    />

    <p
      v-if="minNote"
      class="text-xs text-dimmed"
    >
      {{ minNote }}
    </p>

    <!-- Price per Tray & Live Line Total -->
    <div class="flex flex-wrap items-end justify-between gap-3 pt-1 border-t border-default/40">
      <UFormField
        :label="SALE_COPY.priceLabel"
        :hint="showUsualPriceNote ? SALE_COPY.usualPrice : undefined"
        size="md"
        :error="priceError"
        :ui="{ label: 'text-xs font-medium text-dimmed', hint: 'text-[11px] text-primary font-medium', error: 'mt-1 text-xs' }"
        class="min-w-0 flex-1 max-w-[190px]"
      >
        <UInput
          v-model="priceRaw"
          type="text"
          inputmode="decimal"
          size="md"
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
              class="text-sm text-muted"
              aria-hidden="true"
            >{{ currencySymbol(currency) }}</span>
          </template>
        </UInput>
      </UFormField>

      <!-- Line Total -->
      <div class="flex flex-col items-end gap-0.5 pb-1">
        <span class="text-xs text-dimmed">{{ SALE_COPY.lineTotalLabel }}</span>
        <span
          v-if="lineTotalText"
          class="text-base font-bold tabular-nums text-highlighted"
        >{{ lineTotalText }}</span>
        <span
          v-else
          aria-hidden="true"
          class="text-base font-semibold text-dimmed"
        >—</span>
        <span
          v-if="!lineTotalText"
          class="sr-only"
        >{{ SALE_COPY.lineTotalNotReady }}</span>
      </div>
    </div>

    <p
      v-if="priceNote"
      class="text-xs text-muted"
    >
      {{ priceNote }}
    </p>
  </fieldset>
</template>
