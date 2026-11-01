/**
 * Collision-free sequential numbering helpers for offline devices and multi-device sync.
 * Formats:
 * - "D1-0001", "D2-0042" (DeviceId + sequential counter)
 */

export function formatSequenceNumber(deviceId: string, counter: number): string {
  const cleanDevice = deviceId.trim() || 'D1'
  return `${cleanDevice}-${String(counter).padStart(4, '0')}`
}

export function parseSequenceNumber(seq: string | number): { deviceId: string, counter: number } {
  if (typeof seq === 'number') {
    return { deviceId: '', counter: seq }
  }
  const str = String(seq).trim()
  const match = /^([A-Za-z0-9_]+)-(\d+)$/.exec(str)
  if (match) {
    return { deviceId: match[1]!, counter: parseInt(match[2]!, 10) }
  }
  const numeric = parseInt(str, 10)
  return { deviceId: '', counter: Number.isNaN(numeric) ? 0 : numeric }
}

/**
 * Compares two sequence numbers. Same device compares counter numerically;
 * different devices compare lexicographically.
 */
export function compareSequenceNumbers(a: string | number, b: string | number): number {
  const pa = parseSequenceNumber(a)
  const pb = parseSequenceNumber(b)
  if (pa.deviceId === pb.deviceId) {
    return pa.counter - pb.counter
  }
  return String(a).localeCompare(String(b))
}
