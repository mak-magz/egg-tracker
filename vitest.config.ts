import { defineConfig } from 'vitest/config'

// Unit tests run in plain Node. Specs use relative imports (no Nuxt aliases).
// Add @nuxt/test-utils when the first component test needs a Nuxt environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
})
