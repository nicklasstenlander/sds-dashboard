const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://sds-cogwork-proxy.nicklas-stenlander.workers.dev'

export interface TelavoxCall {
  datetime:    string        // "2026-05-01 14:32:11"
  datetimeISO: string        // ISO med timezone
  duration:    number        // sekunder, 0 = missat
  number:      string        // telefonnummer i +46-format
  recordingId?: string
}

export interface TelavoxCallsResponse {
  incoming: TelavoxCall[]
  outgoing: TelavoxCall[]
  missed:   TelavoxCall[]
}

export async function fetchCalls(
  fromDate?: string,
  toDate?: string,
): Promise<TelavoxCallsResponse> {
  const url = new URL(`${PROXY_URL}/telavox/calls`)
  const today = new Date().toISOString().split('T')[0]
  url.searchParams.set('fromDate', fromDate ?? today)
  url.searchParams.set('toDate',   toDate   ?? today)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Telavox svarade ${res.status}`)
  return res.json()
}

export async function dial(number: string, agent: string = 'madeleine'): Promise<void> {
  const url = new URL(`${PROXY_URL}/telavox/dial`)
  url.searchParams.set('number', number)
  url.searchParams.set('agent',  agent)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Dial misslyckades: ${res.status}`)
}

export async function sendSms(number: string, message: string): Promise<void> {
  const url = new URL(`${PROXY_URL}/telavox/sms`)
  url.searchParams.set('number',  number)
  url.searchParams.set('message', message)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`SMS misslyckades: ${res.status}`)
}
