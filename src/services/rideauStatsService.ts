import type { RideauStatsResponse } from '../types/rideauStats'

// SAMMA PROXY_URL/mönster som pushService.ts (sendCustomPush) - webben
// talar bara med Workern, aldrig direkt med Rideau. Ingen Rideau-URL eller
// Rideau-token förekommer här eller någon annanstans i klientkoden.
const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://sds-cogwork-proxy.nicklas-stenlander.workers.dev'

export class RideauStatsError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'RideauStatsError'
    this.status = status
  }
}

export async function fetchRideauStats(accessToken: string): Promise<RideauStatsResponse> {
  const res = await fetch(`${PROXY_URL}/rideau/stats`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new RideauStatsError(res.status, errBody.error || `Serverfel (${res.status})`)
  }

  return res.json() as Promise<RideauStatsResponse>
}
