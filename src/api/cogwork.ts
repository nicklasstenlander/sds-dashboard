import { staffAuthHeaders, VIA_PROXY } from '../lib/proxyAuth'
import type { ApiConfig, Event, EventsResponse, BookingsResponse, UsersResponse } from '../types/cogwork'

// In dev, Vite proxies /api/public → https://dans.se to avoid CORS.
// In production (GitHub Pages) we call the API directly.
const BASE = import.meta.env.DEV ? '/api/public' : 'https://dans.se/api/public'
const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://sds-cogwork-proxy.nicklas-stenlander.workers.dev'

function usesWorker(config: ApiConfig): boolean {
  return config.pw === VIA_PROXY
}

async function readCogwork<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) {
    const e = data.errors[0]
    throw new Error(typeof e === 'string' ? e : (e?.msg ?? 'API-fel'))
  }
  return data as T
}

function buildParams(config: ApiConfig, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ org: config.org, verbose: '1', maxRows: '1000' })
  if (config.pw && config.pw !== VIA_PROXY) params.set('pw', config.pw)
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
  if (usesWorker(config)) {
    const url = new URL(`${PROXY_URL}/cogwork/users`)
    url.searchParams.set('name', name)
    return readCogwork<UsersResponse>(await fetch(url, { headers: await staffAuthHeaders() }))
  }
  const params = new URLSearchParams({ org: config.org, verbose: '1' })
  if (config.pw && config.pw !== VIA_PROXY) params.set('pw', config.pw)
  params.set('name', name)
  return readCogwork<UsersResponse>(await fetch(`${BASE}/users/?${params}`))
}

export async function fetchUsers(config: ApiConfig, query: string): Promise<UsersResponse> {
  if (usesWorker(config)) {
    const url = new URL(`${PROXY_URL}/cogwork/users`)
    url.searchParams.set('textSearch', query)
    return readCogwork<UsersResponse>(await fetch(url, { headers: await staffAuthHeaders() }))
  }
  const params = new URLSearchParams({ org: config.org, verbose: '1', maxRows: '50' })
  if (config.pw && config.pw !== VIA_PROXY) params.set('pw', config.pw)
  params.set('textSearch', query)
  return readCogwork<UsersResponse>(await fetch(`${BASE}/users/?${params}`))
}

export async function fetchBookings(
  config: ApiConfig,
  extra: Record<string, string> = {},
): Promise<BookingsResponse> {
  if (usesWorker(config)) {
    const url = new URL(`${PROXY_URL}/cogwork/bookings`)
    if (extra.eventId) url.searchParams.set('eventId', extra.eventId)
    if (extra.userId) url.searchParams.set('userId', extra.userId)
    if (extra.maxRows) url.searchParams.set('maxRows', extra.maxRows)
    return readCogwork<BookingsResponse>(await fetch(url, { headers: await staffAuthHeaders() }))
  }
  return readCogwork<BookingsResponse>(await fetch(`${BASE}/bookings/?${buildParams(config, extra)}`))
}

const ALL_EVENTS_PROXY_URL = (import.meta.env.VITE_ALL_EVENTS_PROXY_URL as string | undefined)
  ?? (import.meta.env.VITE_NARVARO_URL as string | undefined)
  ?? 'https://script.google.com/macros/s/AKfycbx-euNjfAQaEfgA2xpkmhYUgpxUOI29cw0GF3-aLRkLowr4-U40HGdXyKgQPyFOCtyo/exec'

// Hämtar kurser inkl dolda (showing: false) via ett öppet Apps Script.
// Svaret innehåller också deltagarnamn. De tas bort här så de inte hamnar i
// dashboardens cache. Själva URL:en är fortfarande öppen.
export async function fetchAllEvents(eventBlockId?: string): Promise<{ events: Event[] }> {
  const url = new URL(ALL_EVENTS_PROXY_URL)
  url.searchParams.set('type', 'all_events')
  if (eventBlockId) url.searchParams.set('eventBlockId', eventBlockId)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const events = (Array.isArray(data) ? data : (data.events || [])).map((event: Event & { participants?: unknown }) => {
    if (!event || typeof event !== 'object') return event
    const copy = { ...event }
    delete copy.participants
    return copy
  })
  return { events: events as Event[] }
}
