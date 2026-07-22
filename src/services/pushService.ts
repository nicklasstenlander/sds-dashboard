const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://sds-cogwork-proxy.nicklas-stenlander.workers.dev'

export type PushTarget = { type: 'all' } | { type: 'course'; eventId: number }

export interface SendPushResult {
  sent: number
  failed: number
}

export async function sendCustomPush(
  accessToken: string,
  title: string,
  message: string,
  target: PushTarget,
): Promise<SendPushResult> {
  const res = await fetch(`${PROXY_URL}/push/send-custom`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ title, message, target }),
  })

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(errBody.error || `Serverfel (${res.status})`)
  }

  return res.json() as Promise<SendPushResult>
}
