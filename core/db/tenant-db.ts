import type { Database } from '../../shared/types/database.types'
import type { RpcErrorShape } from './adapter'

export type DbError = RpcErrorShape

type Tables = Database['public']['Tables']
type Functions = Database['public']['Functions']

export type TenantRpc = {
  [K in keyof Functions]: Functions[K]['Args'] extends { p_tenant_id: string } ? K : never
}[keyof Functions]

export type TenantRpcArgs<F extends TenantRpc> = Omit<Functions[F]['Args'], 'p_tenant_id'>
export interface TenantRpcResult<F extends TenantRpc> {
  data: Functions[F]['Returns'] | null
  error: DbError | null
}

export type TenantTable = Exclude<keyof Tables, 'tenants' | 'memberships'>

export interface QueryResult<R = unknown> {
  data: R | null
  error: DbError | null
}

export interface TableSelectChain<T extends keyof Tables> extends PromiseLike<QueryResult<Tables[T]['Row'][]>> {
  eq: (column: string, value: string) => TableSelectChain<T>
  order: (column: string, opts?: { ascending?: boolean }) => TableSelectChain<T>
  maybeSingle: () => Promise<QueryResult<Tables[T]['Row'] | null>>
}

export interface TableMutationChain<T extends keyof Tables> extends PromiseLike<QueryResult<Tables[T]['Row'][]>> {
  eq: (column: string, value: string) => TableMutationChain<T>
  select: (columns?: string) => TableSelectChain<T>
}

export interface TableQueryBuilder<T extends keyof Tables> {
  select: (columns?: string) => TableSelectChain<T>
  insert: (rows: Tables[T]['Insert'] | Tables[T]['Insert'][]) => TableMutationChain<T>
  update: (patch: Tables[T]['Update']) => TableMutationChain<T>
  delete: () => TableMutationChain<T>
}

export interface TenantClient {
  from: <T extends keyof Tables>(table: T) => TableQueryBuilder<T>
  rpc: <F extends keyof Functions>(fn: F, args: Functions[F]['Args']) => PromiseLike<QueryResult<Functions[F]['Returns']>>
}

export type QueryBuilder<T extends keyof Tables> = TableQueryBuilder<T>

export type ScopedInsert<T extends TenantTable> = Omit<Tables[T]['Insert'], 'tenant_id'>
export type ScopedUpdate<T extends TenantTable> = Omit<Tables[T]['Update'], 'tenant_id'>

export interface ScopedTable<T extends TenantTable> {
  readonly table: T
  select: (columns?: string) => ReturnType<QueryBuilder<T>['select']>
  insert: (rows: ScopedInsert<T> | ScopedInsert<T>[]) => ReturnType<QueryBuilder<T>['insert']>
  update: (patch: ScopedUpdate<T>) => ReturnType<QueryBuilder<T>['update']>
  delete: () => ReturnType<QueryBuilder<T>['delete']>
}

export interface TenantDb {
  readonly tenantId: string
  readonly client: TenantClient
  scoped: <T extends TenantTable>(table: T) => ScopedTable<T>
  rpc: <F extends TenantRpc>(fn: F, args: TenantRpcArgs<F>) => Promise<TenantRpcResult<F>>
}

function stripTenantId<R extends object>(row: R): R {
  if (row && typeof row === 'object' && 'tenant_id' in row) {
    const { tenant_id: _ignored, ...rest } = row as R & { tenant_id?: unknown }
    return rest as R
  }
  return row
}

interface LooseFilter { eq: (column: string, value: string) => unknown }
type LooseRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown, error: DbError | null }>
interface LooseBuilder {
  select: (columns?: string) => LooseFilter
  insert: (rows: object | object[]) => unknown
  update: (patch: object) => LooseFilter
  delete: () => LooseFilter
}

export function createTenantDbFromClient(client: TenantClient, tenantId: string): TenantDb {
  if (!tenantId) throw new Error('createTenantDb: tenantId is required')
  return Object.freeze({
    tenantId,
    client,
    scoped<T extends TenantTable>(table: T): ScopedTable<T> {
      const from = () => client.from(table) as unknown as LooseBuilder
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
