import type { Booking, Event } from '../types/cogwork'

export interface CourseMetrics {
  registered: number
  accepted: number
  revenue: number
  price?: number
}

export const EMPTY_COURSE_METRICS: CourseMetrics = {
  registered: 0,
  accepted: 0,
  revenue: 0,
}

export function bookingEventId(booking: Booking): string {
  return booking.event?.id != null ? String(booking.event.id) : ''
}

export function eventId(event: Event): string {
  return String(event.id)
}

export function isAcceptedBooking(booking: Booking): boolean {
  return booking.status?.code?.toUpperCase() === 'ACCEPTED'
}

export function bookingTicketQuantity(booking: Booking): number {
  const structuredQuantity = ticketQuantityFromFormResponses(booking)
  if (structuredQuantity != null) return structuredQuantity

  const summaryQuantity = ticketQuantityFromSummary(booking.regFormResponse?.textSummary)
  return summaryQuantity ?? 1
}

export function buildCourseMetrics(bookings: Booking[]): Map<string, CourseMetrics> {
  const metrics = new Map<string, CourseMetrics>()
  const priceCounts = new Map<string, Map<number, number>>()

  for (const booking of bookings) {
    const id = bookingEventId(booking)
    if (!id) continue

    const quantity = bookingTicketQuantity(booking)
    const current = metrics.get(id) ?? { registered: 0, accepted: 0, revenue: 0 }
    current.registered += quantity

    const price = booking.payment?.priceAgreed
    if (price != null) {
      const unitPrice = quantity > 0 ? Math.round(price / quantity) : price
      const counts = priceCounts.get(id) ?? new Map<number, number>()
      counts.set(unitPrice, (counts.get(unitPrice) ?? 0) + quantity)
      priceCounts.set(id, counts)
    }

    if (isAcceptedBooking(booking)) {
      current.accepted += quantity
      current.revenue += price ?? 0
    }

    metrics.set(id, current)
  }

  for (const [id, counts] of priceCounts) {
    const current = metrics.get(id)
    if (!current) continue

    const [mostCommonPrice] = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    current.price = mostCommonPrice
  }

  return metrics
}

export function metricsForEvent(
  metrics: Map<string, CourseMetrics>,
  event: Event,
  fallbackToEventStatistics = true,
): CourseMetrics {
  const fromBookings = metrics.get(eventId(event))
  if (fromBookings) return fromBookings
  if (!fallbackToEventStatistics) return EMPTY_COURSE_METRICS

  const accepted = event.statistics?.accepted ?? 0
  const price = event.pricing?.basePriceInclVat
  return {
    registered: accepted,
    accepted,
    price,
    revenue: accepted * (price ?? 0),
  }
}

function ticketQuantityFromFormResponses(booking: Booking): number | null {
  const responses = booking.formResponses ?? []
  for (let i = responses.length - 1; i >= 0; i--) {
    let total = 0
    let foundTicketQuestion = false

    for (const question of responses[i]?.answeredQuestions ?? []) {
      if (!isTicketQuantityQuestion(question.questionTitle)) continue

      foundTicketQuestion = true
      for (const answer of Object.values(question.answers ?? {})) {
        total += parseQuantityAnswer(answer)
      }
    }

    if (foundTicketQuestion) return total > 0 ? total : null
  }

  return null
}

function ticketQuantityFromSummary(summary?: string): number | null {
  if (!summary) return null

  const lines = summary.split(/\r?\n/)
  let total = 0
  let foundTicketLine = false
  let currentLineIsTicketQuantity = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (isTicketQuantityQuestion(trimmed)) {
      currentLineIsTicketQuantity = true
      continue
    }

    if (currentLineIsTicketQuantity) {
      const quantity = parseQuantityAnswer(trimmed.replace(/^-\s*/, ''))
      total += quantity
      foundTicketLine = true
      currentLineIsTicketQuantity = false
    }
  }

  return foundTicketLine && total > 0 ? total : null
}

function isTicketQuantityQuestion(title?: string): boolean {
  const normalized = title?.trim().toLowerCase() ?? ''
  if (!normalized) return false
  if (normalized.includes('biljett')) return true
  return /^antal\s+(barn|vuxen|vuxna|ungdom|ungdomar|student|studenter|senior|seniorer|pensionär|pensionärer)\b/.test(normalized)
}

function parseQuantityAnswer(answer: string | number | null | undefined): number {
  if (typeof answer === 'number') return Number.isFinite(answer) && answer > 0 ? answer : 0
  const match = String(answer ?? '').trim().match(/^(\d+)/)
  return match ? Number(match[1]) : 0
}
