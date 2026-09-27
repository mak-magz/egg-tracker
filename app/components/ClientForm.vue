<!--
  Add / Edit client: the whole sheet or dialog content (header, scrolling body, pinned footer) inside one UForm
  (feature 03 UX "Add client", "Edit client", "Validation and error variants", R1 to R3, AC8 to AC19, AC33).
  SELF-CONTAINED (AC34): the fields, the live checks, the discard check's `dirty`, the submission id, the save
  call and the "Mark {Name} active" shortcut all live here. It knows nothing about which screen opened it and never
  navigates. The Clients screen hosts it in ClientFormOverlay; the Sales client picker will host the same component
  (`initialName` pre-fills Name from what was typed into the picker). It reads the farm's loaded client list
  (useClients) for the local name check, and the currency (useFarm) for the price prefix.

  Checks (R3): a field is checked when it loses focus and when Save is tapped; once a message has shown it re-checks
  on every keystroke and the message clears the moment the value is valid. Save is dimmed and disabled only while a
  message shows (before any message it is enabled, so an empty tap gives the message). Enter / Go saves from any
  field. No `maxlength`: a pasted long name gets a message instead of being cut. Leaving a field tidies it visibly
  (name and phone trimmed, spaces collapsed in the name, a valid price shown with 2 decimals).
  A failed save keeps every typed value. Emits `saved` with what happened; the host closes.
-->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Client, NameMatch } from '#shared/types/api'
import { CLIENT_FIELDS, CLIENT_MESSAGES } from '#shared/constants/clients'
import { checkClientName, checkClientPhone, normalizeClientName, normalizeClientPhone } from '#shared/utils/client-name'
import { formatPriceInput, parsePriceInput, priceProblemMessage } from '#shared/utils/price'
import type { ClientError } from '~/utils/client-errors'
import type { ClientInput } from '~/utils/client-mutations'

/** What happened, for the host's toast: `unchanged` (Edit, nothing differs) has no request and no toast. */
export interface ClientSavedEvent {
  kind: 'added' | 'updated' | 'unchanged' | 'activated'
  client: Client
}

/** A message under the Name field. `existing` adds the "Mark {Name} active" button when it is inactive (Add only). */
interface NameProblem {
  message: string
  existing?: NameMatch
}

const props = defineProps<{
  mode: 'add' | 'edit'
  /** Edit: the client being edited, as the list had it when the form opened (its `version` goes back with the save). */
  client?: Client | null
  /** Add: a starting name, e.g. what the Sales picker's search box held. */
  initialName?: string
}>()

const emit = defineEmits<{
  'saved': [event: ClientSavedEvent]
  'changed-elsewhere': []
  'cancel': []
}>()

const { clients } = useClients()
const { currency, currencySymbol } = useFarm()
const mutations = useClientMutations()

const edited = computed(() => (props.mode === 'edit' ? (props.client ?? null) : null))
const isEdit = computed(() => edited.value !== null)

// ---- State -----------------------------------------------------------------------------------------
const state = reactive({
  name: edited.value?.name ?? props.initialName ?? '',
  phone: edited.value?.phone ?? '',
  price: edited.value?.defaultPrice != null ? formatPriceInput(edited.value.defaultPrice) : '',
})
const initial = { ...state }

const restoring = ref(false)
const saving = computed(() => mutations.saving.value)
const busy = computed(() => saving.value || restoring.value)
const formError = ref<string | null>(null)

// ---- Checks ----------------------------------------------------------------------------------------
const nameShown = ref<NameProblem | null>(null)
const phoneShown = ref<string | null>(null)
const priceShown = ref<string | null>(null)
/** The server refused the name (a clash it saw first, or a rule): shown until the name is edited. */
const nameServer = ref<NameProblem | null>(null)

const nameProblem = computed(() => nameServer.value ?? nameShown.value)
const hasProblem = computed(() => !!(nameProblem.value || phoneShown.value || priceShown.value))
/** Only an INACTIVE match gets the shortcut button, and only when adding (UX flow F). */
const markable = computed(() => (!isEdit.value && nameProblem.value?.existing?.archived ? nameProblem.value.existing : null))

function checkName() {
  const result = checkClientName(state.name, clients.value, edited.value?.id)
  nameShown.value = result.ok ? null : { message: result.message, existing: result.existing }
  return result
}
function checkPhone() {
  const result = checkClientPhone(state.phone)
  phoneShown.value = result.ok ? null : result.message
  return result
}
function checkPrice() {
  const result = parsePriceInput(state.price)
  priceShown.value = result.ok ? null : priceProblemMessage(result.reason, currency.value)
  return result
}

