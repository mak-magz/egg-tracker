// GET /api/me (docs/features/00-project-scaffold.md §3.4). No input: query strings are ignored (AC23).
// 200 MeResponse (farm null = no membership, AC12) | 401 unauthenticated | 500 internal.
import type { MeResponse } from '../../shared/types/api'
import { getMembership } from '../utils/auth'
import { defineAuthedHandler } from '../utils/handlers'

export default defineAuthedHandler(async (event, ctx): Promise<MeResponse> => {
  const membership = await getMembership(event)
  return { email: ctx.email, farm: membership?.farm ?? null }
})
