<!--
  PLACEHOLDER logo (owner decision 8): a simple egg mark in the brand colour.
  docs/design/tamago-logo.png has its checkerboard baked in, so it can't be used.
  When the owner supplies a transparent PNG/SVG, swap the <svg> below for it
  (and re-export public/favicon.svg plus 32/64/192/512 sizes). Keep the props.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Mark size in px: 28 in the sidebar, 48 on the auth card. */
  size?: number
  /** Show the "Tamago" wordmark next to the mark. */
  wordmark?: boolean
}>(), {
  size: 28,
  wordmark: false,
})
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg
      :width="props.size"
      :height="props.size"
      viewBox="0 0 32 32"
      class="shrink-0 text-primary"
      :role="props.wordmark ? undefined : 'img'"
      :aria-label="props.wordmark ? undefined : 'Tamago'"
      :aria-hidden="props.wordmark ? 'true' : undefined"
      focusable="false"
    >
      <path
        d="M16 2C9.6 2 5 11.4 5 18.6 5 25.2 9.9 30 16 30s11-4.8 11-11.4C27 11.4 22.4 2 16 2Z"
        fill="currentColor"
      />
      <ellipse
        cx="11.6"
        cy="13.5"
        rx="2.2"
        ry="3.6"
        transform="rotate(20 11.6 13.5)"
        fill="#fff"
        fill-opacity=".35"
      />
    </svg>
    <span
      v-if="props.wordmark"
      class="font-bold text-highlighted"
    >Tamago</span>
  </span>
</template>
