import { syncEngine } from '../local/sync'
import { useTier } from '../composables/useTier'
import { useMe } from '../composables/useMe'

export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return

  const { isPremium, getAuthToken, isFree } = useTier()
  const { me } = useMe()
  const router = useRouter()

  syncEngine.configure({
    getAuthToken,
    isFree: () => isFree.value,
  })

  if (me.value?.farm?.deviceId) {
    syncEngine.setDeviceId(me.value.farm.deviceId)
  }

  watch(
    () => me.value?.farm?.deviceId,
    (newDeviceId) => {
      if (newDeviceId) {
        syncEngine.setDeviceId(newDeviceId)
      }
    },
  )

  function updateSyncForRoute(path: string) {
    if (path.startsWith('/admin') || path.startsWith('/login/admin')) {
      syncEngine.stop()
    }
    else if (isPremium.value) {
      syncEngine.start()
    }
  }

  updateSyncForRoute(window.location.pathname)

  router.afterEach((to) => {
    updateSyncForRoute(to.path)
  })

  watch(isPremium, (premium) => {
    const path = router.currentRoute.value?.path || window.location.pathname
    if (premium && !path.startsWith('/admin') && !path.startsWith('/login/admin')) {
      syncEngine.start()
    }
    else {
      syncEngine.stop()
    }
  })

  document.addEventListener('visibilitychange', () => {
    const path = router.currentRoute.value?.path || window.location.pathname
    if (
      document.visibilityState === 'visible'
      && isPremium.value
      && !path.startsWith('/admin')
      && !path.startsWith('/login/admin')
    ) {
      void syncEngine.triggerSync()
    }
  })
})
