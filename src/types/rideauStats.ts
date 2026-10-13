// Kontraktet från Workern (sds-cogwork-proxy) GET /rideau/stats, som i sin
// tur vidarebefordrar Rideaus (sds-ticketing-poc) stats-for-core oförändrat
// plus cached_at/stale/stale_since. Se Fas 1/2-ordern "Föreställningar-
// statistik från Rideau till CORE" 2026-10-13.
export type RideauEventStatus = 'draft' | 'published' | 'cancelled' | string

export interface RideauTicketTypeStat {
  name: string
  sold: number
  revenue_ore: number
}

export interface RideauDayStat {
  date: string // YYYY-MM-DD, redan i Europe/Stockholm (satt av Rideau)
  tickets: number
  revenue_ore: number
}

export interface RideauEventStat {
  event_id: string
  slug: string
  title: string
  starts_at: string | null
  status: RideauEventStatus
  capacity: number
  sold: number
  checked_in: number
  revenue_ore: number
  by_ticket_type: RideauTicketTypeStat[]
  by_day: RideauDayStat[]
}

export interface RideauStatsResponse {
  generated_at: string
  cached_at: string
  stale: boolean
  stale_since?: string
  revenue_basis: string
  revenue_includes_vat: boolean
  events: RideauEventStat[]
}
