<!--
  App shell (T16, AC15–AC18). Design: template.html shell + §2.5 "App shell" wireframes.
  - ≥1024px: sidebar (224px), expanded by default, collapsible to a 64px rail.
  - 768–1023px: the same sidebar, collapsed to the icon rail by default (44px targets).
  - <768px: no sidebar; bottom tabs + account avatar in the top bar.
  Nav *visibility* is pure CSS, so SSR renders both navs and hydration is stable. Only the
  rail's collapsed state is JS: session-only, reset whenever the width crosses a breakpoint.
-->
<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

// ---- Account (AC13, AC21) -------------------------------------------------------------------
// The middleware only lets 'farm' pages render here once /api/me has a farm, or when it failed
// (then `farmLoadFailed` replaces the whole shell with the retry card, T20).
const { me, status: meStatus, ensure } = useMe()
const { signOut } = useAuthActions()
const { isFree } = useTier()
const { failedCount, openConflictsModal } = useSync()
const conflictBannerDismissed = ref(false)
watch(failedCount, (nextVal, prevVal) => {
  if (nextVal > (prevVal ?? 0)) {
    conflictBannerDismissed.value = false
  }
})
const account = computed(() => ({ farmName: me.value?.farm?.name || 'My Farm', email: me.value?.email ?? '' }))
const farmLoadFailed = computed(() => meStatus.value === 'error')
const retrying = ref(false)
async function retryFarm() {
  retrying.value = true
  await ensure({ force: true })
  retrying.value = false
}
// ---------------------------------------------------------------------------------------------

// ---- Sidebar collapse (AC18) ----------------------------------------------------------------
const breakpoints = useBreakpoints(breakpointsTailwind)
const isLg = breakpoints.greaterOrEqual('lg')
const isMd = breakpoints.greaterOrEqual('md')
const viewport = computed(() => (isLg.value ? 'desktop' : isMd.value ? 'tablet' : 'mobile'))

// SSR can't know the width, so it renders expanded; the breakpoint default is applied after
// mount (not during hydration) to avoid a mismatch.
const collapsed = ref(false)
onMounted(() => {
  if (!me.value) void ensure().catch(() => {})
  watch(viewport, (v) => {
    collapsed.value = v === 'tablet'
  }, { immediate: true })
})

// ---- Nav + title ----------------------------------------------------------------------------
const navItems = computed<NavigationMenuItem[]>(() => APP_NAV.map(item => ({
  label: item.label,
  icon: item.icon,
  to: item.to,
  active: isNavItemActive(item, route.path),
})))

const activeItem = computed(() => findActiveNavItem(route.path))

// Client-only "Today, Sep 25" (the server's UTC date must never render).
const today = ref<string | null>(null)
function refreshToday() {
  today.value = formatTodaySubtitle(new Date())
}
onMounted(refreshToday)
watch(() => route.path, () => {
  if (import.meta.client) refreshToday()
})

// Pages that aren't nav destinations (the 404) set `definePageMeta({ title })`; none is highlighted.
const title = computed(() => activeItem.value?.title ?? route.meta.title ?? 'Tamago')
useHead({ title: computed(() => `${title.value} · Tamago`) })
// A page that sets its own subtitle (Clients: "5 customers") declares `ownSubtitle` in its page meta, so the server and
// the client's first render agree: no subtitle until the page has set one (utils/shell-subtitle.ts).
const { override: subtitleOverride } = useShellSubtitle()
const ownsSubtitle = computed(() => route.meta.ownSubtitle === true)
const subtitle = computed(() => resolveShellSubtitle({
  ownSubtitle: ownsSubtitle.value,
  override: subtitleOverride.value,
  item: activeItem.value,
  metaSubtitle: route.meta.subtitle,
  today: today.value,
}))

// Phone-only ← for screens with no highlighted tab (Settings; feature 02 C3). Back to the previous screen
// when this app pushed one (vue-router keeps it in history.state.back), else to the Dashboard.
const router = useRouter()
function goBack() {
  if (import.meta.client && window.history.state?.back) router.back()
  else void navigateTo('/farm')
}

// The phone bar's More sheet (feature 05 AC1). Closed by any route change, so a row tap just navigates.
const moreOpen = ref(false)
watch(() => route.path, () => {
  moreOpen.value = false
})

