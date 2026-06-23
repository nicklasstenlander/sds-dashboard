export const bookingStatusLabels: Record<string, string> = {
  ACCEPTED: 'Accepterad',
  ACCEPTED_ON_PAYMENT: 'Inväntar betalning',
  AWAITING_FEE: 'Inväntar betalning',
  NEW: 'Inväntar handläggning',
  IN_QUEUE: 'Köplats',
  AWAITING_RESPONSE: 'Inväntar svar',
  WAITING: 'Väntar',
  Accepted: 'Accepterad',
  'Accepted on payment': 'Inväntar betalning',
  'To be processed': 'Inväntar handläggning',
}

const warnedUnknownStatuses = new Set<string>()

export function formatBookingStatus(raw?: string | null, fallbackRaw?: string | null): string {
  if (!raw) return '—'

  const queueSource = raw === 'IN_QUEUE' ? fallbackRaw : raw
  const queuePosition = queueSource?.match(/^Queue position\s+(\d+)$/i)
  if (queuePosition) return `Köplats ${queuePosition[1]}`

  const label = bookingStatusLabels[raw]
  if (label) return label

  if (fallbackRaw) {
    const fallbackLabel = bookingStatusLabels[fallbackRaw]
    if (fallbackLabel) return fallbackLabel
  }

  if (import.meta.env.DEV && !warnedUnknownStatuses.has(raw)) {
    warnedUnknownStatuses.add(raw)
    console.warn(`Okänd CogWork-status: ${raw}`)
  }

  return raw
}
