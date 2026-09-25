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
  }
}

export {}