// ---- Primary action: top-bar button (md+) and FAB (<md) (feature 01 §3.4, AC1, AC31, AC32) ----
const { action: primaryAction, hasFab, fabVisible, trigger: triggerPrimaryAction } = usePrimaryAction()
// ---------------------------------------------------------------------------------------------

// Dynamic workspace environment badge ('dev' in local dev, 'farm' in production)
const envBadge = computed(() => {
  if (import.meta.dev) {
    return { label: 'dev', class: 'bg-primary/10 text-primary border-primary/20' }
  }
  return { label: 'farm', class: 'bg-primary/10 text-primary border-primary/20' }
})

// ---- Per-state sizing (layout only; colours live in app.config.ts) --------------------------
const sidebarUi = computed(() => ({
  root: 'md:flex bg-default transition-[width] duration-200 ease-out motion-reduce:transition-none',
  header: ['border-b border-default gap-2.5', collapsed.value ? 'px-0 justify-center' : 'px-3.5'],
  body: 'px-2 py-3 gap-0',
  footer: ['border-t border-default py-3', collapsed.value ? 'px-2 justify-center' : 'px-3'],
}))

const navUi = computed(() => ({
  list: 'flex flex-col gap-1',
  link: [
    'text-sm font-medium gap-2.5 px-3 py-2.5 min-h-11 rounded-xl transition-all',
    collapsed.value && 'justify-center px-0',
  ],
  linkLeadingIcon: 'size-[18px]',
}))
</script>

