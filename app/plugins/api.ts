// `$api`: the only way later features call our server routes (§3.8). A 401 from any of them means the
// session is gone, so it runs the session-expired flow (AC11). On the server it forwards the cookies.
export default defineNuxtPlugin((nuxtApp) => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

  const api = $fetch.create({
    headers,
    retry: 0,
    async onResponseError({ response }) {
      if (import.meta.client && response.status === 401) {
        await nuxtApp.runWithContext(() => useAuthActions().handleSessionExpired())
      }
    },
  })

  return { provide: { api } }
})
