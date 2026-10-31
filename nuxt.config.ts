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
    'accelerometer', 'bluetooth', 'browsing-topics', 'camera', 'display-capture', 'geolocation',
    'gyroscope', 'hid', 'magnetometer', 'microphone', 'midi', 'payment', 'serial', 'usb',
  ].map(feature => `${feature}=()`).join(', '),
  // Sign-in is email + password/OTP in the same tab (no popups, no OAuth window), so nothing
  // needs window.opener across origins.
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Production only, and browsers ignore it over plain http anyway. No includeSubDomains or
  // preload until the custom domain is known (see the M1 follow-ups in the feature doc).
  ...(isProd ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
}

export default defineNuxtConfig({
  // @nuxt/ui registers @nuxt/fonts, @nuxt/icon and @nuxtjs/color-mode itself.
  // Don't add them here; configure them through `fonts`, `icon` and `colorMode`.
  modules: ['@nuxt/ui', 'nuxt-vuefire', '@nuxt/eslint'],

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Tamago',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
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

  vuefire: {
    auth: {
      enabled: true,
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
      authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'placeholder.firebaseapp.com',
      projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'placeholder-project-id',
      storageBucket: process.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'placeholder.appspot.com',
      messagingSenderId: process.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
      appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID ?? '1:000000000000:web:000000000000',
    },
  },
})
