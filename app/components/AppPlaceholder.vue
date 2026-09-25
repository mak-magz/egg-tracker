<!--
  "Coming soon" card for the 5 destinations and the 404 (T22/T23, AC19, AC20). §2.5 "Placeholder screens":
  bg-default, 16px radius, hairline ring, 40px padding (24px on mobile), max 560px, centred at the top.
  Icon in a 56px circle with a 12% primary tint, heading, one line of body. No numbers or sample data.
-->
<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  body: string
  eyebrow?: string
}>()
</script>

<template>
  <UCard
    class="mx-auto w-full max-w-[560px]"
    :ui="{ body: 'p-6 sm:p-10 flex flex-col items-center gap-3 text-center' }"
  >
    <span class="flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
      <UIcon
        :name="icon"
        class="size-8"
      />
    </span>
    <p
      v-if="eyebrow"
      class="text-sm text-dimmed"
    >
      {{ eyebrow }}
    </p>
    <h2 class="text-lg font-semibold text-highlighted">
      {{ title }}
    </h2>
    <p class="text-base text-muted">
      {{ body }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-2 w-full sm:w-auto"
    >
      <slot />
    </div>
  </UCard>
</template>