// Editing a field clears a server complaint about its old value; once a message has shown, re-check per keystroke.
watch(() => state.name, () => {
  nameServer.value = null
  if (nameShown.value) checkName()
})
watch(() => state.phone, () => {
  if (phoneShown.value) checkPhone()
})
watch(() => state.price, () => {
  if (priceShown.value) checkPrice()
})

// On leaving a field: tidy it where it stands (so what is saved is what the owner sees), then check it. A blank
// field that is abandoned gets no message; Save gives it.
function onNameBlur() {
  state.name = normalizeClientName(state.name)
  if (state.name !== '') checkName()
}
function onPhoneBlur() {
  state.phone = normalizeClientPhone(state.phone) ?? ''
  if (state.phone !== '') checkPhone()
}
function onPriceBlur() {
  state.price = state.price.trim()
  if (state.price === '') return
  const result = checkPrice()
  if (result.ok && result.value !== null) state.price = formatPriceInput(result.value)
}

// ---- Dirty (the discard check, AC17) ---------------------------------------------------------------
// Add: anything typed (spaces only count as empty). Edit: anything that would change the client. Compared as
// values, so "250" against a pre-filled "250.00" is not a change.
const dirty = computed(() => {
  if (normalizeClientName(state.name) !== normalizeClientName(initial.name)) return true
  if ((normalizeClientPhone(state.phone) ?? '') !== (normalizeClientPhone(initial.phone) ?? '')) return true
  const now = parsePriceInput(state.price)
  const before = parsePriceInput(initial.price)
  if (!now.ok || !before.ok) return state.price.trim() !== initial.price.trim()
  return now.value !== before.value
})

// ---- Focus -----------------------------------------------------------------------------------------
type InputRef = { inputRef: HTMLInputElement | null }
const nameInput = useTemplateRef<InputRef>('nameInput')
const phoneInput = useTemplateRef<InputRef>('phoneInput')
const priceInput = useTemplateRef<InputRef>('priceInput')

function focusEl(el: HTMLInputElement | null | undefined, select = false) {
  if (!el) return
  el.focus()
  if (select) el.select()
  el.scrollIntoView({ block: 'center' })
}
function focusName(select = false) {
  focusEl(nameInput.value?.inputRef, select)
}
function focusFirstProblem() {
  if (nameProblem.value) focusEl(nameInput.value?.inputRef)
  else if (phoneShown.value) focusEl(phoneInput.value?.inputRef)
  else if (priceShown.value) focusEl(priceInput.value?.inputRef)
}

// Edit: focusing a pre-filled field selects its content, so typing replaces it (feature 01).
function selectOnFocus(event: FocusEvent) {
  if (!isEdit.value) return
  const el = event.target as HTMLInputElement | null
  if (el) requestAnimationFrame(() => el.select())
}
// Keep the focused field visible above the on-screen keypad (AC24, feature 01 AC5).
function onFocusIn(event: FocusEvent) {
  const target = event.target as HTMLElement | null
  if (target instanceof HTMLInputElement && window.matchMedia('(max-width: 1023px)').matches) {
    setTimeout(() => target.scrollIntoView({ block: 'center' }), 300)
  }
}

// ---- Save ------------------------------------------------------------------------------------------
function nameProblemFrom(error: ClientError): NameProblem | null {
  const existing = error.existing
  if (existing) {
    const message = !existing.archived
      ? CLIENT_MESSAGES.nameTaken(existing.name)
      : isEdit.value ? CLIENT_MESSAGES.nameInactiveEdit(existing.name) : CLIENT_MESSAGES.nameInactive(existing.name)
    return { message, existing }
  }
  const message = error.fields?.[CLIENT_FIELDS.name]
  return message ? { message } : null
}

