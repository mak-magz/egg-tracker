<!--
  Shared trays + loose input (feature 01 §2.5 "Quantity entry", §3.4; reused by Sales later).
  Two fields, each [−][ n ][+], 44px targets below lg (AC5). Emits the two raw fields and, via
  `update:eggs`, the egg total through toEggs(). eggsPerTray always comes from the farm.

  - Trays: min 0, no max. Loose: min 0 and NO `max` prop: reka's NumberField clamps to max on blur,
    and UX requires validate-not-clamp (the form schema shows "Loose eggs must be under {n}…").
    The loose + stepper is disabled at eggsPerTray − 1 instead.
  - Letters, "-", "." and "," can't be typed (reka rejects them: min 0 + no fraction digits).
  - Blank stays blank (null) and counts as 0. The steppers are our own buttons (tabindex −1, so Tab
    and the keypad's Next go field to field): reka's built-in + turns a blank field into 0, not 1.
  - reka only commits a typed value on blur/Enter, so we also parse each `input` event; the live
    total, the discard check and Save then always see what's on screen.
  - When `name` is set, each field is a UFormField (`{name}.trays` / `{name}.loose`) so the parent
    UForm can mark the offending input. Their messages are screen-reader-only (linked through
    aria-describedby); the visible message is the `error` prop, shown once under the row.
-->
<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { toEggs } from '#shared/utils/quantity'

export interface QuantityValue {
  trays: number | null
  loose: number | null
}

const props = withDefaults(defineProps<{
  eggsPerTray: number
  /** Used in accessible names: "{label} trays", "{label} loose eggs", "Increase {label} trays". */
  label: string
  /** Form path prefix for UFormField (e.g. `lines.<sizeId>`); omit outside a UForm. */
  name?: string
  /** Id prefix for the two inputs: `{idPrefix}-trays`, `{idPrefix}-loose`. */
  idPrefix: string
  /** The last quantity field of the form: its keypad key reads "done". */
  last?: boolean
  /** Show the design's inline "trays" / "loose" labels at lg+ (phones use the form's column headers). */
  inlineLabels?: boolean
  /** Visible message under the row. */
  error?: string
  disabled?: boolean
}>(), {
  name: undefined,
  last: false,
  inlineLabels: false,
  error: undefined,
  disabled: false,
})

const model = defineModel<QuantityValue>({ required: true })
const emit = defineEmits<{ 'update:eggs': [eggs: number | null] }>()

type Part = keyof QuantityValue

const breakpoints = useBreakpoints(breakpointsTailwind)
const isLg = breakpoints.greaterOrEqual('lg')
const size = computed(() => (isLg.value ? 'lg' : 'xl'))

const looseMax = computed(() => props.eggsPerTray - 1)

function setPart(part: Part, value: number | null | undefined) {
  const v = value === undefined || value === null || Number.isNaN(value) ? null : value
  if (model.value[part] === v) return
  model.value = { ...model.value, [part]: v }
  const { trays, loose } = model.value
  const t = trays ?? 0
  const l = loose ?? 0
  emit('update:eggs', Number.isInteger(t) && Number.isInteger(l) && t >= 0 && l >= 0 ? toEggs(t, l, props.eggsPerTray) : null)
}

function onTyped(part: Part, event: Event) {
  const raw = (event.target as HTMLInputElement | null)?.value ?? ''
  const digits = raw.trim()
  if (digits === '') return setPart(part, null)
  if (/^\d+$/.test(digits)) setPart(part, Number(digits))
}

function step(part: Part, delta: 1 | -1) {
  const current = model.value[part] ?? 0
  const next = Math.max(0, current + delta)
  setPart(part, part === 'loose' && delta > 0 ? Math.min(next, Math.max(current, looseMax.value)) : next)
}

function selectAll(event: FocusEvent) {
  const el = event.target as HTMLInputElement | null
  // Pre-filled values (Edit) are replaced by typing rather than appended to.
  if (el?.value) requestAnimationFrame(() => el.select())
}

const parts = computed(() => [
  {
    part: 'trays' as const,
    inline: 'trays',
    id: `${props.idPrefix}-trays`,
    inputLabel: `${props.label} trays`,
    incLabel: `Increase ${props.label} trays`,
    decLabel: `Decrease ${props.label} trays`,
    incDisabled: false,
    enterkeyhint: 'next',
  },
  {
    part: 'loose' as const,
    inline: 'loose',
    id: `${props.idPrefix}-loose`,
    inputLabel: `${props.label} loose eggs`,
    incLabel: `Increase ${props.label} loose eggs`,
    decLabel: `Decrease ${props.label} loose eggs`,
    incDisabled: (model.value.loose ?? 0) >= looseMax.value,
    enterkeyhint: props.last ? 'done' : 'next',
  },
])
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        v-for="p in parts"
        :key="p.part"
        class="flex items-center gap-1.5 lg:gap-1"
      >
        <span
          v-if="inlineLabels"
          class="hidden w-8 shrink-0 text-sm text-dimmed lg:inline"
          aria-hidden="true"
        >{{ p.inline }}</span>
        <UFormField
          :name="name ? `${name}.${p.part}` : undefined"
          :ui="{ error: 'sr-only' }"
        >
          <UFieldGroup :size="size">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-minus"
              tabindex="-1"
              :aria-label="p.decLabel"
              :disabled="disabled || !((model[p.part] ?? 0) > 0)"
              class="size-11 justify-center lg:size-10"
              @click="step(p.part, -1)"
            />
            <UInputNumber
              :id="p.id"
              :model-value="model[p.part]"
              :min="0"
              :increment="false"
              :decrement="false"
              :format-options="{ useGrouping: false, maximumFractionDigits: 0 }"
              disable-wheel-change
              :disabled="disabled"
              :aria-label="p.inputLabel"
              placeholder="0"
              inputmode="numeric"
              pattern="[0-9]*"
              :enterkeyhint="p.enterkeyhint"
              autocomplete="off"
              data-qty-input
              class="w-15 lg:w-12"
              :ui="{ base: 'h-11 lg:h-10 px-1 text-center text-base tabular-nums' }"
              @update:model-value="(v: number | null) => setPart(p.part, v)"
              @input="(e: Event) => onTyped(p.part, e)"
              @focus="selectAll"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              tabindex="-1"
              :aria-label="p.incLabel"
              :disabled="disabled || p.incDisabled"
              class="size-11 justify-center lg:size-10"
              @click="step(p.part, 1)"
            />
          </UFieldGroup>
        </UFormField>
      </div>
    </div>
    <p
      v-if="error"
      class="flex items-start gap-1.5 text-sm text-error"
      aria-hidden="true"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="mt-0.5 size-4 shrink-0"
      />
      <span>{{ error }}</span>
    </p>
  </div>
</template>
