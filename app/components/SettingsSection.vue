<!--
  One Settings section (feature 02 §2.5 "Settings, desktop"): a card, and at lg+ a two-column band with the
  heading and help text in a sticky 280px left column and the card (max 720px) on the right, so rows don't
  stretch across 1100px and later sections (tray size) slot in. Below lg it's one column and the card
  carries its own heading and help text. `busy` sets aria-busy on the card (an in-flight change or a load).
-->
<script setup lang="ts">
defineProps<{
  title: string
  help: string
  busy?: boolean
}>()

const headingId = useId()
</script>

<template>
  <section
    class="flex min-w-0 flex-col lg:grid lg:grid-cols-[280px_1fr] lg:items-start lg:gap-6"
    :aria-labelledby="headingId"
  >
    <div class="sticky top-0 hidden pt-1 lg:block">
      <h2
        :id="headingId"
        class="text-base font-semibold text-highlighted"
      >
        {{ title }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ help }}
      </p>
    </div>

    <UCard
      class="w-full min-w-0 lg:max-w-[720px]"
      :ui="{ body: 'flex flex-col gap-3 p-4 sm:p-4 md:p-5' }"
      :aria-busy="busy ? 'true' : undefined"
    >
      <!-- One-column widths: the heading lives in the card (the section is labelled by the lg heading, which
           is still in the accessibility tree by reference). -->
      <div class="lg:hidden">
        <h2 class="text-base font-semibold text-highlighted">
          {{ title }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ help }}
        </p>
      </div>
      <slot />
    </UCard>
  </section>
</template>