<template>
  <div class="contents">
    <!-- T20: /api/me failed (network/500). No shell, no farm data; retry or sign out. -->
    <div
      v-if="farmLoadFailed"
      class="flex min-h-svh w-full items-start justify-center bg-muted p-6 pt-12 md:items-center md:pt-6"
    >
      <AuthCard title="Couldn't load your farm.">
        <div
          role="alert"
          class="flex flex-col gap-3"
        >
          <UButton
            size="xl"
            block
            icon="i-lucide-refresh-cw"
            label="Try again"
            :loading="retrying"
            @click="retryFarm"
          />
          <UButton
            color="neutral"
            variant="outline"
            size="xl"
            block
            icon="i-lucide-log-out"
            label="Sign out"
            @click="signOut"
          />
        </div>
      </AuthCard>
    </div>

    <UDashboardGroup
      v-else
      unit="px"
      :persistent="false"
    >
      <UDashboardSidebar
        v-model:collapsed="collapsed"
        collapsible
        :default-size="224"
        :min-size="224"
        :max-size="224"
        :collapsed-size="64"
        :toggle="false"
        :ui="sidebarUi"
      >
        <template #header>
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
              <AppLogo :size="20" />
            </div>
            <div
              v-if="!collapsed"
              class="min-w-0 flex-1"
            >
              <div class="flex items-center gap-1.5">
                <span class="truncate text-base leading-tight font-extrabold tracking-tight text-highlighted">
                  Tamago
                </span>
                <span
                  class="rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider border"
                  :class="envBadge.class"
                >
                  {{ envBadge.label }}
                </span>
              </div>
              <p class="truncate text-xs font-medium text-muted mt-0.5">
                {{ account.farmName || 'Egg farm tracker' }}
              </p>
            </div>
          </div>
        </template>

        <UNavigationMenu
          :items="navItems"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          aria-label="Main"
          :ui="navUi"
        />

        <template #footer>
          <!-- Expanded: mode badge + account row. Rail: avatar only, opens to the right. -->
          <div class="flex w-full flex-col gap-2">
            <div
              v-if="!collapsed"
              class="flex items-center justify-between rounded-lg bg-muted/60 border border-default/60 px-2.5 py-1.5 text-xs"
            >
              <div class="flex items-center gap-1.5 truncate">
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="isFree ? 'bg-emerald-500 animate-pulse' : 'bg-primary'"
                />
                <span class="truncate font-medium text-default">
                  {{ isFree ? 'Free Offline' : 'Cloud Sync' }}
                </span>
              </div>
              <NuxtLink
                to="/farm/settings"
                class="shrink-0 font-semibold text-primary hover:underline text-[11px]"
              >
                {{ isFree ? 'Upgrade' : 'Settings' }}
              </NuxtLink>
            </div>

            <AppAccountMenu
              :farm-name="account.farmName"
              :email="account.email"
              :variant="collapsed ? 'avatar' : 'row'"
              :side="collapsed ? 'right' : 'top'"
              :align="collapsed ? 'end' : 'start'"
            />
          </div>
        </template>
      </UDashboardSidebar>

      <UDashboardPanel :ui="{ body: 'bg-muted p-4 sm:p-4 md:p-6 sm:gap-4' }">
        <template #header>
          <UDashboardNavbar
            :toggle="false"
            :ui="{ root: 'bg-default px-4 sm:px-4 md:px-5 gap-3', left: 'gap-3' }"
          >
            <template #left>
              <UButton
                v-if="route.meta.back"
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-left"
                aria-label="Back"
                class="size-11 shrink-0 justify-center md:hidden"
                @click="goBack"
              />
              <UDashboardSidebarCollapse class="md:flex size-11 justify-center lg:size-9" />
              <div class="min-w-0">
                <h1 class="truncate text-xl font-bold tracking-[-0.01em] text-highlighted">
                  {{ title }}
                </h1>
                <!-- A page-owned subtitle keeps its line while empty, so the title doesn't shift when the count arrives. -->
                <p
                  v-if="subtitle || ownsSubtitle"
                  class="truncate text-sm text-muted"
                  :class="ownsSubtitle && 'min-h-5'"
                >
                  {{ subtitle }}
                </p>
              </div>
            </template>

            <template #right>
              <SyncStatusPill class="mr-1" />
              <!-- 44px on tablet (touch), 40px at lg+. -->
              <UButton
                v-if="primaryAction"
                class="hidden shrink-0 md:inline-flex max-lg:min-h-11"
                data-primary-action
                size="lg"
                :icon="primaryAction.icon"
                :label="primaryAction.label"
                @click="triggerPrimaryAction"
              />
              <div class="md:hidden">
                <AppAccountMenu
                  :farm-name="account.farmName"
                  :email="account.email"
                  variant="avatar"
                  side="bottom"
                  align="end"
                />
              </div>
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <!-- Bottom padding below md clears the fixed tab bar (64px + safe area), plus the FAB (84px)
               on screens that have one, so the last card scrolls clear of both (AC31). -->
          <div
            class="mx-auto w-full max-w-[1120px] md:pb-0"
            :class="hasFab ? 'pb-[calc(4rem+env(safe-area-inset-bottom)+84px)]' : 'pb-[calc(4rem+env(safe-area-inset-bottom))]'"
          >
            <UAlert
              v-if="failedCount > 0 && !conflictBannerDismissed"
              color="warning"
              variant="subtle"
              icon="i-lucide-alert-triangle"
              :title="`${failedCount} offline change${failedCount === 1 ? '' : 's'} couldn't be synced to the cloud.`"
              description="Your local records remain safe on this phone."
              class="mb-4"
            >
              <template #actions>
                <div class="flex items-center gap-2 mt-2 sm:mt-0">
                  <UButton
                    size="sm"
                    color="warning"
                    variant="solid"
                    class="min-h-11"
                    @click="openConflictsModal"
                  >
                    Review Issues
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-x"
                    aria-label="Dismiss alert"
                    class="min-h-11"
                    @click="conflictBannerDismissed = true"
                  />
                </div>
              </template>
            </UAlert>
            <slot />
          </div>
        </template>
      </UDashboardPanel>

      <!-- FAB: 52px, above the tab bar (D8), hidden while the page's sheet or a dialog is open. -->
      <UButton
        v-if="primaryAction && fabVisible && !moreOpen"
        class="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-40 size-13 justify-center rounded-full shadow-lg md:hidden"
        data-primary-action
        :icon="primaryAction.icon"
        :aria-label="primaryAction.ariaLabel"
        :ui="{ leadingIcon: 'size-6' }"
        @click="triggerPrimaryAction"
      />

      <AppBottomTabs v-model:more-open="moreOpen" />
      <AppMoreSheet v-model:open="moreOpen" />
      <SyncConflictsModal />
    </UDashboardGroup>
  </div>
</template>
