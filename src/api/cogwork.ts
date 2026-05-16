import type { ApiConfig, Event, EventsResponse, BookingsResponse, UsersResponse } from '../types/cogwork'

// In dev, Vite proxies /api/public → https://dans.se to avoid CORS.
// In production (GitHub Pages) we call the API directly.
const BASE = import.meta.env.DEV ? '/api/public' : 'https://dans.se/api/public'

function buildParams(config: ApiConfig, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ org: config.org, verbose: '1', maxRows: '1000' })
  if (config.pw) params.set('pw', config.pw)
  Object.entries(extra).forEach(([k, v]) => v && params.set(k, v))
  return params.toString()
}

export async function fetchEvents(
  config: ApiConfig,
  extra: Record<string, string> = {},
): Promise<EventsResponse> {
  const res = await fetch(`${BASE}/events/?${buildParams(config, extra)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) {
    const e = data.errors[0]
    throw new Error(typeof e === 'string' ? e : (e?.msg ?? 'API-fel'))
  }
  return data as EventsResponse
}


export async function fetchUser(config: ApiConfig, name: string): Promise<UsersResponse> {
  const params = new URLSearchParams({ org: config.org, verbose: '1' })
  if (config.pw) params.set('pw', config.pw)
  params.set('name', name)
  const res = await fetch(`${BASE}/users/?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) {
    const e = data.errors[0]
    throw new Error(typeof e === 'string' ? e : (e?.msg ?? 'API-fel'))
  }
  return data as UsersResponse
}

export async function fetchUsers(config: ApiConfig, query: string): Promise<UsersResponse> {
  const params = new URLSearchParams({ org: config.org, verbose: '1', maxRows: '50' })
  if (config.pw) params.set('pw', config.pw)
  params.set('textSearch', query)
  const res = await fetch(`${BASE}/users/?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) {
    const e = data.errors[0]
    throw new Error(typeof e === 'string' ? e : (e?.msg ?? 'API-fel'))
  }
  return data as UsersResponse
}

export async function fetchBookings(
  config: ApiConfig,
  extra: Record<string, string> = {},
): Promise<BookingsResponse> {
  const res = await fetch(`${BASE}/bookings/?${buildParams(config, extra)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) {
    const e = data.errors[0]
    throw new Error(typeof e === 'string' ? e : (e?.msg ?? 'API-fel'))
  }
  return data as BookingsResponse
}

// Hämtar ALLA kurser inkl dolda (showing: false) via proxyn med type=all_events.
// Returnerar kurser som inte syns i det publika /events/-svaret.
export async function fetchAllEvents(eventBlockId?: string): Promise<{ events: Event[] }> {
  const proxyUrl = import.meta.env.VITE_PROXY_URL as string | undefined
  if (!proxyUrl) throw new Error('VITE_PROXY_URL saknas')
  const url = eventBlockId
    ? `${proxyUrl}?type=all_events&eventBlockId=${eventBlockId}`
    : `${proxyUrl}?type=all_events`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const events = Array.isArray(data) ? data : (data.events || [])
  return { events: events as Event[] }
}
