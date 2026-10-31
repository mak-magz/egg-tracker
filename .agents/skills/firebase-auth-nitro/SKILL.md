---
name: firebase-auth-nitro
description: >-
  Authentication, session verification, and tenant authorization in Nitro server routes.
  Covers Firebase Admin integration, defineTenantHandler, defineAuthedHandler, CSRF
  request guards, and tenant resolution via Control DB. Use when working on server/api/
  routes or server/utils/auth.ts.
---

# Firebase Auth & Nitro Route Protection Skill

This skill documents how authentication, session management, and tenant authorization operate in the Tamago Egg Farm Tracker Nitro server routes.

---

## 1. Authentication Architecture

- **Client-Side**: Powered by `nuxt-vuefire` / Firebase Web SDK (`signInWithEmailAndPassword`, `signOut`).
- **Server-Side**: Powered by `firebase-admin` initialized in `server/utils/auth.ts`.
- **Session Transport**: Cookies or `Authorization: Bearer <id_token>` (supports session cookies and ID tokens for development, tests, and CLI).
- **Tenant Authorization**: The server verifies the Firebase session, extracts `uid`, and looks up the user's active membership in the Control DB via `findMembershipWithFarm` (`server/repositories/memberships.ts`).

---

## 2. Route Handlers Convention

Every route under `server/api/` must be wrapped in one of the approved handler wrappers from `server/utils/handlers.ts`. This invariant is enforced by `tests/unit/server-guards.spec.ts`.

### `defineTenantHandler` (Used by all farm data routes)
Used when the user must be signed in **and** belong to an active farm:

```typescript
import { defineTenantHandler } from '~~/server/utils/handlers'
import { listActiveClients } from '~~/server/repositories/clients'

export default defineTenantHandler(async (event, { db, tenantId, membership }) => {
  // `db` is the tenant-scoped libSQL database handle
  // `tenantId` is derived solely from verified membership
  return await listActiveClients(db, tenantId)
})
```

What `defineTenantHandler` guarantees automatically:
1. `Cache-Control: private, no-store` header is set.
2. CSRF / Cross-Site Write Check (`assertRequestAllowed`):
   - Refuses requests that the browser marks as cross-site (`Sec-Fetch-Site` or untrusted `Origin`) with a `403 no_farm`.
   - Requires `content-type: application/json` for write operations with bodies.
3. Authenticates session (returns `401 unauthenticated` if missing or expired).
4. Verifies membership in a tenant (returns `403 no_farm` if no active farm membership exists).
5. Maps errors to standard `ApiErrorData` (`toApiError`).

### `defineAuthedHandler` (Used only for tenant-agnostic routes like `/api/me`)
Used when a user is signed in, but might not yet have an active farm:

```typescript
import { defineAuthedHandler } from '~~/server/utils/handlers'

export default defineAuthedHandler(async (event, { uid, email }) => {
  return { uid, email }
})
```

---

## 3. Security Guidelines & Invariants

1. **Never trust `tenant_id` from request parameters, queries, or bodies**:
   - `tenantId` MUST only ever come from the verified session context (`ctx.tenantId`).
2. **Secrets Isolation**:
   - Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`) must remain server-side only.
   - Never expose credentials to `runtimeConfig.public` or client payloads.
   - Run `bun run check:build` to confirm no private key material is included in the client bundle.
3. **Client Personal Data**:
   - Clear client credentials and personal data (names, phones) upon sign-out.
   - Never log personal data in server error messages.