/** A failed save: the typed values stay; each kind goes where UX R2 says. */
function handleFailure(error: ClientError) {
  switch (error.kind) {
    case 'name_taken': {
      const problem = nameProblemFrom(error)
      if (problem) {
        nameServer.value = problem
        focusName()
        return
      }
      break
    }
    case 'invalid': {
      const fields = error.fields ?? {}
      let mapped = false
      if (fields[CLIENT_FIELDS.name]) {
        nameServer.value = { message: fields[CLIENT_FIELDS.name]! }
        mapped = true
      }
      if (fields[CLIENT_FIELDS.phone]) {
        phoneShown.value = fields[CLIENT_FIELDS.phone]!
        mapped = true
      }
      if (fields[CLIENT_FIELDS.defaultPrice]) {
        priceShown.value = fields[CLIENT_FIELDS.defaultPrice]!
        mapped = true
      }
      if (mapped) {
        focusFirstProblem()
        return
      }
      break
    }
    case 'limit':
      formError.value = CLIENT_MESSAGES.limitReached
      return
    case 'changed':
    case 'not_found':
      // The list has already refreshed (the mutations did it); the host closes the form and says so (AC19).
      if (isEdit.value) {
        emit('changed-elsewhere')
        return
      }
      break
  }
  formError.value = CLIENT_COPY.saveFailed
}

async function onSubmit(_event: FormSubmitEvent<unknown>) {
  if (busy.value) return
  formError.value = null
  const name = checkName()
  const phone = checkPhone()
  const price = checkPrice()
  if (!name.ok || !phone.ok || !price.ok || nameServer.value) {
    focusFirstProblem()
    return
  }
  const input: ClientInput = { name: name.name, phone: phone.phone, defaultPrice: price.value }
  // Show what will be saved (the tidied values), like leaving each field would.
  state.name = input.name
  state.phone = input.phone ?? ''
  if (input.defaultPrice !== null) state.price = formatPriceInput(input.defaultPrice)

  const client = edited.value
  if (client) {
    // Nothing changed: close, no request, no toast (AC18). A change of capitalisation or spacing is a change.
    if (input.name === client.name && input.phone === client.phone && input.defaultPrice === client.defaultPrice) {
      emit('saved', { kind: 'unchanged', client })
      return
    }
    const result = await mutations.update(client, input)
    if (!result) return
    if (result.ok) emit('saved', { kind: 'updated', client: result.data.client })
    else handleFailure(result.error)
    return
  }

  const result = await mutations.add(input)
  if (!result) return
  if (result.ok) emit('saved', { kind: 'added', client: result.data.client })
  else handleFailure(result.error)
}

/** Flow F: the name is an inactive client's. One tap makes it active instead of adding a second one. */
async function markActive() {
  const target = markable.value
  if (!target || busy.value) return
  formError.value = null
  restoring.value = true
  const result = await mutations.restore(target.id)
  restoring.value = false
  if (!result) return
  if (result.ok) emit('saved', { kind: 'activated', client: result.data.client })
  else formError.value = CLIENT_COPY.markActiveFailed(target.name)
}

function onCancel() {
  if (!busy.value) emit('cancel')
}

defineExpose({ dirty, saving: busy, focusName })
</script>

