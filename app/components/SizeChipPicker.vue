<!--
  A sale line's size picker (feature 04 §2.5 O1/S2/S3, AC16, AC17, AC38, AC41): chips (one tap), a native
  select above 6 active sizes. A size already chosen on ANOTHER line of the same form stays visible but
  can't be picked — dashed border, dimmed, a second line "In this sale" (owner decision O3) — so the owner
  never wonders where a size went; a tap on it does nothing. An archived size already on THIS line (Edit
  only, AC41) is offered too, marked "Archived", and stays selected until the owner picks something else.

  Built on native <input type="radio"> + <label> (visually hidden input, the label styled as the chip), so
  Tab/Arrow/Space work with no custom keyboard code, and `disabled` on the input is what makes a used size
  genuinely unpickable (not just styled that way) — the browser itself skips a disabled radio with the
  arrow keys and ignores a click on its label.
-->
<script setup lang="ts">
import { sizeColor } from '~/utils/size-colors'
import { SALE_COPY } from '~/utils/sale-copy'

export interface SizeChipOption {
  id: string
  name: string
  colorSlot: number
  /** This line's OWN size, kept even though it's since been archived (AC38, AC41). */
  archived: boolean
}

const props = defineProps<{
  options: readonly SizeChipOption[]
  /** Sizes used by OTHER lines of this form: shown, but not selectable (AC16). */
  usedIds: readonly string[]
  name: string
  /**
   * Hidden unless the fallback select is used, where it becomes the select's accessible name. Named
   * `groupLabel`, not `ariaLabel`: vue-tsc types `aria-label` as a global attribute, so a same-named prop
   * would never bind through the template (it would always be read as the raw attribute instead).
   */
  groupLabel: string
  disabled?: boolean
}>()

const modelValue = defineModel<string | null>({ required: true })

const usedSet = computed(() => new Set(props.usedIds))
function isUsed(id: string): boolean {
  return usedSet.value.has(id) && id !== modelValue.value
}

/** Above 6 active sizes the chip grid would grow too tall per line (UX S2): a plain select instead. */
const CHIP_LIMIT = 6
const useSelect = computed(() => props.options.length > CHIP_LIMIT)

function onChange(id: string) {
  if (props.disabled || isUsed(id)) return
  modelValue.value = id
}

function chipClasses(opt: SizeChipOption): string {
  const selected = modelValue.value === opt.id
  const disabled = props.disabled || isUsed(opt.id)
  if (disabled) {
    return 'border-dashed border-default text-dimmed cursor-not-allowed'
  }
  if (selected) {
    return 'border-primary ring-2 ring-primary bg-primary/8 font-semibold text-highlighted cursor-pointer'
  }
  return 'border-default text-default hover:bg-muted cursor-pointer'
}
</script>

<template>
  <div v-if="!useSelect">
    <div
      role="radiogroup"
      :aria-label="groupLabel"
      class="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap"
    >
      <div
        v-for="opt in options"
        :key="opt.id"
        class="relative min-w-0"
      >
        <input
          :id="`${name}-${opt.id}`"
          type="radio"
          class="peer sr-only"
          :name="name"
          :value="opt.id"
          :checked="modelValue === opt.id"
          :disabled="disabled || isUsed(opt.id)"
          @change="onChange(opt.id)"
        >
        <label
          :for="`${name}-${opt.id}`"
          class="flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-base transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary lg:min-w-[140px]"
          :class="chipClasses(opt)"
        >
          <span
            class="size-2 shrink-0 rounded-full bg-current"
            :class="sizeColor(opt.colorSlot).class"
            aria-hidden="true"
          />
          <span class="flex min-w-0 flex-1 flex-col wrap-anywhere">
            <span>{{ opt.name }}</span>
            <span
              v-if="isUsed(opt.id)"
              class="text-xs"
            >{{ SALE_COPY.usedInSale }}</span>
            <span
              v-else-if="opt.archived"
              class="text-xs"
            >{{ SALE_COPY.archived }}</span>
          </span>
          <UIcon
            v-if="modelValue === opt.id"
            name="i-lucide-check"
            class="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        </label>
      </div>
    </div>
  </div>

  <!-- More than 6 active sizes: the phone's own picker, as feature 03's status filter. -->
  <select
    v-else
    :aria-label="groupLabel"
    :disabled="disabled"
    class="h-11 w-full appearance-none rounded-md bg-default ps-3 pe-10 text-base text-highlighted ring ring-inset ring-accented transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-75"
    :value="modelValue ?? ''"
    @change="onChange(($event.target as HTMLSelectElement).value)"
  >
    <option
      value=""
      disabled
    >
      {{ SALE_COPY.sizeLabel }}
    </option>
    <option
      v-for="opt in options"
      :key="opt.id"
      :value="opt.id"
      :disabled="isUsed(opt.id)"
    >
      {{ isUsed(opt.id) ? SALE_COPY.usedSizeOption(opt.name) : opt.archived ? `${opt.name} (${SALE_COPY.archived})` : opt.name }}
    </option>
  </select>
</template>
