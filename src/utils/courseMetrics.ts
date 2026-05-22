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

export function buildCourseMetrics(bookings: Booking[]): Map<string, CourseMetrics> {
  const metrics = new Map<string, CourseMetrics>()
  const priceCounts = new Map<string, Map<number, number>>()

  for (const booking of bookings) {
    const id = bookingEventId(booking)
    if (!id) continue

    const current = metrics.get(id) ?? { registered: 0, accepted: 0, revenue: 0 }
    current.registered += 1

    const price = booking.payment?.priceAgreed
    if (price != null) {
      const counts = priceCounts.get(id) ?? new Map<number, number>()
      counts.set(price, (counts.get(price) ?? 0) + 1)
      priceCounts.set(id, counts)
    }

    if (isAcceptedBooking(booking)) {
      current.accepted += 1
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
