import type { FetchOptions } from 'ofetch'
import type { AdminSyncIssueItem, AdminSyncTelemetryItem } from '#shared/types/api'

export type { AdminSyncIssueItem, AdminSyncTelemetryItem }

export interface AdminMetricsResponse {
  turso: {
    status: 'operational' | 'degraded' | 'down'
    activeDatabases: number
    maxDatabases: number
    totalBytesUsed: number
    maxBytesAllowed: number
    region: string
    isLocalDev: boolean
  }
  fleet: {
    totalTenants: number
    totalUsers: number
    pendingMigrationsCount: number
    desyncTenantsCount: number
  }
}

export interface AdminTenantItem {
  id: string
  name: string
  tier: 'free' | 'premium'
  eggsPerTray: number
  currency: string
  dbUrl: string
  dbType: 'turso' | 'local'
  hasToken: boolean
  memberCount: number
  tursoStatus?: string
  region?: string
  bytesUsed?: number
  createdAt: string
  updatedAt: string
}

export interface AdminTenantsResponse {
  tenants: AdminTenantItem[]
  total: number
}

export interface AdminTenantMember {
  userId: string
  email: string
  role: string
  createdAt: string
}

export interface AdminTenantDetail {
  tenant: {
    id: string
    name: string
    tier: 'free' | 'premium'
    eggsPerTray: number
    currency: string
    dbUrl: string
    hasToken: boolean
    createdAt: string
    updatedAt: string
  }
  members: AdminTenantMember[]
}

export interface AdminProvisionInput {
  farmName: string
  ownerEmail: string
  tier?: 'free' | 'premium'
  eggsPerTray?: number
  currency?: string
  initialPassword?: string
}

export interface AdminProvisionResponse {
  tenant: {
    id: string
    name: string
    tier: string
    eggsPerTray: number
    currency: string
    dbUrl: string
  }
  owner: {
    userId: string
    email: string
    generatedPassword?: string
  }
}

export interface AdminUpdateTenantInput {
  name?: string
  tier?: 'free' | 'premium'
  eggsPerTray?: number
  currency?: string
}

export interface AdminTestConnectionResponse {
  connected: boolean
  latencyMs: number
  error?: string
}

export interface AdminUserItem {
  uid: string
  email: string
  emailVerified: boolean
  tenantId?: string | null
  farmName?: string | null
  isAdmin?: boolean
  adminRole?: string | null
  adminActive?: boolean | null
  createdAt: string
  lastSignInAt?: string | null
}

export interface AdminUsersResponse {
  users: AdminUserItem[]
  total: number
}

export interface AdminMigrationTenant {
  tenantId: string
  farmName: string
  currentVersion: string
  status: 'up_to_date' | 'pending' | 'error'
  lastError?: string
}

export interface AdminMigrationsResponse {
  systemVersion: string
  fleetSummary: {
    total: number
    upToDate: number
    pending: number
    error: number
  }
  tenants: AdminMigrationTenant[]
}

export interface AdminBatchMigrationResult {
  tenantId: string
  farmName: string
  success: boolean
  version: string
  error?: string
}

export interface AdminBatchMigrationResponse {
  totalMigrated: number
  successful: number
  failed: number
  results: AdminBatchMigrationResult[]
}

export interface AdminSyncTelemetryResponse {
  telemetry: AdminSyncTelemetryItem[]
}

export interface AdminChangeLogItem {
  version: number
  entityType: string
  entityId: string
  action: 'insert' | 'update' | 'delete'
  deviceId: string
  occurredAt: string
  data: Record<string, unknown>
}

export interface AdminChangeLogResponse {
  changes: AdminChangeLogItem[]
  total: number
  page: number
  limit: number
}

export interface AdminSyncIssuesResponse {
  issues: AdminSyncIssueItem[]
}

export interface AdminAuditLogItem {
  id: string
  operatorEmail: string
  actionType: string
  targetId: string
  summary: string
  details?: string | null
  createdAt: string
}

export interface AdminAuditLogsResponse {
  logs: AdminAuditLogItem[]
  total: number
  page: number
  limit: number
}

