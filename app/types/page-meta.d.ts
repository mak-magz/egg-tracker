// Page access levels read by app/middleware/auth.global.ts (§3.8, D11). Default is 'farm' (deny by default).
//   farm   - signed in AND linked to a farm (every app screen)
//   user   - signed in, no farm required (/no-farm)
//   guest  - signed-out screens; a signed-in user is sent on (/login, /forgot-password)
//   public - anyone (/auth/reset, 404)
declare module '#app' {
  interface PageMeta {
    auth?: 'farm' | 'user' | 'guest' | 'public'
    /** Top-bar title for shell pages that aren't nav destinations (e.g. the 404). */
    title?: string
    /** Top-bar subtitle for shell pages that aren't nav destinations (e.g. Settings: "Farm settings"). */
    subtitle?: string
    /**
     * Shows a phone-only ← button at the start of the top bar (44px, `aria-label="Back"`), for screens with no
     * highlighted tab. It goes back to the previous screen, or to the Dashboard when there was none.
     */
    back?: boolean
    /**
     * The screen's "add" action (feature 01 §3.4, AC1, AC32). The layout renders it as a top-bar
     * button at md+ and, when `fab` is set, as a round FAB above the bottom tabs below md.
     * The page handles the click with `usePrimaryAction().onPrimaryAction(fn)`.
     */
    primaryAction?: {
      /** Top-bar button text, e.g. "Add production". */
      label: string
      /** Accessible name for the FAB (and the icon-only button), e.g. "Log production". */
      ariaLabel: string
      icon: string
      fab?: boolean
    }
  }
}

export {}
