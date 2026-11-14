import { syncEngine } from '../local/sync'
import { localWorker } from '../local/client'
import { useTier } from '../composables/useTier'
import { getLocalDeviceId } from '../utils/device'

export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return

  const { isPremium, getAuthToken, isFree } = useTier()
  const router = useRouter()

  const deviceId = getLocalDeviceId()
  syncEngine.configure({
    getAuthToken,
    isFree: () => isFree.value,
    deviceId,
  })
  syncEngine.setDeviceId(deviceId)
  void localWorker.setDeviceId(deviceId).catch(() => {})

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
