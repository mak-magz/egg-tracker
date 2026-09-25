<!-- Sign-in (T18: AC1–AC8, AC10, AC11 banner). Design: template.html sign-in card; §2.5 "Sign-in". -->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { signInSchema } from '#shared/schemas/auth'
import type { SignInInput } from '#shared/schemas/auth'
import { safeReturnTo } from '#shared/utils/return-to'
import { AUTH_ERROR_COPY } from '~/utils/auth-errors'

definePageMeta({ layout: 'auth', auth: 'guest' })
useHead({ title: 'Sign in · Tamago' })

const route = useRoute()
const { signIn } = useAuthActions()
const { validateOn, eager, onError } = useSubmitValidation()

// Shared with /forgot-password so a typed email carries over (§3.5), never through the URL.
const lastEmail = useState('auth:lastEmail', () => '')
const state = reactive({ email: lastEmail.value, password: '' })
watch(() => state.email, v => (lastEmail.value = v))

const expired = ref(route.query.reason === 'expired')
const errorMessage = ref<string | null>(null)
const submitting = ref(false)
const passwordInput = useTemplateRef<{ focus: () => void }>('passwordInput')
const form = useTemplateRef<{ clear: (path?: string) => void }>('form')

async function onSubmit(event: FormSubmitEvent<SignInInput>) {
  expired.value = false
  errorMessage.value = null
  submitting.value = true
  const result = await signIn(event.data.email, event.data.password)
  if (result.ok) {
    // Keep the spinner through the navigation: no toast on success (§2.5).
    await navigateTo(safeReturnTo(route.query.redirect) ?? '/', { replace: true })
    return
  }
  submitting.value = false
  errorMessage.value = AUTH_ERROR_COPY[result.kind]
  if (result.kind === 'invalid_credentials') {
    state.password = ''
    await nextTick()
    // The banner explains it; no extra 'Enter your password' under the emptied field.
    form.value?.clear('password')
    passwordInput.value?.focus()
  }
}
</script>

<template>
  <AuthCard
    title="Tamago"
    description="Sign in to your tracker"
  >
    <AuthBanner
      v-if="errorMessage"
      :message="errorMessage"
    />
    <AuthBanner
      v-else-if="expired"
      tone="info"
      :message="AUTH_ERROR_COPY.session_expired"
    />

    <UForm
      ref="form"
      :schema="signInSchema"
      :state="state"
      :validate-on="validateOn"
      :loading-auto="false"
      :disabled="submitting"
      class="flex flex-col gap-5"
      @submit="onSubmit"
      @error="onError"
    >
      <div class="flex flex-col gap-3">
        <UFormField
          label="Email"
          name="email"
          size="xl"
          :eager-validation="eager"
        >
          <UInput
            v-model="state.email"
            type="email"
            inputmode="email"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="next"
            placeholder="you@yourfarm.com"
            size="xl"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField
          label="Password"
          name="password"
          size="xl"
          :eager-validation="eager"
        >
          <PasswordInput
            ref="passwordInput"
            v-model="state.password"
            autocomplete="current-password"
            enterkeyhint="go"
            placeholder="••••••••"
          />
        </UFormField>
      </div>

      <UButton
        type="submit"
        size="xl"
        block
        :loading="submitting"
        label="Sign in"
      />
    </UForm>

    <UButton
      to="/forgot-password"
      variant="link"
      size="xl"
      block
      label="Forgot password?"
    />
  </AuthCard>
</template>
