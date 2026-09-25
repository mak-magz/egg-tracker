<!--
  Signed-out layout: no shell, no nav, no farm data (AC9).
  Pages render an <AuthCard> in the default slot. Below md the card is top-aligned (~48px)
  so the fields stay above the on-screen keyboard; from md it is centred.
-->
<template>
  <div class="flex min-h-svh w-full items-start justify-center bg-muted p-6 pt-12 md:items-center md:pt-6">
    <slot />
  </div>
</template>
