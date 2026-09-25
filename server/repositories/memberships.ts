import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import type { FarmSummary } from '../../shared/types/api'
import { toFarmSummary } from './tenants'

export interface MembershipWithFarm {
  tenantId: string
  farm: FarmSummary
}

/**
 * The only query that runs BEFORE the tenant is known. Scoped by user_id (and by RLS:
 * memberships_select_own / tenants_select_own), and embeds the farm in one round trip.
 * Returns null when the user has no membership (AC12). Throws on DB errors.
 */
export async function findMembershipWithFarm(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<MembershipWithFarm | null> {
  const { data, error } = await client
    .from('memberships')
    .select('tenant_id, tenants ( id, name, eggs_per_tray, sizes ( id, name, sort_order, color_slot, archived_at ) )')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  if (!data.tenants) {
    // Membership visible but its farm isn't: RLS and memberships disagree. Never guess.
    throw new Error('membership without a visible farm')
  }
  return { tenantId: data.tenant_id, farm: toFarmSummary(data.tenants) }
}
