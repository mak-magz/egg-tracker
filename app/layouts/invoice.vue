<!--
  Invoice layout (feature 07 D14): no shell at all (no sidebar, top bar, tabs, FAB or More sheet), so nothing from the
  app can leak into the printout. Holds no farm data.
-->
<template>
  <div class="min-h-svh bg-muted print:min-h-0 print:bg-white">
    <slot />
  </div>
</template>
