// The screen's primary "add" action (feature 01 §3.4, AC1, AC31, AC32). Generic, so Sales and Clients
// reuse it: the page declares `definePageMeta({ primaryAction })`, the layout renders the top-bar
// button / FAB from route.meta (SSR-safe), and a click runs the handler the page registered with
// `onPrimaryAction(fn)`. `hidden` hides the FAB while the page's sheet or a dialog is open.

type Handler = () => void

// Client-only: handlers are registered in onMounted, which never runs during SSR.
let handler: Handler | null = null

export function usePrimaryAction() {
  const route = useRoute()
  const hidden = useState('primary-action:hidden', () => false)

  const action = computed(() => route.meta.primaryAction ?? null)
  /** The page has a FAB on mobile (drives the page padding and the toast offset). */
  const hasFab = computed(() => !!action.value?.fab)
  const fabVisible = computed(() => hasFab.value && !hidden.value)

  function trigger() {
    handler?.()
  }

  /** Call from a page's setup. The handler is cleared when the page unmounts. */
  function onPrimaryAction(fn: Handler) {
    onMounted(() => {
      handler = fn
    })
    onBeforeUnmount(() => {
      if (handler === fn) handler = null
      hidden.value = false
    })
  }

  return { action, hasFab, hidden, fabVisible, trigger, onPrimaryAction }
}
