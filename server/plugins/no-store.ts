// SSR HTML is per-user (farm name, email), so it must never be cached, and Back/bfcache after
// sign-out must not show farm content (AC14). API routes set the same header in handlers.ts.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    response.headers ||= {}
    response.headers['cache-control'] = 'private, no-store'
  })
})
