/** The `$api` fetch wrapper (app/plugins/api.ts). Use it for every call to our server routes. */
export function useApi() {
  return useNuxtApp().$api
}
