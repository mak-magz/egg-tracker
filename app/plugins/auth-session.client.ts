// Mid-session loss detection (§3.5 "Session expired", AC11, AC14).
// - VueFire tracks `useCurrentUser()`; if the user was signed in and becomes null without signing out
//   themselves, run the session-expired flow.
// - bfcache: a page restored from the back/forward cache after sign-out reloads (then the guard runs).
import { onAuthStateChanged } from 'firebase/auth'

export default defineNuxtPlugin(() => {
  const auth = useFirebaseAuth()
  const user = useCurrentUser()
  const router = useRouter()
  const signingOut = useState('auth:signingOut', () => false)

  function onSessionLost() {
    if (signingOut.value) return
    const currentPath = router.currentRoute.value.path || ''
    if (currentPath.startsWith('/admin')) return
    const { isFree } = useTier()
    if (isFree.value) return
    const level = router.currentRoute.value.meta.auth ?? 'farm'
    if (level !== 'farm' && level !== 'user') return
    useAuthActions().handleSessionExpired()
  }

  let hadUser = !!user.value
  if (auth) {
    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        hadUser = true
      }
      else if (hadUser) {
        hadUser = false
        onSessionLost()
      }
    })
  }

  watch(user, (now, before) => {
    if (now) hadUser = true
    if (before && !now) {
      hadUser = false
      onSessionLost()
    }
  })

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    const { isFree } = useTier()
    if (isFree.value) return
    if (!auth?.currentUser) window.location.reload()
  })
})
