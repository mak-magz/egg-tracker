// Tenant-scoped repository foundation (docs/features/00-project-scaffold.md §3.4, D3).
// Queries run through supabase-js AS THE SIGNED-IN USER (publishable key + their JWT), so Postgres sees the
// non-superuser `authenticated` role and RLS applies via app.current_tenant_id(). On top of that, every
// scoped query injects `tenant_id` here, so a forgotten filter returns nothing instead of leaking.
// Only server/repositories/ should touch `TenantDb.client`; routes call repositories.
import type { H3Event } from 'h3'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '../../shared/types/database.types'

type Tables = Database['public']['Tables']
type Functions = Database['public']['Functions']

/** Public functions that take `p_tenant_id`: the only ones TenantDb.rpc may call (feature 01 §3.3). */
export type TenantRpc = {
  [K in keyof Functions]: Functions[K]['Args'] extends { p_tenant_id: string } ? K : never
}[keyof Functions]
/** RPC args WITHOUT p_tenant_id: TenantDb.rpc injects it from the server context. */
export type TenantRpcArgs<F extends TenantRpc> = Omit<Functions[F]['Args'], 'p_tenant_id'>
export interface TenantRpcResult<F extends TenantRpc> {
  data: Functions[F]['Returns'] | null
  error: PostgrestError | null
}

/** Tables that carry a `tenant_id` column. `tenants` (root) and `memberships` (resolution) are handled explicitly. */
export type TenantTable = Exclude<keyof Tables, 'tenants' | 'memberships'>

type Client = SupabaseClient<Database>
// Single-signature wrapper around the overloaded `client.from`, so `QueryBuilder<T>` can be derived per table.
function fromTable<T extends keyof Tables>(client: Client, table: T) {
  return client.from(table)
}
/** The exact supabase-js query builder type for table T (per-table Row/Insert/Update typing). */
export type QueryBuilder<T extends keyof Tables> = ReturnType<typeof fromTable<T>>

/** Insert rows WITHOUT tenant_id: the scope adds it, and callers can't override it. */
export type ScopedInsert<T extends TenantTable> = Omit<Tables[T]['Insert'], 'tenant_id'>
/** Update patch WITHOUT tenant_id: rows can't be moved to another tenant. */
export type ScopedUpdate<T extends TenantTable> = Omit<Tables[T]['Update'], 'tenant_id'>

export interface ScopedTable<T extends TenantTable> {
  readonly table: T
  /** SELECT with `.eq('tenant_id', tenantId)` already applied. Chain more filters on the result. */
  select: (columns?: string) => ReturnType<QueryBuilder<T>['select']>
  /** INSERT with `tenant_id` injected into every row. Chain `.select()` to return rows. */
  insert: (rows: ScopedInsert<T> | ScopedInsert<T>[]) => ReturnType<QueryBuilder<T>['insert']>
  /** UPDATE with `.eq('tenant_id', tenantId)` already applied. */
  update: (patch: ScopedUpdate<T>) => ReturnType<QueryBuilder<T>['update']>
  /** DELETE with `.eq('tenant_id', tenantId)` already applied. */
  delete: () => ReturnType<QueryBuilder<T>['delete']>
}

export interface TenantDb {
  readonly tenantId: string
  /** The user-JWT client. Use only inside server/repositories/. */
  readonly client: Client
  scoped: <T extends TenantTable>(table: T) => ScopedTable<T>
  /**
   * The RPC form of scoped(): calls a public function with `p_tenant_id` set to this request's tenant.
   * A smuggled `p_tenant_id` in args is dropped. Each function also asserts it equals app.current_tenant_id().
   */
  rpc: <F extends TenantRpc>(fn: F, args: TenantRpcArgs<F>) => Promise<TenantRpcResult<F>>
}

/** Rejects any attempt to smuggle a tenant_id through untyped data. */
function stripTenantId<R extends object>(row: R): R {
  if (row && typeof row === 'object' && 'tenant_id' in row) {
    const { tenant_id: _ignored, ...rest } = row as R & { tenant_id?: unknown }
    return rest as R
  }
  return row
}

// The builder methods are generic over the table's columns, which TS can't resolve for a generic T.
// Internally we go through this minimal untyped shape; the public ScopedTable<T> types are what callers see.
interface LooseFilter { eq: (column: string, value: string) => unknown }
type LooseRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown, error: PostgrestError | null }>
interface LooseBuilder {
  select: (columns?: string) => LooseFilter
  insert: (rows: object | object[]) => unknown
  update: (patch: object) => LooseFilter
  delete: () => LooseFilter
}

export function createTenantDbFromClient(client: Client, tenantId: string): TenantDb {
  if (!tenantId) throw new Error('createTenantDb: tenantId is required')
  return Object.freeze({
    tenantId,
    client,
    scoped<T extends TenantTable>(table: T): ScopedTable<T> {
      const from = () => fromTable(client, table) as unknown as LooseBuilder
      return {
        table,
        select: columns => from().select(columns ?? '*').eq('tenant_id', tenantId) as ReturnType<ScopedTable<T>['select']>,
        insert: (rows) => {
          const withTenant = (Array.isArray(rows) ? rows : [rows]).map(r => ({ ...stripTenantId(r), tenant_id: tenantId }))
          return from().insert(withTenant) as ReturnType<ScopedTable<T>['insert']>
        },
        update: patch => from().update(stripTenantId(patch)).eq('tenant_id', tenantId) as ReturnType<ScopedTable<T>['update']>,
        delete: () => from().delete().eq('tenant_id', tenantId) as ReturnType<ScopedTable<T>['delete']>,
      }
    },
    async rpc<F extends TenantRpc>(fn: F, args: TenantRpcArgs<F>): Promise<TenantRpcResult<F>> {
      const { p_tenant_id: _ignored, ...rest } = (args ?? {}) as Record<string, unknown>
      const call = client.rpc.bind(client) as unknown as LooseRpc
      const { data, error } = await call(fn, { ...rest, p_tenant_id: tenantId })
      return { data: data as Functions[F]['Returns'] | null, error }
    },
  })
}

/** The tenant-scoped DB for this request. `tenantId` must come from requireTenant(), never from input. */
export async function createTenantDb(event: H3Event, tenantId: string): Promise<TenantDb> {
  return createTenantDbFromClient(await serverSupabaseClient(event), tenantId)
}
