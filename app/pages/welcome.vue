<!-- Welcome & First-Load Onboarding (Feature 08 AC1/Onboarding) -->
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { onboardingSchema } from '#shared/schemas/onboarding'
import type { OnboardingInput } from '#shared/schemas/onboarding'

definePageMeta({ layout: 'auth', auth: 'public' })
useHead({ title: 'Welcome to Tamago' })

const api = useApi()
const { ensure } = useMe()
const { validateOn, eager, onError } = useSubmitValidation()

const state = reactive<OnboardingInput>({
  farmName: 'My Farm',
  eggsPerTray: 30,
  currency: 'PHP',
})

watch(() => state.currency, (val) => {
  if (val) state.currency = val.toUpperCase()
})

const submitting = ref(false)
const errorMessage = ref<string | null>(null)

const TRAY_PRESETS = [30, 24, 36, 12] as const
const CURRENCY_PRESETS = ['PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD'] as const

async function onSubmit(event: FormSubmitEvent<OnboardingInput>) {
  submitting.value = true
  errorMessage.value = null

  try {
    await api('/api/farm', {
      method: 'PUT',
      body: {
        farmName: event.data.farmName,
        eggsPerTray: Number(event.data.eggsPerTray),
        currency: event.data.currency,
      },
    })

    const onboarded = useCookie('tamago_onboarded', {
      maxAge: 60 * 60 * 24 * 365 * 10,
      sameSite: 'lax',
    })
    onboarded.value = 'true'

    await ensure({ force: true })
    await navigateTo('/farm', { replace: true })
  }
  catch (err: unknown) {
    submitting.value = false
    const e = err as { data?: { message?: string }, message?: string } | undefined
    errorMessage.value = e?.data?.message || e?.message || 'Failed to save farm settings. Please try again.'
  }
}
</script>

<template>
  <UCard
    class="w-full max-w-[440px] shadow-md"
    :ui="{ body: 'p-6 sm:p-8 flex flex-col gap-6' }"
  >
    <header class="flex flex-col items-center gap-2.5 text-center">
      <AppLogo :size="48" />
      <div>
        <h1 class="text-xl font-bold text-highlighted">
          Welcome to Tamago
        </h1>
        <p class="text-sm text-muted">
          Set up your egg farm tracker in seconds. You can customize any of this later in Settings.
        </p>
      </div>
    </header>

    <AuthBanner
      v-if="errorMessage"
      :message="errorMessage"
    />

    <UForm
      :schema="onboardingSchema"
      :state="state"
      :validate-on="validateOn"
      class="flex flex-col gap-5"
      @submit="onSubmit"
      @error="onError"
    >
      <!-- Farm Name -->
      <UFormField
        label="Farm Name"
        name="farmName"
        size="xl"
        :eager-validation="eager"
      >
        <UInput
          v-model="state.farmName"
          placeholder="e.g. Sunrise Pastures"
          size="xl"
          class="w-full"
          autofocus
        />
      </UFormField>

      <!-- Eggs Per Tray -->
      <UFormField
        label="Tray Capacity"
        description="How many eggs fit in one tray on your farm"
        name="eggsPerTray"
        size="xl"
        :eager-validation="eager"
      >
        <div class="flex flex-col gap-2">
          <UInput
            v-model.number="state.eggsPerTray"
            type="number"
            inputmode="numeric"
            min="1"
            max="100"
            size="xl"
            class="w-full"
          />
          <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span class="text-xs text-muted">Common:</span>
            <UButton
              v-for="qty in TRAY_PRESETS"
              :key="qty"
              size="xs"
              type="button"
              :variant="state.eggsPerTray === qty ? 'solid' : 'subtle'"
              :color="state.eggsPerTray === qty ? 'primary' : 'neutral'"
              @click="state.eggsPerTray = qty"
            >
              {{ qty }} eggs
            </UButton>
          </div>
        </div>
      </UFormField>

      <!-- Currency -->
      <UFormField
        label="Currency"
        description="Currency symbol used for sales and price lists"
        name="currency"
        size="xl"
        :eager-validation="eager"
      >
        <div class="flex flex-col gap-2">
          <UInput
            v-model="state.currency"
            maxlength="3"
            size="xl"
            class="w-full uppercase"
            placeholder="PHP"
          />
          <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span class="text-xs text-muted">Common:</span>
            <UButton
              v-for="curr in CURRENCY_PRESETS"
              :key="curr"
              size="xs"
              type="button"
              :variant="state.currency === curr ? 'solid' : 'subtle'"
              :color="state.currency === curr ? 'primary' : 'neutral'"
              @click="state.currency = curr"
            >
              {{ curr }}
            </UButton>
          </div>
        </div>
      </UFormField>

      <!-- Starter Sizes Preview -->
      <div class="flex flex-col gap-2 rounded-lg border border-default bg-muted/40 p-3.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-highlighted">
            Starter Egg Sizes
          </span>
          <span class="text-xs text-muted">4 default sizes</span>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="flex items-center gap-1.5 rounded-md border border-default bg-card px-2.5 py-1.5 text-xs font-medium text-highlighted">
            <span class="size-2 rounded-full bg-emerald-500" />
            Small
          </div>
          <div class="flex items-center gap-1.5 rounded-md border border-default bg-card px-2.5 py-1.5 text-xs font-medium text-highlighted">
            <span class="size-2 rounded-full bg-blue-500" />
            Medium
          </div>
          <div class="flex items-center gap-1.5 rounded-md border border-default bg-card px-2.5 py-1.5 text-xs font-medium text-highlighted">
            <span class="size-2 rounded-full bg-orange-500" />
            Large
          </div>
          <div class="flex items-center gap-1.5 rounded-md border border-default bg-card px-2.5 py-1.5 text-xs font-medium text-highlighted">
            <span class="size-2 rounded-full bg-purple-500" />
            Jumbo
          </div>
        </div>
        <p class="text-xs text-muted">
          You can customize or add more sizes anytime in Settings.
        </p>
      </div>

      <!-- Submit -->
      <UButton
        type="submit"
        size="xl"
        block
        :loading="submitting"
        label="Start Tracking"
        icon="i-lucide-arrow-right"
        trailing
      />
    </UForm>

    <div class="pt-1 text-center">
      <UButton
        to="/login"
        variant="link"
        color="neutral"
        size="sm"
        label="Already have a Cloud account? Sign in"
      />
    </div>
  </UCard>
</template>
