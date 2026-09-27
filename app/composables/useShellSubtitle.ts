// A page's own top-bar subtitle (feature 03 §3.4, AC1: "5 customers"). A page that uses this MUST also declare
// `definePageMeta({ ownSubtitle: true })`: the layout reads that flag on both server and client, so the first paint is
// the same (no subtitle) until the page has data (utils/shell-subtitle.ts explains why). The page calls
// `setSubtitle(text)` from its setup; `null` shows no subtitle while the list loads (never "0 customers" for a farm
// that has clients). The value is dropped when the page unmounts, and only if it is still this page's value.
// It is client-only state: the server render never depends on it, so setting it there is skipped.
import type { SubtitleOverride } from '~/utils/shell-subtitle'

let nextOwner = 0

export function useShellSubtitle() {
  const override = useState<SubtitleOverride | null>('shell:subtitle', () => null)
  const owner = ++nextOwner

  function setSubtitle(text: string | null) {
    if (import.meta.server) return
    override.value = { owner, text }
  }
  function clearSubtitle() {
    override.value = releaseSubtitle(override.value, owner)
  }

  // Only a page (a component instance) can own the override.
  if (getCurrentInstance()) onBeforeUnmount(clearSubtitle)

  return { override: readonly(override), setSubtitle, clearSubtitle }
}
