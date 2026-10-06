// Cross-screen detail overlays (feature 05 flow H, D3/D10/U2). An order's delivery opens that SALE's detail on top
// of the order detail, and a sale's "From order #n" pill opens that ORDER's detail on top of the sale detail, never
// more than two overlays deep. The one on top was opened from the other screen, so it is READ-ONLY with a single
// "Open in Orders/Sales" link: that link hands the entry to the screen that owns the actions (`handoff`), which opens
// it there, fully editable. State is in memory only (never the URL, AC53), is dropped on sign-out (`detail-stack:*`,
// useMe().clear()) and when the hosting screen goes away.
export type StackKind = 'order' | 'sale'
export interface StackEntry { kind: StackKind, id: string }

interface StackState {
  /** Overlays stacked on top of a screen's OWN detail. At most one: the page's own detail is the first layer. */
  stack: StackEntry[]
  /** An entry another screen asked this one to open once it mounts ("Open in Orders"). */
  handoff: StackEntry | null
}

/** The most overlays on top of the screen's own detail (two deep in total, D3). */
export const MAX_STACKED_OVERLAYS = 1

export function useDetailStack() {
  const state = useState<StackState>('detail-stack:state', () => ({ stack: [], handoff: null }))

  /** The overlay on top, if any. */
  const top = computed<StackEntry | null>(() => state.value?.stack[state.value.stack.length - 1] ?? null)

  /** Opens `entry` on top. A second one while one is up replaces it: the depth never grows past two. */
  function push(entry: StackEntry) {
    const stack = state.value?.stack ?? []
    const base = stack.length >= MAX_STACKED_OVERLAYS ? stack.slice(0, MAX_STACKED_OVERLAYS - 1) : stack
    state.value = { handoff: state.value?.handoff ?? null, stack: [...base, entry] }
  }

  function pop() {
    state.value = { handoff: state.value?.handoff ?? null, stack: (state.value?.stack ?? []).slice(0, -1) }
  }

  function clear() {
    state.value = { stack: [], handoff: null }
  }

  /** "Open in Orders/Sales": leaves the stack and asks the owning screen to open `entry` when it mounts. */
  async function handoffTo(entry: StackEntry, path: string) {
    state.value = { stack: [], handoff: entry }
    await navigateTo(path)
  }

  /** The owning screen calls this once after mounting: returns the entry meant for it (of `kind`) and clears it. */
  function takeHandoff(kind: StackKind): StackEntry | null {
    const entry = state.value?.handoff ?? null
    if (!entry || entry.kind !== kind) return null
    state.value = { stack: state.value?.stack ?? [], handoff: null }
    return entry
  }

  return { top, push, pop, clear, handoffTo, takeHandoff }
}
