// https://nuxt.com/docs/api/configuration/nuxt-config
// Design: docs/features/00-project-scaffold.md §3.1 (setup), §3.5 (auth), §3.9 (env).

// Security headers (audit M1, docs/features/03-clients.md §4), sent on every response: pages, /api
// and static assets. Cache-Control is NOT set here: server/plugins/no-store.ts and handlers.ts own
// it, and Nitro's own `/_nuxt/**` immutable rule keeps hashed assets cacheable. Never add
// `swr`/`isr`/`cache` route rules for authenticated pages: the SSR payload holds the session.
const isProd = process.env.NODE_ENV === 'production'

const securityHeaders: Record<string, string> = {
  // Nobody may frame the app (clickjacking: one tap marks a client inactive). The CSP carries
  // frame-ancestors ONLY for now; a script-src/default-src policy is a follow-up (feature doc).
  // `nuxt dev` is fine with this: Nuxt DevTools' iframe is served by Vite, outside Nitro.
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': `frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // The app uses none of these features; deny them so an injected script cannot either.
  'Permissions-Policy': [
    'accelerometer', 'bluetooth', 'camera', 'display-capture', 'geolocation',
    'gyroscope', 'hid', 'magnetometer', 'microphone', 'midi', 'payment', 'serial', 'usb',
  ].map(feature => `${feature}=()`).join(', '),
  // Sign-in is email + password/OTP in the same tab (no popups, no OAuth window), so nothing
  // needs window.opener across origins.
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  // Production only, and browsers ignore it over plain http anyway. No includeSubDomains or
  // preload until the custom domain is known (see the M1 follow-ups in the feature doc).
  ...(isProd ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
}

export default defineNuxtConfig({
  // @nuxt/ui registers @nuxt/fonts, @nuxt/icon and @nuxtjs/color-mode itself.
  // Don't add them here; configure them through `fonts`, `icon` and `colorMode`.
  modules: [
    function (_options, nuxt) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim() && !process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.FIREBASE_SERVICE_ACCOUNT.trim()
      }
      if (!isProd && !process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
        process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
      }
      const emulatorHost = !isProd ? process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim() : undefined
      if (!emulatorHost) return
      // Allow nuxt-vuefire to configure the Auth emulator from FIREBASE_AUTH_EMULATOR_HOST even if
      // the Emulator Hub (:4400) starts concurrently or after Nuxt boots.
      const origFetch = globalThis.fetch
      globalThis.fetch = async (input, init) => {
        try {
          return await origFetch(input, init)
        }
        catch (err) {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
          if (url.endsWith(':4400/emulators')) {
            const [host = '127.0.0.1', portStr = '9099'] = emulatorHost.split(':')
            return new Response(JSON.stringify({ auth: { host, port: Number(portStr) } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          }
          throw err
        }
      }
      nuxt.hook('modules:done', () => {
        globalThis.fetch = origFetch
      })
    },
    '@nuxt/ui',
    'nuxt-vuefire',
    '@nuxt/eslint',
    '@vite-pwa/nuxt',
  ],

  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Tamago',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192x192.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
  },
  routeRules: {
    '/**': { headers: securityHeaders },
  },

  compatibilityDate: '2026-09-01',

  nitro: {
    prerender: {
      routes: ['/'],
    },
  },

  vite: {
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
  },

  typescript: {
    // Nuxt 4 defaults (strict, noUncheckedIndexedAccess) are kept; `typeCheck` stays off in dev
    // because `bun run typecheck` does it.
    strict: true,
    typeCheck: false,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  fonts: {
    families: [{ name: 'DM Sans', provider: 'google', weights: [400, 500, 600, 700] }],
  },

  icon: {
    serverBundle: 'local',
    clientBundle: { scan: true },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Tamago - Egg Farm Tracker',
      short_name: 'Tamago',
      description: 'Offline-first egg farm tracker for daily production, inventory, and sales.',
      theme_color: '#f97316',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait-primary',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
        },
      ],
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,wasm}'],
    },
  },

  vuefire: {
    admin: {
      options: {
        projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-no-project',
      },
    },
    auth: {
      enabled: true,
      persistence: ['browserLocal'],
      sessionCookie: {
        maxAge: 60 * 60 * 24 * 5 * 1000,
        sameSite: 'lax',
        secure: isProd,
        httpOnly: true,
        path: '/',
      },
    },
    emulators: !isProd ? { enabled: true, host: '127.0.0.1' } : false,
    config: {
      apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY ?? 'placeholder-api-key',
      authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'demo-no-project.firebaseapp.com',
      projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-no-project',
      storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'demo-no-project.appspot.com',
      messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
      appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID ?? '1:000000000000:web:000000000000',
    },
  },
})
