// Guards for the security headers in nuxt.config.ts (audit M1, docs/features/03-clients.md §4).
import { afterEach, describe, expect, it, vi } from 'vitest'

type Rules = Record<string, Record<string, unknown> & { headers?: Record<string, string> }>

async function loadConfig(nodeEnv: string): Promise<{ routeRules: Rules }> {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', nodeEnv)
  // nuxt.config.ts calls the auto-imported `defineNuxtConfig`, an identity function.
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  const mod = await import('../../nuxt.config')
  return mod.default as unknown as { routeRules: Rules }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('security headers (nuxt.config.ts routeRules)', () => {
  it('sends the header set on every route', async () => {
    const { routeRules } = await loadConfig('production')
    const headers = routeRules['/**']?.headers ?? {}
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headers['Cross-Origin-Embedder-Policy']).toBe('credentialless')
  })

  it('CSP is exactly frame-ancestors none (no script-src or default-src yet)', async () => {
    const { routeRules } = await loadConfig('production')
    expect(routeRules['/**']?.headers?.['Content-Security-Policy']).toBe(`frame-ancestors 'none'`)
  })

  it('denies the browser features the app does not use', async () => {
    const { routeRules } = await loadConfig('production')
    const policy = routeRules['/**']?.headers?.['Permissions-Policy'] ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(policy).toContain(`${feature}=()`)
    }
    // A denied feature is `name=()`; nothing is granted to `*` or to a named origin.
    expect(policy).not.toMatch(/=\((?!\))/)
  })

  it('sends HSTS in production only', async () => {
    const prod = await loadConfig('production')
    expect(prod.routeRules['/**']?.headers?.['Strict-Transport-Security']).toMatch(/^max-age=\d+$/)
    for (const env of ['development', 'test']) {
      const other = await loadConfig(env)
      expect(other.routeRules['/**']?.headers).not.toHaveProperty('Strict-Transport-Security')
    }
  })

  it('never caches: no swr/isr/cache/prerender rule, and Cache-Control is not set here', async () => {
    const { routeRules } = await loadConfig('production')
    for (const [pattern, rule] of Object.entries(routeRules)) {
      for (const key of ['swr', 'isr', 'cache', 'prerender', 'static']) {
        expect(rule, `${pattern} must not set ${key}`).not.toHaveProperty(key)
      }
      const names = Object.keys(rule.headers ?? {}).map(name => name.toLowerCase())
      // server/plugins/no-store.ts and handlers.ts own `private, no-store`.
      expect(names, `${pattern} must not set cache-control`).not.toContain('cache-control')
    }
  })
})
