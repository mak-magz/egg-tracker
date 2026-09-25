<!--
  The centred card used by every signed-out screen (sign-in, reset, no farm, standalone 404).
  Design: template.html sign-in card; §2.5 "Sign-in". Max 380px, 16px radius, hairline ring + shadow-md,
  32px padding, 20px gap. Header: 48px logo, title (text-xl 700), optional description (text-base, muted).
-->
<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <UCard
    class="w-full max-w-[380px] shadow-md"
    :ui="{ body: 'p-8 sm:p-8 flex flex-col gap-5' }"
  >
    <header class="flex flex-col items-center gap-2.5 text-center">
      <AppLogo :size="48" />
      <div>
        <h1 class="text-xl font-bold text-highlighted">
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="text-base text-muted"
        >
          {{ description }}
        </p>
      </div>
    </header>
    <slot />
  </UCard>
</template>