export function useAdmin() {
  const accessDenied = useState<boolean>('admin:accessDenied', () => false)
  const metrics = useState<AdminMetricsResponse | null>('admin:metrics', () => null)
  const metricsLoading = ref(false)
  const metricsError = ref<string | null>(null)

  const tenants = useState<AdminTenantItem[]>('admin:tenants', () => [])
  const tenantsTotal = useState<number>('admin:tenantsTotal', () => 0)
  const tenantsLoading = ref(false)
  const tenantFilters = reactive({
    search: '',
    tier: 'all',
  })

  const users = useState<AdminUserItem[]>('admin:users', () => [])
  const usersTotal = useState<number>('admin:usersTotal', () => 0)
  const usersLoading = ref(false)
  const userSearch = ref('')

  const migrations = useState<AdminMigrationsResponse | null>('admin:migrations', () => null)
  const migrationsLoading = ref(false)

  const syncTelemetry = useState<AdminSyncTelemetryItem[]>('admin:syncTelemetry', () => [])
  const syncLoading = ref(false)

  const auditLogs = useState<AdminAuditLogItem[]>('admin:auditLogs', () => [])
  const auditTotal = useState<number>('admin:auditTotal', () => 0)
  const auditLoading = ref(false)

  async function getAuthToken(): Promise<string | null> {
    if (!import.meta.client) return null
    try {
      const auth = useFirebaseAuth()
      if (!auth?.currentUser) return null
      return await auth.currentUser.getIdToken()
    }
    catch {
      return null
    }
  }

  async function adminFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    type GenericFetch = <R>(url: string, opts?: unknown) => Promise<R>

    if (import.meta.server) {
      const fetcher = useRequestFetch()
      return await (fetcher as unknown as GenericFetch)<T>(path, options)
    }

    const token = await getAuthToken()
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    return await (globalThis.$fetch as unknown as GenericFetch)<T>(path, {
      ...options,
      headers,
    })
  }

  async function checkAccess(): Promise<{ ok: boolean, reason?: 'forbidden' | 'unauthenticated' | 'error' }> {
    try {
      const res = await adminFetch<AdminMetricsResponse>('/api/admin/metrics')
      metrics.value = res
      accessDenied.value = false
      return { ok: true }
    }
    catch (err: unknown) {
      const e = err as { statusCode?: number }
      if (e?.statusCode === 403) {
        accessDenied.value = true
        return { ok: false, reason: 'forbidden' }
      }
      if (e?.statusCode === 401) {
        return { ok: false, reason: 'unauthenticated' }
      }
      return { ok: false, reason: 'error' }
    }
  }

  async function fetchMetrics(silent = false) {
    if (!silent) metricsLoading.value = true
    metricsError.value = null
    try {
      const res = await adminFetch<AdminMetricsResponse>('/api/admin/metrics')
      metrics.value = res
    }
    catch (err: unknown) {
      metricsError.value = 'Failed to load platform metrics'
      throw err
    }
    finally {
      metricsLoading.value = false
    }
  }

  async function fetchTenants(params?: { search?: string, tier?: string }) {
    tenantsLoading.value = true
    try {
      const query = new URLSearchParams()
      if (params?.search?.trim()) query.set('search', params.search.trim())
      if (params?.tier && params.tier !== 'all') query.set('tier', params.tier)

      const qs = query.toString() ? `?${query.toString()}` : ''
      const res = await adminFetch<AdminTenantsResponse>(`/api/admin/tenants${qs}`)
      tenants.value = res.tenants
      tenantsTotal.value = res.total
    }
    finally {
      tenantsLoading.value = false
    }
  }

  async function fetchTenantDetails(id: string): Promise<AdminTenantDetail> {
    return await adminFetch<AdminTenantDetail>(`/api/admin/tenants/${encodeURIComponent(id)}`)
  }

  async function provisionTenant(input: AdminProvisionInput): Promise<AdminProvisionResponse> {
    return await adminFetch<AdminProvisionResponse>('/api/admin/tenants/provision', {
      method: 'POST',
      body: input,
    })
  }

  async function updateTenantSettings(id: string, input: AdminUpdateTenantInput) {
    return await adminFetch<{ success: boolean }>(`/api/admin/tenants/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    })
  }

  async function testConnection(id: string): Promise<AdminTestConnectionResponse> {
    return await adminFetch<AdminTestConnectionResponse>(`/api/admin/tenants/${encodeURIComponent(id)}/test-connection`, {
      method: 'POST',
    })
  }

  async function fetchUsers(search?: string) {
    usersLoading.value = true
    try {
      const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
      const res = await adminFetch<AdminUsersResponse>(`/api/admin/users${qs}`)
      users.value = res.users
      usersTotal.value = res.total
    }
    finally {
      usersLoading.value = false
    }
  }

  async function assignUser(uid: string, tenantId: string) {
    return await adminFetch<{ success: boolean }>(`/api/admin/users/${encodeURIComponent(uid)}/assign`, {
      method: 'POST',
      body: { tenantId },
    })
  }

  async function reassignUser(uid: string, newTenantId: string) {
    return await adminFetch<{ success: boolean, sessionsRevoked: boolean }>(`/api/admin/users/${encodeURIComponent(uid)}/reassign`, {
      method: 'POST',
      body: { newTenantId },
    })
  }

  async function unlinkUser(uid: string) {
    return await adminFetch<{ success: boolean, wasSoleMember: boolean }>(`/api/admin/users/${encodeURIComponent(uid)}/unlink`, {
      method: 'POST',
    })
  }

  async function resetUserPassword(uid: string) {
    return await adminFetch<{ success: boolean, emailSent: boolean }>(`/api/admin/users/${encodeURIComponent(uid)}/reset-password`, {
      method: 'POST',
    })
  }

  async function fetchMigrations() {
    migrationsLoading.value = true
    try {
      const res = await adminFetch<AdminMigrationsResponse>('/api/admin/migrations')
      migrations.value = res
    }
    finally {
      migrationsLoading.value = false
    }
  }

  async function runBatchMigrations(tenantIds?: string[]): Promise<AdminBatchMigrationResponse> {
    return await adminFetch<AdminBatchMigrationResponse>('/api/admin/migrations/run-all', {
      method: 'POST',
      body: { tenantIds },
    })
  }

  async function runSingleMigration(tenantId: string) {
    return await adminFetch<{ success: boolean, tenantId: string, version: string, error?: string }>('/api/admin/migrations/run-single', {
      method: 'POST',
      body: { tenantId },
    })
  }

  async function fetchSyncTelemetry() {
    syncLoading.value = true
    try {
      const res = await adminFetch<AdminSyncTelemetryResponse>('/api/admin/sync/telemetry')
      syncTelemetry.value = res.telemetry
    }
    finally {
      syncLoading.value = false
    }
  }

  async function fetchChangeLog(tenantId: string, page = 1, limit = 50, entityType?: string, deviceId?: string): Promise<AdminChangeLogResponse> {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (entityType && entityType !== 'all') query.set('entityType', entityType)
    if (deviceId && deviceId !== 'all') query.set('deviceId', deviceId)
    return await adminFetch<AdminChangeLogResponse>(`/api/admin/sync/tenants/${encodeURIComponent(tenantId)}/change-log?${query.toString()}`)
  }

  async function fetchSyncIssues(tenantId: string): Promise<AdminSyncIssuesResponse> {
    return await adminFetch<AdminSyncIssuesResponse>(`/api/admin/sync/tenants/${encodeURIComponent(tenantId)}/issues`)
  }

  async function prepareFreshSnapshot(tenantId: string) {
    return await adminFetch<{ success: boolean, baseVersion: number, appliedAt: string }>(`/api/admin/sync/tenants/${encodeURIComponent(tenantId)}/snapshot`, {
      method: 'POST',
    })
  }

  async function fetchAuditLogs(page = 1, limit = 50, query?: string) {
    auditLoading.value = true
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (query?.trim()) q.set('query', query.trim())
      const res = await adminFetch<AdminAuditLogsResponse>(`/api/admin/audit-logs?${q.toString()}`)
      auditLogs.value = res.logs
      auditTotal.value = res.total
    }
    finally {
      auditLoading.value = false
    }
  }

  return {
    accessDenied,
    metrics,
    metricsLoading,
    metricsError,
    tenants,
    tenantsTotal,
    tenantsLoading,
    tenantFilters,
    users,
    usersTotal,
    usersLoading,
    userSearch,
    migrations,
    migrationsLoading,
    syncTelemetry,
    syncLoading,
    auditLogs,
    auditTotal,
    auditLoading,
    checkAccess,
    fetchMetrics,
    fetchTenants,
    fetchTenantDetails,
    provisionTenant,
    updateTenantSettings,
    testConnection,
    fetchUsers,
    assignUser,
    reassignUser,
    unlinkUser,
    resetUserPassword,
    fetchMigrations,
    runBatchMigrations,
    runSingleMigration,
    fetchSyncTelemetry,
    fetchChangeLog,
    fetchSyncIssues,
    prepareFreshSnapshot,
    fetchAuditLogs,
  }
}
