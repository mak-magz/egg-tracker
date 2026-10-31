<!-- Reset request (T19, AC8a). §2.5 "Reset your password" / "Check your email". -->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { forgotPasswordSchema } from '#shared/schemas/auth'
import type { ForgotPasswordInput } from '#shared/schemas/auth'
import { AUTH_ERROR_COPY } from '~/utils/auth-errors'

definePageMeta({ layout: 'auth', auth: 'guest' })
useHead({ title: 'Reset your password · Tamago' })

const { requestPasswordReset } = useAuthActions()
const { validateOn, eager, onError } = useSubmitValidation()
const toast = useToast()

const lastEmail = useState('auth:lastEmail', () => '')
const state = reactive({ email: lastEmail.value })
watch(() => state.email, v => (lastEmail.value = v))

const sent = ref(false)
const submitting = ref(false)
const resending = ref(false)
const errorMessage = ref<string | null>(null)

async function send(email: string): Promise<boolean> {
  errorMessage.value = null
  const result = await requestPasswordReset(email)
  if (result.ok) return true
  errorMessage.value = AUTH_ERROR_COPY[result.kind]
  return false
}

async function onSubmit(event: FormSubmitEvent<ForgotPasswordInput>) {
  submitting.value = true
  // Same confirmation whether or not the account exists (AC8a): Firebase Auth doesn't tell us either.
  if (await send(event.data.email)) sent.value = true
  submitting.value = false
}

async function resend() {
  resending.value = true
  if (await send(state.email.trim())) toast.add({ title: 'Reset link sent', icon: 'i-lucide-check' })
  resending.value = false
}
</script>

<template>
  <AuthCard
    v-if="!sent"
    title="Reset your password"
    description="Enter your email and we'll send you a reset link."
  >
    <AuthBanner
      v-if="errorMessage"
      :message="errorMessage"
    />

    <UForm
      :schema="forgotPasswordSchema"
      :state="state"
      :validate-on="validateOn"
      :loading-auto="false"
      :disabled="submitting"
      class="flex flex-col gap-5"
      @submit="onSubmit"
      @error="onError"
    >
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
          enterkeyhint="send"
          placeholder="you@yourfarm.com"
          size="xl"
          class="w-full"
          autofocus
        />
      </UFormField>

      <UButton
        type="submit"
        size="xl"
        block
        :loading="submitting"
        label="Send reset link"
      />
    </UForm>

    <UButton
      to="/login"
      variant="link"
      size="xl"
      block
      label="Back to sign in"
    />
  </AuthCard>

  <AuthCard
    v-else
    title="Check your email"
    description="If that email has an account, we've sent a reset link."
  >
    <AuthBanner
      v-if="errorMessage"
      :message="errorMessage"
    />
    <UButton
      to="/login"
      color="neutral"
      variant="outline"
      size="xl"
      block
      label="Back to sign in"
    />
    <UButton
      variant="link"
      size="xl"
      block
      :loading="resending"
      label="Didn't get it? Send again"
      @click="resend"
    />
  </AuthCard>
</template>
