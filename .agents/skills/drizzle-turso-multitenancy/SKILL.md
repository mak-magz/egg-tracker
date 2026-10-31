---
name: drizzle-turso-multitenancy
description: >-
  Database-per-tenant architecture with Turso (libSQL) and Drizzle ORM.
  Covers Control DB vs. Tenant DB separation, schema management, migration scripts,
  and tenant-scoped repository patterns. Use when modifying server/db/, schema files,
  or writing queries in server/repositories/.
---

# Drizzle ORM + Turso (libSQL) Multi-Tenancy Skill

This skill provides patterns, invariants, and best practices for managing the database-per-tenant architecture used by Tamago Egg Farm Tracker.

---

## 1. Database-per-Tenant Architecture Overview

The system operates across two distinct database tiers:

1. **Control Database** (`server/db/schema/control.ts`):
   - Stores global SaaS data: `tenants`, `users`, and `memberships`.
   - Used for authenticating users, finding their associated farm/tenant, and mapping membership roles (`owner`).
   - Config: `drizzle.control.config.ts`.
   - Local: `file:local-control.db`.

2. **Tenant Databases** (`server/db/schema/tenant.ts`):
   - Stores all operational farm data: `sizes`, `production`, `sales`, `sale_lines`, `orders`, `order_lines`, and `clients`.
   - Each tenant has an isolated physical database (`file:local-tenant-<tenant_id>.db` locally, or individual Turso database in cloud).
   - Config: `drizzle.tenant.config.ts`.

---

## 2. Invariants & Tenant Scoping Rules

1. **Physical Isolation + Scoped Filtering**:
   - Every tenant query must flow through `TenantDb` (`server/utils/db.ts`) or `server/repositories/`.
   - In addition to physical database separation, tenant queries MUST inject `tenant_id` where applicable to provide defense-in-depth against cross-tenant leaks.
2. **Never Trust Client-Supplied `tenant_id`**:
   - `tenant_id` is always resolved on the server via `requireTenant(event)` (`server/utils/auth.ts`) which reads the authenticated Firebase session and verifies the membership in the Control DB.
3. **No Dynamic SQL String Interpolation**:
   - Always use Drizzle expressions (`eq()`, `and()`, `sql`` with parameters`) to prevent SQL injection.
4. **Error Logging**:
   - Never log raw customer data (names, phones) or full SQL error objects containing parameters. Log SQL error codes or sanitized message tags only.

---

## 3. Schema & Migration Commands

Always run migration commands using `bun`:

```bash
# Generate migrations
bun run db:generate:control    # Updates drizzle/control migrations
bun run db:generate:tenant     # Updates drizzle/tenant migrations

# Push schema directly to database (development)
bun run db:push:control        # Pushes schema to control database
bun run db:push:tenant         # Pushes schema to tenant database
```

---

## 4. Repository Patterns

When implementing or updating repositories under `server/repositories/`:

### Tenant DB Query Example
```typescript
import { eq, and, isNull, desc } from 'drizzle-orm'
import type { TenantDb } from '~~/server/utils/db'
import { clients } from '~~/server/db/schema/tenant'

export async function listActiveClients(db: TenantDb, tenantId: string) {
  return await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        isNull(clients.archivedAt)
      )
    )
    .orderBy(desc(clients.createdAt))
}
```

### Domain Rules in Repositories
- **Inventory is computed, never stored**: Good production minus non-voided sales, grouped by size (`server/repositories/inventory.ts`).
- **Sequential numbering**: Sales and orders have sequential human-readable numbers per farm (`server/repositories/sales.ts`, `server/repositories/orders.ts`).
- **Voiding over deleting**: Sales are never deleted; they are marked `voided_at`.
- **Archiving over deleting**: Sizes and Clients are never deleted; they are marked `archived_at`.
