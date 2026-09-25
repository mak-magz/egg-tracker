// Mid-session loss detection (§3.5 "Session expired", AC11, AC14).
// - The Supabase module re-checks the claims on every page:start; if they vanish, or Supabase emits
//   SIGNED_OUT, and the user didn't sign out themselves, run the session-expired flow.
// - bfcache: a page restored from the back/forward cache after sign-out reloads (then the guard runs).
export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const router = useRouter()
  const signingOut = useState('auth:signingOut', () => false)

  function onSessionLost() {
    if (signingOut.value) return
    const level = router.currentRoute.value.meta.auth ?? 'farm'
    if (level !== 'farm' && level !== 'user') return
    useAuthActions().handleSessionExpired()
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') onSessionLost()
  })

  watch(user, (now, before) => {
    if (before && !now) onSessionLost()
  })

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.reload()
    })
  })
})
