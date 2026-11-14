export function getLocalDeviceId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'D-INIT'
  }
  let id = localStorage.getItem('tamago_device_id')
  if (!id) {
    id = `D-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    try {
      localStorage.setItem('tamago_device_id', id)
    }
    catch {
      // Ignore quota or private-browsing restrictions
    }
  }
  return id
}
