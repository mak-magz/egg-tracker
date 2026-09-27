// Keeps a bottom sheet above the on-screen keyboard (feature 01 AC5), by following the visual viewport while
// `open` is true. It sets two CSS variables on <html> that the sheet's classes read (see utils/sheet-ui.ts):
//   --sheet-kb   how far the keyboard covers the layout viewport (the sheet's `bottom`)
//   --sheet-vvh  the visible height (the sheet's max-height)
// Extracted from ProductionFormOverlay without changing it; the Clients overlay uses it too.
export function useSheetKeyboard(open: Ref<boolean>) {
  function setViewportVars() {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement.style
    root.setProperty('--sheet-kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
    root.setProperty('--sheet-vvh', `${Math.round(vv.height)}px`)
  }
  function clearViewportVars() {
    const root = document.documentElement.style
    root.removeProperty('--sheet-kb')
    root.removeProperty('--sheet-vvh')
  }
  watch(open, (isOpen) => {
    const vv = import.meta.client ? window.visualViewport : null
    if (!vv) return
    if (isOpen) {
      setViewportVars()
      vv.addEventListener('resize', setViewportVars)
      vv.addEventListener('scroll', setViewportVars)
    }
    else {
      vv.removeEventListener('resize', setViewportVars)
      vv.removeEventListener('scroll', setViewportVars)
      clearViewportVars()
    }
  })
  onBeforeUnmount(() => {
    if (!import.meta.client) return
    window.visualViewport?.removeEventListener('resize', setViewportVars)
    window.visualViewport?.removeEventListener('scroll', setViewportVars)
    clearViewportVars()
  })
}
