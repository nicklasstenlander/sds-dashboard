import type { BookingsResponse, EventsResponse } from '../types/cogwork'

const PROXY_URL = import.meta.env.VITE_PROXY_URL as string | undefined

if (!PROXY_URL) {
  throw new Error('VITE_PROXY_URL saknas i miljövariabler')
}

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

type ProxyType = 'all' | 'bookings' | 'events' | 'duplicates'

interface ProxyParams {
  type: ProxyType
  eventBlockId?: string | number
}

export interface AllDataResponse {
  bookings:   BookingsResponse
  events:     EventsResponse
  duplicates: BookingsResponse
  cachedAt:   string
}

// ---------------------------------------------------------------------------
// Fetch-hjälpare
// ---------------------------------------------------------------------------

async function proxyFetch<T>(params: ProxyParams): Promise<T> {
  const url = new URL(PROXY_URL!)
  url.searchParams.set('type', params.type)
  if (params.eventBlockId) {
    url.searchParams.set('eventBlockId', String(params.eventBlockId))
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Proxy svarade ${res.status} på type=${params.type}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Exporterade anrop — ett per endpoint-typ
// ---------------------------------------------------------------------------

/** Hämtar bookings + events + duplicates i ett enda anrop. */
export function fetchAllData(eventBlockId?: string): Promise<AllDataResponse> {
  return proxyFetch<AllDataResponse>({ type: 'all', eventBlockId })
}

/** Hämtar endast bokningar. */
export function fetchProxyBookings(eventBlockId?: string): Promise<BookingsResponse> {
  return proxyFetch<BookingsResponse>({ type: 'bookings', eventBlockId })
}

/** Hämtar endast events. */
export function fetchProxyEvents(eventBlockId?: string): Promise<EventsResponse> {
  return proxyFetch<EventsResponse>({ type: 'events', eventBlockId })
}

/** Hämtar dubbelanmälda bokningar. */
export function fetchProxyDuplicates(): Promise<BookingsResponse> {
  return proxyFetch<BookingsResponse>({ type: 'duplicates' })
}
