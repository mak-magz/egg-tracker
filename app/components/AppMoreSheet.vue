<!--
  The More sheet (feature 05 AC1, flow M): a bottom sheet in the sheetUi look, title "More", two 56px rows
  (icon, label, chevron): Inventory, Clients. The row for the screen you are on has aria-current="page", a check
  and the word "Current". Tapping a row closes the sheet and navigates; focus moves to the new screen's heading.
  Dismissing (overlay, Esc, close) returns focus to the More tab. Phone only: the tab bar is hidden from md.
  `open` lives in the layout so a route change closes it.
-->
<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })
const route = useRoute()

let navigated = false

function onRowClick() {
  navigated = true
  open.value = false
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  const wentSomewhere = navigated
  navigated = false
  void nextTick(() => {
    const target = wentSomewhere
      ? document.querySelector<HTMLElement>('h1')
      : document.querySelector<HTMLElement>('[data-more-tab]')
    if (!target) return
    if (wentSomewhere) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })
}

const ui = sheetUi(420)
</script>

<template>
  <UModal
    v-model:open="open"
    title="More"
    :close="false"
    :content="{ onCloseAutoFocus }"
    :ui="ui"
  >
    <template #content>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex shrink-0 items-center gap-2 border-b border-default py-2 ps-4 pe-2">
          <h2 class="flex-1 text-lg font-bold text-highlighted">
            More
          </h2>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Close"
            class="size-11 justify-center"
            @click="open = false"
          />
        </div>
        <ul class="flex flex-col p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <li
            v-for="item in MORE_ITEMS"
            :key="item.key"
          >
            <NuxtLink
              :to="item.to"
              :aria-current="isNavItemActive(item, route.path) ? 'page' : undefined"
              class="flex min-h-14 items-center gap-3 rounded-xl px-3 text-base text-highlighted hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              :class="isNavItemActive(item, route.path) ? 'bg-primary/12 font-semibold' : 'font-medium'"
              @click="onRowClick"
            >
              <UIcon
                :name="item.icon"
                class="size-5 shrink-0 text-muted"
              />
              <span class="flex-1">{{ item.label }}</span>
              <template v-if="isNavItemActive(item, route.path)">
                <UIcon
                  name="i-lucide-check"
                  class="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span class="text-sm font-medium text-primary">Current</span>
              </template>
              <UIcon
                v-else
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-dimmed"
                aria-hidden="true"
              />
            </NuxtLink>
          </li>
        </ul>
      </div>
    </template>
  </UModal>
</template>
