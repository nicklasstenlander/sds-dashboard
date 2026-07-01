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

export type VerifyPasswordResult = 'ok' | 'rejected' | 'error'

/** Validerar ett CogWork-lösenord genom att göra ett minimalt anrop mot events-endpointen. */
export async function verifyCogworkPassword(pw: string): Promise<VerifyPasswordResult> {
  try {
    const res = await fetch(`${BASE}/events/?org=sollentunadans&pw=${encodeURIComponent(pw)}&maxRows=1`)
    if (res.ok) return 'ok'
    if (res.status === 401 || res.status === 403) return 'rejected'
    return 'error'
  } catch {
    return 'error'
  }
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

const ALL_EVENTS_PROXY_URL = (import.meta.env.VITE_ALL_EVENTS_PROXY_URL as string | undefined)
  ?? (import.meta.env.VITE_NARVARO_URL as string | undefined)
  ?? 'https://script.google.com/macros/s/AKfycbx-euNjfAQaEfgA2xpkmhYUgpxUOI29cw0GF3-aLRkLowr4-U40HGdXyKgQPyFOCtyo/exec'

// Hämtar ALLA kurser inkl dolda (showing: false) via Apps Script med type=all_events.
// Returnerar kurser som inte syns i det publika /events/-svaret.
export async function fetchAllEvents(eventBlockId?: string): Promise<{ events: Event[] }> {
  const url = new URL(ALL_EVENTS_PROXY_URL)
  url.searchParams.set('type', 'all_events')
  if (eventBlockId) url.searchParams.set('eventBlockId', eventBlockId)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const events = Array.isArray(data) ? data : (data.events || [])
  return { events: events as Event[] }
}
