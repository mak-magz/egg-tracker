// "Validate on submit, not while typing. After a failed submit, clear each field's message as soon as
// that field becomes valid. Focus the first invalid field." (§2.5 Flow A)
// Bind `validateOn` on UForm, `eager` as UFormField `eager-validation`, and `onError` to @error.
import type { FormErrorEvent } from '@nuxt/ui'

export function useSubmitValidation() {
  const submitted = ref(false)

  const validateOn = computed(() => (submitted.value ? (['input', 'change', 'blur'] as const) : ([] as const)))

  function onError(event: FormErrorEvent) {
    submitted.value = true
    const id = event.errors[0]?.id
    if (id) document.getElementById(id)?.focus()
  }

  return {
    validateOn: computed(() => [...validateOn.value]),
    eager: computed(() => submitted.value),
    onError,
  }
}