<template>
  <UForm
    :state="state"
    :loading-auto="false"
    class="flex min-h-0 flex-1 flex-col"
    novalidate
    @submit="onSubmit"
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2 sm:ps-5">
      <h2 class="flex min-w-0 flex-1 items-center gap-2 text-lg font-bold text-highlighted">
        {{ isEdit ? CLIENT_COPY.editTitle : CLIENT_COPY.addTitle }}
        <ClientStatusBadge
          v-if="edited && !edited.active"
          :active="false"
        />
      </h2>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :aria-label="CLIENT_COPY.close"
        class="size-11 justify-center lg:size-10"
        :disabled="busy"
        @click="onCancel"
      />
    </div>

    <!-- Body (scrolls) -->
    <div
      class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain p-4 sm:p-5"
      @focusin="onFocusIn"
    >
      <UFormField
        :label="CLIENT_COPY.nameLabel"
        name="name"
        size="xl"
        :error="nameProblem?.message"
        :ui="{ label: 'text-base font-medium', error: 'mt-1.5 text-sm' }"
      >
        <UInput
          ref="nameInput"
          v-model="state.name"
          type="text"
          size="xl"
          class="w-full"
          :placeholder="CLIENT_COPY.namePlaceholder"
          :readonly="busy"
          autocapitalize="words"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          @focus="selectOnFocus"
          @blur="onNameBlur"
        />
        <!-- Only provided while there is a problem: a slot always renders the error block. -->
        <template
          v-if="nameProblem"
          #error
        >
          <span class="flex flex-col items-start gap-1 text-error">
            <span class="flex items-start gap-1.5">
              <UIcon
                name="i-lucide-circle-alert"
                class="mt-0.5 size-4 shrink-0"
              />
              <span>{{ nameProblem.message }}</span>
            </span>
            <UButton
              v-if="markable"
              color="primary"
              variant="link"
              size="xl"
              icon="i-lucide-user-check"
              class="min-h-11 px-0"
              :label="CLIENT_COPY.markNamedActive(markable.name)"
              :loading="restoring"
              :disabled="busy"
              @click="markActive"
            />
          </span>
        </template>
      </UFormField>

      <UFormField
        :label="CLIENT_COPY.phoneLabel"
        :hint="CLIENT_COPY.optional"
        name="phone"
        size="xl"
        :error="phoneShown ?? undefined"
        :ui="{ label: 'text-base font-medium', hint: 'text-sm text-dimmed', error: 'mt-1.5 text-sm' }"
      >
        <UInput
          ref="phoneInput"
          v-model="state.phone"
          type="tel"
          inputmode="tel"
          size="xl"
          class="w-full"
          :placeholder="CLIENT_COPY.phonePlaceholder"
          :readonly="busy"
          autocomplete="off"
          enterkeyhint="go"
          @focus="selectOnFocus"
          @blur="onPhoneBlur"
        />
        <template
          v-if="phoneShown"
          #error
        >
          <span class="flex items-start gap-1.5 text-error">
            <UIcon
              name="i-lucide-circle-alert"
              class="mt-0.5 size-4 shrink-0"
            />
            <span>{{ phoneShown }}</span>
          </span>
        </template>
      </UFormField>

      <UFormField
        :label="CLIENT_COPY.priceLabel"
        :hint="CLIENT_COPY.optional"
        name="price"
        size="xl"
        :error="priceShown ?? undefined"
        :help="CLIENT_COPY.priceHelp"
        :ui="{ label: 'text-base font-medium', hint: 'text-sm text-dimmed', help: 'mt-1.5 text-sm text-muted', error: 'mt-1.5 text-sm' }"
      >
        <UInput
          ref="priceInput"
          v-model="state.price"
          type="text"
          inputmode="decimal"
          size="xl"
          class="w-full"
          :placeholder="CLIENT_COPY.pricePlaceholder"
          :readonly="busy"
          :ui="{ base: 'pe-24' }"
          autocomplete="off"
          enterkeyhint="go"
          @focus="selectOnFocus"
          @blur="onPriceBlur"
        >
          <!-- The farm's currency, never a typed symbol; "per tray" so the number is never ambiguous (AC13). -->
          <template #leading>
            <span
              class="text-base text-muted"
              aria-hidden="true"
            >{{ currencySymbol }}</span>
          </template>
          <template #trailing>
            <span
              class="text-base text-muted"
              aria-hidden="true"
            >{{ CLIENT_COPY.priceUnit }}</span>
          </template>
        </UInput>
        <template
          v-if="priceShown"
          #error
        >
          <span class="flex items-start gap-1.5 text-error">
            <UIcon
              name="i-lucide-circle-alert"
              class="mt-0.5 size-4 shrink-0"
            />
            <span>{{ priceShown }}</span>
          </span>
        </template>
      </UFormField>
    </div>

    <!-- Footer (pinned above the keypad) -->
    <div class="flex shrink-0 flex-col gap-3 border-t border-default p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 md:pb-4">
      <UAlert
        v-if="formError"
        role="alert"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="formError"
      />
      <!--
        Pressing Cancel or Save must not blur the focused field: the blur re-check could show a message and move
        the layout between finger-down and finger-up, and the tap would be lost. `mousedown.prevent` keeps focus
        where it is (mouse, and the mouse event a touch tap sends); click, Enter and Tab still work, and Save
        re-checks anyway (same as feature 02's inline form).
      -->
      <div
        class="flex gap-3 md:justify-end"
        @mousedown.prevent
      >
        <UButton
          color="neutral"
          variant="ghost"
          size="xl"
          class="justify-center lg:min-h-10"
          :label="CLIENT_COPY.cancel"
          :disabled="busy"
          @click="onCancel"
        />
        <UButton
          type="submit"
          size="xl"
          class="flex-1 justify-center md:flex-none md:px-6 lg:min-h-10"
          :label="CLIENT_COPY.save"
          :loading="saving"
          :disabled="busy || hasProblem"
          :aria-disabled="hasProblem ? 'true' : undefined"
        />
      </div>
    </div>
  </UForm>
</template>
