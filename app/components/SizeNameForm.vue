<!--
  The inline size-name form, shared by Add (replaces the Add size button) and Rename (replaces the row):
  feature 02 §2.5 "Inline forms", R3, States "Add" / "Rename". Name only. The checks are the shared
  checkSizeName() (trim, collapse spaces, 1 to 40, case-insensitive match against EVERY size, archived ones
  included, except the size being renamed), so the form and the server say the same thing.

  - No maxlength: a pasted long name gets a message instead of being cut.
  - Checks run when the field loses focus (once something is typed) and when Save is tapped; once a message
    has shown, on every keystroke, and it clears the moment the name is valid.
  - Save is disabled (dimmed, aria-disabled) only while a message shows; before any message it's enabled, so
    an empty tap gives the message instead of a dead button. Enter does the same as Save.
  - A name that matches an ARCHIVED size gets "{Name} is archived. Restore it instead." and a Restore button
    (emits `restore`), one tap instead of a trip to the Archived card.
  - The parent owns the save. On a failure it passes `error` (the "Couldn't save" alert) or `serverName`
    (the server refused the name); the typed name stays either way. Esc / Cancel emit `cancel`.
-->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { FarmSize, SizeNameMatch } from '#shared/types/api'
import { checkSizeName } from '#shared/utils/size-name'
import type { SizeNameCheck } from '#shared/utils/size-name'

/** A name problem to show under the field. `existing` adds the Restore button when it is archived. */
export interface SizeNameProblem {
  message: string
  existing?: SizeNameMatch
}

const props = defineProps<{
  mode: 'add' | 'rename'
  /** The farm's whole list (active and archived): the live name check runs against it. */
  sizes: readonly FarmSize[]
  /** Rename: the size being renamed (excluded from the clash check) and its current name (pre-filled). */
  selfId?: string
  initialName?: string
  /** A change is being saved: Save spins, the field is read-only, Cancel is disabled. */
  saving?: boolean
  /** The "Couldn't save" alert (network or server failure). */
  error?: string | null
  /** The server refused the name (400 / 409): shown on the field. Cleared when the name is edited. */
  serverName?: SizeNameProblem | null
  /** The Restore-in-message button is running. */
  restoring?: boolean
  /** Everything else on the card is busy (another change is in flight). */
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [name: string]
  cancel: []
  restore: [id: string]
}>()

const isRename = computed(() => props.mode === 'rename')
const state = reactive({ name: props.initialName ?? '' })
const name = toRef(state, 'name')

const invalid = ref<Exclude<SizeNameCheck, { ok: true }> | null>(null)
const server = ref<SizeNameProblem | null>(props.serverName ?? null)
watch(() => props.serverName, (v) => {
  server.value = v ?? null
})
// Editing the name clears a server complaint about the old one.
watch(name, () => {
  server.value = null
  if (invalid.value) recheck()
})

function check(): SizeNameCheck {
  return checkSizeName(name.value, props.sizes, props.selfId)
}
function recheck(): SizeNameCheck {
  const result = check()
  invalid.value = result.ok ? null : result
  return result
}

const problem = computed<SizeNameProblem | null>(() => {
  if (server.value) return server.value
  return invalid.value ? { message: invalid.value.message, existing: invalid.value.existing } : null
})
/** Only an ARCHIVED match gets the Restore button (an active one has nothing to restore). */
const restorable = computed(() => (problem.value?.existing?.archived ? problem.value.existing : null))

const inputRef = useTemplateRef<{ inputRef: HTMLInputElement | null }>('input')
onMounted(() => {
  // The owner just tapped Add size / Rename, so the keypad opening is expected. Rename pre-selects the name.
  const el = inputRef.value?.inputRef
  el?.focus()
  if (isRename.value) el?.select()
  el?.scrollIntoView({ block: 'center' })
})

function onBlur() {
  // A blank field that's abandoned (tapping away) doesn't get a message; Save does. Pressing Cancel or Save
  // never gets here: see `mousedown.prevent` on the button row.
  if (name.value.trim() !== '') recheck()
}

function onSubmit(_event: FormSubmitEvent<unknown>) {
  if (props.saving || props.disabled) return
  const result = recheck()
  if (!result.ok) {
    inputRef.value?.inputRef?.focus()
    return
  }
  // A rename that leaves the name exactly as it is closes the form: no request, no toast. A change of
  // capitalisation or spacing only is a real change (AC7).
  if (isRename.value && result.name === props.initialName) return emit('cancel')
  emit('submit', result.name)
}

function onCancel() {
  if (!props.saving) emit('cancel')
}

defineExpose({ focus: () => inputRef.value?.inputRef?.focus() })
</script>

<template>
  <UForm
    :state="state"
    :loading-auto="false"
    class="flex flex-col gap-3 rounded-md bg-muted p-3"
    novalidate
    @submit="onSubmit"
    @keydown.esc.stop="onCancel"
  >
    <UFormField
      :label="SIZE_COPY.nameLabel"
      name="name"
      size="xl"
      :error="problem?.message"
      :help="isRename ? SIZE_COPY.renameHelp : undefined"
      :ui="{ label: 'text-base font-medium', help: 'mt-1.5 text-sm text-muted', error: 'mt-1.5 text-sm' }"
    >
      <UInput
        ref="input"
        v-model="name"
        type="text"
        size="xl"
        class="w-full"
        :placeholder="isRename ? undefined : SIZE_COPY.namePlaceholder"
        :readonly="saving"
        autocapitalize="words"
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="done"
        @blur="onBlur"
      />
      <!-- Only provided while there is a problem: a slot always renders the error block and hides the help. -->
      <template
        v-if="problem"
        #error
      >
        <span class="flex flex-col items-start gap-1 text-error">
          <span class="flex items-start gap-1.5">
            <UIcon
              name="i-lucide-circle-alert"
              class="mt-0.5 size-4 shrink-0"
            />
            <span>{{ problem.message }}</span>
          </span>
          <UButton
            v-if="restorable"
            color="primary"
            variant="link"
            size="xl"
            icon="i-lucide-rotate-ccw"
            class="min-h-11 px-0"
            :label="SIZE_COPY.restoreNamed(restorable.name)"
            :loading="restoring"
            :disabled="restoring || disabled || saving"
            @click="emit('restore', restorable.id)"
          />
        </span>
      </template>
    </UFormField>

    <UAlert
      v-if="error"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
    />

    <!--
      Pressing Cancel or Save must not blur the field: the blur re-check would show a message, the buttons would
      move down between finger-down and finger-up, and the tap would be lost. `mousedown.prevent` keeps the focus
      where it is (mouse, and the mouse event a touch tap sends); click, Enter and keyboard Tab still work, and
      Save re-checks anyway. A tap anywhere else still blurs the field and checks it (AC4).
    -->
    <div
      class="flex gap-3"
      @mousedown.prevent
    >
      <UButton
        color="neutral"
        variant="ghost"
        size="xl"
        class="justify-center lg:min-h-10"
        :label="SIZE_COPY.cancel"
        :disabled="saving"
        @click="onCancel"
      />
      <UButton
        type="submit"
        size="xl"
        class="flex-1 justify-center lg:flex-none lg:min-h-10 lg:px-6"
        :label="isRename ? SIZE_COPY.save : SIZE_COPY.add"
        :loading="saving"
        :disabled="saving || disabled || !!problem"
        :aria-disabled="problem ? 'true' : undefined"
      />
    </div>
  </UForm>
</template>
