<!--
  UInput (type password) with a 44px show/hide button (§2.5, §3.8). Attributes (autocomplete,
  enterkeyhint, placeholder, disabled...) pass through to UInput; UFormField supplies id/name/aria.
-->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })
const visible = ref(false)
const input = useTemplateRef<{ inputRef: HTMLInputElement | null }>('input')

defineExpose({
  focus: () => input.value?.inputRef?.focus(),
})
</script>

<template>
  <UInput
    ref="input"
    v-model="model"
    v-bind="$attrs"
    :type="visible ? 'text' : 'password'"
    size="xl"
    class="w-full"
    :ui="{ base: 'pe-12', trailing: 'pe-0' }"
  >
    <template #trailing>
      <UButton
        color="neutral"
        variant="link"
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        :aria-pressed="visible"
        class="size-11 justify-center"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
