import type { ApiConfig, EventsResponse, BookingsResponse } from '../types/cogwork'

const BASE = '/api/public'

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
  if (data.errors?.length) throw new Error(data.errors[0]?.msg ?? 'API-fel')
  return data as EventsResponse
}

export async function fetchBookings(
  config: ApiConfig,
  extra: Record<string, string> = {},
): Promise<BookingsResponse> {
  const res = await fetch(`${BASE}/bookings/?${buildParams(config, extra)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.errors?.length) throw new Error(data.errors[0]?.msg ?? 'API-fel')
  return data as BookingsResponse
}
