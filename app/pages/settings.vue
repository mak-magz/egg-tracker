<!--
  Settings (feature 02). Reached from the account menu, not a sixth tab: none of the five tabs is
  highlighted here (like the 404). Sizes today; the two-column band layout (SettingsSection) leaves room for
  later sections such as tray size. No top-bar Add and no FAB: the one add action is the Add size button
  next to the list it changes (§2.5 C2). The phone-only ← comes from `back` (layouts/default.vue).
-->
<script setup lang="ts">
definePageMeta({ title: 'Settings', subtitle: 'Farm settings', back: true })
</script>

<template>
  <SizesManager />
</template>
