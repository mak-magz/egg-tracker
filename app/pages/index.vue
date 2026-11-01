<!-- Dashboard placeholder (T22, AC19). Real content arrives with the Dashboard feature. -->
<template>
  <AppPlaceholder
    icon="i-lucide-layout-dashboard"
    title="Your farm overview is coming soon"
    body="Today's trays, what's on hand and pending deliveries will show here."
  >
    <div class="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
      <UButton
        to="/production"
        size="xl"
        icon="i-lucide-clipboard"
        label="Log Production"
        class="w-full sm:w-auto justify-center"
      />
      <UButton
        to="/sales"
        size="xl"
        color="neutral"
        variant="outline"
        icon="i-lucide-shopping-cart"
        label="Record Sale"
        class="w-full sm:w-auto justify-center"
      />
    </div>
  </AppPlaceholder>
</template>
