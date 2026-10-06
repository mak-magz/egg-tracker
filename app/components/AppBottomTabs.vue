<!--
  Mobile navigation (<768px, AC17; feature 05 AC1, flow M): five equal columns, all visible, 64px tall + safe area:
  Home, Production, Orders, Sales, and a More BUTTON (not a link) that opens the More sheet (Inventory, Clients).
  Active tab: icon in a 12% primary tint pill, primary label at weight 600, aria-current="page". The More tab shows
  the same active state while the current screen is Inventory or Clients, and while its sheet is open; it is never
  highlighted together with another tab. It has no aria-current; its name says where you are ("More, current: Clients").
-->
<script setup lang="ts">
const route = useRoute()
const moreOpen = defineModel<boolean>('moreOpen', { required: true })

const moreItem = computed(() => findActiveMoreItem(route.path))
const moreActive = computed(() => moreOpen.value || moreItem.value !== undefined)
const moreLabel = computed(() => (moreItem.value ? `More, current: ${moreItem.value.label}` : 'More'))

/** Tabs never look active while the sheet is open (only More does). */
function tabActive(item: AppNavItem): boolean {
  return !moreOpen.value && isNavItemActive(item, route.path)
}
</script>

<template>
  <nav
    aria-label="Main"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden"
  >
    <ul class="grid grid-cols-5">
      <li
        v-for="item in MOBILE_TABS"
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
              :class="tabActive(item) ? 'bg-primary/12 text-primary' : 'text-muted group-hover:text-default'"
            >
              <UIcon
                :name="item.icon"
                class="size-[22px]"
              />
            </span>
            <span
              class="max-w-full truncate px-0.5 text-xs"
              :class="tabActive(item) ? 'font-semibold text-primary' : 'font-medium text-muted'"
            >{{ navTabLabel(item) }}</span>
          </a>
        </NuxtLink>
      </li>
      <li>
        <button
          type="button"
          data-more-tab
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          :aria-label="moreLabel"
          class="group flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          @click="moreOpen = true"
        >
          <span
            class="flex h-7 w-12 items-center justify-center rounded-full transition-colors motion-reduce:transition-none"
            :class="moreActive ? 'bg-primary/12 text-primary' : 'text-muted group-hover:text-default'"
          >
            <UIcon
              name="i-lucide-ellipsis"
              class="size-[22px]"
            />
          </span>
          <span
            class="max-w-full truncate px-0.5 text-xs"
            :class="moreActive ? 'font-semibold text-primary' : 'font-medium text-muted'"
            aria-hidden="true"
          >More</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
