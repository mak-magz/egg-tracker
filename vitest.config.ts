import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests run in plain Node. Specs use relative imports (no Nuxt aliases).
// Add @nuxt/test-utils when the first component test needs a Nuxt environment.
export default defineConfig({
  resolve: {
    // `app/` code imports shared code as `#shared/...` (a relative path breaks `nuxt build`), so
    // the app modules that specs import need the same alias Nuxt gives them.
    alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
})
