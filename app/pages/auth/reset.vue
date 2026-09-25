<!--
  Reset-link callback (T19, AC8a; §3.5 D9). SSR renders only "Checking your link…". verifyOtp runs in
  onMounted (client-side), so email link scanners that don't run JS can't use up the one-time token.
  The token is then removed from the URL and history.
-->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { newPasswordSchema } from '#shared/schemas/auth'
import type { NewPasswordInput } from '#shared/schemas/auth'
import { PASSWORD_MIN_LENGTH } from '#shared/constants/auth'
import { AUTH_ERROR_COPY } from '~/utils/auth-errors'

definePageMeta({ layout: 'auth', auth: 'public' })
useHead({ title: 'Set a new password · Tamago' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { verifyRecovery, updatePassword } = useAuthActions()
const { validateOn, eager, onError } = useSubmitValidation()

type Phase = 'checking' | 'valid' | 'expired' | 'network'
const phase = ref<Phase>('checking')
const tokenHash = ref<string | null>(null)

const state = reactive({ password: '', confirmPassword: '' })
const saving = ref(false)
const errorMessage = ref<string | null>(null)

async function check() {
  phase.value = 'checking'
  if (!tokenHash.value) {
    phase.value = 'expired'
    return
  }
  phase.value = await verifyRecovery(tokenHash.value)
  if (phase.value !== 'network') tokenHash.value = null // single use either way
}

onMounted(async () => {
  const { token_hash: hash, type } = route.query
  tokenHash.value = typeof hash === 'string' && hash && type === 'recovery' ? hash : null
  await router.replace({ query: {} })
  await check()
})

async function onSubmit(event: FormSubmitEvent<NewPasswordInput>) {
  errorMessage.value = null
  saving.value = true
  const result = await updatePassword(event.data.password)
  if (result.ok) {
    toast.add({ title: 'Password updated', icon: 'i-lucide-check' })
    await navigateTo('/', { replace: true })
    return
  }
  saving.value = false
  errorMessage.value = AUTH_ERROR_COPY[result.kind]
}
</script>

<template>
  <AuthCard
    v-if="phase === 'checking'"
    title="Set a new password"
  >
    <p
      class="flex items-center justify-center gap-2 text-base text-muted"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-5 animate-spin motion-reduce:animate-none"
      />
      Checking your link…
    </p>
  </AuthCard>

  <AuthCard
    v-else-if="phase === 'network'"
    title="Set a new password"
  >
    <AuthBanner :message="AUTH_ERROR_COPY.network" />
    <UButton
      size="xl"
      block
      label="Try again"
      @click="check"
    />
  </AuthCard>

  <AuthCard
    v-else-if="phase === 'expired'"
    title="This reset link has expired"
    description="Reset links work once and expire after a while. Request a new one."
  >
    <UButton
      to="/forgot-password"
      size="xl"
      block
      label="Send a new link"
    />
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
    title="Set a new password"
  >
    <AuthBanner
      v-if="errorMessage"
      :message="errorMessage"
    />

    <UForm
      :schema="newPasswordSchema"
      :state="state"
      :validate-on="validateOn"
      :loading-auto="false"
      :disabled="saving"
      class="flex flex-col gap-5"
      @submit="onSubmit"
      @error="onError"
    >
      <div class="flex flex-col gap-3">
        <UFormField
          label="New password"
          name="password"
          size="xl"
          :help="`At least ${PASSWORD_MIN_LENGTH} characters`"
          :eager-validation="eager"
        >
          <PasswordInput
            v-model="state.password"
            autocomplete="new-password"
            enterkeyhint="next"
            autofocus
          />
        </UFormField>

        <UFormField
          label="Confirm new password"
          name="confirmPassword"
          size="xl"
          :eager-validation="eager"
        >
          <PasswordInput
            v-model="state.confirmPassword"
            autocomplete="new-password"
            enterkeyhint="done"
          />
        </UFormField>
      </div>

      <UButton
        type="submit"
        size="xl"
        block
        :loading="saving"
        label="Save and sign in"
      />
    </UForm>
  </AuthCard>
</template>
