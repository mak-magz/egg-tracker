<!--
  Mobile navigation (<768px, AC17): 5 equal columns, all visible, 64px tall + safe area.
  Active tab: icon in a 12% primary tint pill, primary label at weight 600, aria-current="page".
-->
<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <nav
    aria-label="Main"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden"
  >
    <ul class="grid grid-cols-5">
      <li
        v-for="item in APP_NAV"
        :key="item.key"
      >
        <NuxtLink
          v-slot="{ href, navigate }"
          :to="item.to"
          custom
        >
          <a
            :href="href ?? undefined"
            :aria-current="isNavItemActive(item, route.path) ? 'page' : undefined"
            class="group flex h-16 flex-col items-center justify-center gap-1 rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            @click="navigate"
          >
            <span
              class="flex h-7 w-12 items-center justify-center rounded-full transition-colors motion-reduce:transition-none"
              :class="isNavItemActive(item, route.path) ? 'bg-primary/12 text-primary' : 'text-muted group-hover:text-default'"
            >
              <UIcon
                :name="item.icon"
                class="size-[22px]"
              />
            </span>
            <span
              class="max-w-full truncate px-0.5 text-xs"
              :class="isNavItemActive(item, route.path) ? 'font-semibold text-primary' : 'font-medium text-muted'"
            >{{ item.label }}</span>
          </a>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
