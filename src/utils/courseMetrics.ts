import type { Booking, Event } from '../types/cogwork'
import { blockNameToCode, dateToPeriodCode, isPeriodCode } from './periods'

export interface CourseMetrics {
  registered: number
  accepted: number
  revenue: number
  price?: number
}

export interface CourseChangeInfo {
  fromCourses: string[]
}

interface EventCategoryLike {
  code?: string
  name?: string
  category?: { name?: string }
  grouping?: {
    eventBlock?: unknown
    primaryEventGroup?: { name?: string }
  }
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

/** Bredare "antagen"-check använd av iOS Översikt (fångar även textbaserad status). */
export function isAcceptedForOverview(booking: Booking): boolean {
  const code = booking.status?.code?.toUpperCase() ?? ''
  const name = booking.status?.name?.toLowerCase() ?? ''
  return code === 'ACCEPTED' || name.includes('accepterad') || name.includes('antagen')
}

export function isPerformanceEvent(event?: EventCategoryLike): boolean {
  return isPerformanceCategoryName(event?.grouping?.primaryEventGroup?.name)
    || isPerformanceCategoryName(event?.category?.name)
    || isPerformanceText(event?.code)
    || isPerformanceText(event?.name)
}

export function isPerformanceBooking(booking: Booking): boolean {
  return isPerformanceEvent(booking.event)
}

export function isStatisticalEvent(event: Event): boolean {
  return !isPerformanceEvent(event)
}

export function isStatisticalBooking(booking: Booking): boolean {
  return !isPerformanceBooking(booking)
}

/**
 * Måste mata in en all-time (ofiltrerad) bokningslista, annars blir "ny elev" fel per period.
 *
 * CogWork kan skapa ett separat participant.key/id för samma fysiska person om en annan
 * kontakt-e-post används vid anmälan (bekräftat på riktig data). Bokningar som delar exakt
 * namn OCH födelsedatum slås därför ihop till samma identitet innan vi räknar.
 */
export function countBookingsByParticipant(bookings: Booking[]): Map<string, number> {
  const canonicalKeyOf = new Map<string, string>()
  const keyByNameAndBirth = new Map<string, string>()

  for (const booking of bookings) {
    const key = booking.participant?.key
    if (!key || canonicalKeyOf.has(key)) continue

    const name = booking.participant?.name?.trim().toLowerCase()
    const dateOfBirth = booking.participant?.dateOfBirth
    if (!name || !dateOfBirth) {
      canonicalKeyOf.set(key, key)
      continue
    }

    const identity = `${name}|${dateOfBirth}`
    const existingKey = keyByNameAndBirth.get(identity)
    if (existingKey) {
      canonicalKeyOf.set(key, existingKey)
    } else {
      keyByNameAndBirth.set(identity, key)
      canonicalKeyOf.set(key, key)
    }
  }

  const countByCanonicalKey = new Map<string, number>()
  for (const booking of bookings) {
    const key = booking.participant?.key
    if (!key) continue
    const canonicalKey = canonicalKeyOf.get(key) ?? key
    countByCanonicalKey.set(canonicalKey, (countByCanonicalKey.get(canonicalKey) ?? 0) + 1)
  }

  // Exponera räkningen under varje ursprunglig nyckel, så anrop kan slå upp med
  // booking.participant.key rakt av utan att känna till den kanoniska identiteten.
  const countByParticipant = new Map<string, number>()
  for (const [key, canonicalKey] of canonicalKeyOf) {
    countByParticipant.set(key, countByCanonicalKey.get(canonicalKey) ?? 0)
  }
  return countByParticipant
}

/**
 * Antal UNIKA elever med aktiv antagning i det redan periodfiltrerade urvalet.
 * Porterad rakt av från iOS `OversiktView.activeStudentCount` /
 * `CourseMetricsEngine.canonicalParticipantKeys` — samma identifierarfält
 * (participant.key, med namn+födelsedatum som fallback om key saknas) och
 * samma status-filter (`isAcceptedForOverview`). Bokningar utan varken key
 * eller namn+födelsedatum saknar identifierare och räknas inte in, precis
 * som i iOS.
 */
export function countActiveStudents(bookings: Booking[]): number {
  const accepted = bookings.filter(isAcceptedForOverview)
  const canonicalKeyOf = buildActiveStudentCanonicalKeys(accepted)

  const uniqueKeys = new Set<string>()
  for (const booking of accepted) {
    const key = activeStudentParticipantIdentifier(booking)
    if (!key) continue
    uniqueKeys.add(canonicalKeyOf.get(key) ?? key)
  }
  return uniqueKeys.size
}

function buildActiveStudentCanonicalKeys(bookings: Booking[]): Map<string, string> {
  const canonicalKeyOf = new Map<string, string>()
  const keyByNameAndBirth = new Map<string, string>()

  for (const booking of bookings) {
    const key = activeStudentParticipantIdentifier(booking)
    if (!key || canonicalKeyOf.has(key)) continue

    const identity = activeStudentNameAndBirthIdentity(booking)
    if (!identity) {
      canonicalKeyOf.set(key, key)
      continue
    }

    const existingKey = keyByNameAndBirth.get(identity)
    if (existingKey) {
      canonicalKeyOf.set(key, existingKey)
    } else {
      keyByNameAndBirth.set(identity, key)
      canonicalKeyOf.set(key, key)
    }
  }

  return canonicalKeyOf
}

function activeStudentParticipantIdentifier(booking: Booking): string | undefined {
  const key = booking.participant?.key?.trim()
  if (key) return key

  const identity = activeStudentNameAndBirthIdentity(booking)
  return identity ? `nameDob:${identity}` : undefined
}

function activeStudentNameAndBirthIdentity(booking: Booking): string | undefined {
  const name = booking.participant?.name?.trim().toLowerCase()
  const dateOfBirth = booking.participant?.dateOfBirth?.trim()
  return name && dateOfBirth ? `${name}|${dateOfBirth}` : undefined
}

/** En elev räknas som ny om detta är dennes enda bokning, någonsin. */
export function isNewStudentBooking(booking: Booking, countByParticipant: Map<string, number>): boolean {
  const key = booking.participant?.key
  return Boolean(key) && (countByParticipant.get(key ?? '') ?? 0) === 1
}

export function buildCourseChangeInfoByParticipant(
  bookings: Booking[],
  currentPeriodCode: string,
): Map<string, CourseChangeInfo> {
  const previousPeriodCode = previousPeriod(currentPeriodCode)
  if (!previousPeriodCode) return new Map()

  const canonicalKeyOf = buildCanonicalParticipantKeys(bookings)
  const lookupKeysByCanonicalKey = new Map<string, Set<string>>()
  const coursesByCanonicalKey = new Map<string, {
    current: Map<string, string>
    previous: Map<string, string>
  }>()

  for (const booking of bookings) {
    const baseKey = participantBaseKey(booking)
    if (!baseKey) continue

    const canonicalKey = canonicalKeyOf.get(baseKey) ?? baseKey
    const lookupKeys = lookupKeysByCanonicalKey.get(canonicalKey) ?? new Set<string>()
    participantLookupKeys(booking).forEach((key) => lookupKeys.add(key))
    lookupKeysByCanonicalKey.set(canonicalKey, lookupKeys)

    const periodCode = bookingPeriodCode(booking)
    if (periodCode !== currentPeriodCode && periodCode !== previousPeriodCode) continue

    const courseName = booking.event?.name?.trim()
    const normalizedName = normalizeCourseName(courseName)
    if (!courseName || !normalizedName) continue

    const courses = coursesByCanonicalKey.get(canonicalKey) ?? { current: new Map(), previous: new Map() }
    if (periodCode === currentPeriodCode) courses.current.set(normalizedName, courseName)
    if (periodCode === previousPeriodCode) courses.previous.set(normalizedName, courseName)
    coursesByCanonicalKey.set(canonicalKey, courses)
  }

  const result = new Map<string, CourseChangeInfo>()
  for (const [canonicalKey, courses] of coursesByCanonicalKey) {
    if (courses.current.size === 0 || courses.previous.size === 0) continue

    const continuesCourse = Array.from(courses.current.keys())
      .some((courseName) => courses.previous.has(courseName))
    if (continuesCourse) continue

    const info = {
      fromCourses: Array.from(courses.previous.values()).sort((a, b) => a.localeCompare(b, 'sv')),
    }
    const lookupKeys = lookupKeysByCanonicalKey.get(canonicalKey) ?? new Set([canonicalKey])
    lookupKeys.forEach((key) => result.set(key, info))
  }

  return result
}

export function courseChangeInfoForBooking(
  booking: Booking,
  changeInfoByParticipant: Map<string, CourseChangeInfo>,
): CourseChangeInfo | undefined {
  for (const key of participantLookupKeys(booking)) {
    const info = changeInfoByParticipant.get(key)
    if (info) return info
  }
  return undefined
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

function buildCanonicalParticipantKeys(bookings: Booking[]): Map<string, string> {
  const canonicalKeyOf = new Map<string, string>()
  const keyByNameAndBirth = new Map<string, string>()

  for (const booking of bookings) {
    const baseKey = participantBaseKey(booking)
    if (!baseKey || canonicalKeyOf.has(baseKey)) continue

    const identity = participantNameAndBirthKey(booking)
    if (!identity) {
      canonicalKeyOf.set(baseKey, baseKey)
      continue
    }

    const existingKey = keyByNameAndBirth.get(identity)
    if (existingKey) {
      canonicalKeyOf.set(baseKey, existingKey)
    } else {
      keyByNameAndBirth.set(identity, baseKey)
      canonicalKeyOf.set(baseKey, baseKey)
    }
  }

  return canonicalKeyOf
}

function participantLookupKeys(booking: Booking): string[] {
  return [
    booking.participant?.key,
    participantNameAndBirthKey(booking),
    participantNameKey(booking),
  ].filter((key): key is string => Boolean(key))
}

function participantBaseKey(booking: Booking): string {
  return booking.participant?.key
    ?? participantNameAndBirthKey(booking)
    ?? participantNameKey(booking)
    ?? ''
}

function participantNameAndBirthKey(booking: Booking): string {
  const name = booking.participant?.name?.trim().toLowerCase()
  const dateOfBirth = booking.participant?.dateOfBirth
  return name && dateOfBirth ? `name-birth:${name}|${dateOfBirth}` : ''
}

function participantNameKey(booking: Booking): string {
  const name = booking.participant?.name?.trim().toLowerCase()
  return name ? `name:${name}` : ''
}

function bookingPeriodCode(booking: Booking): string {
  const blockName = booking.event?.grouping?.eventBlock?.name
  if (blockName) {
    const code = blockNameToCode(blockName).toUpperCase()
    if (isPeriodCode(code)) return code
  }

  const eventCode = booking.event?.code?.toUpperCase()
  if (eventCode && isPeriodCode(eventCode)) return eventCode

  return dateToPeriodCode(booking.event?.startDate ?? booking.event?.startDateTime)
}

function previousPeriod(periodCode: string): string {
  const match = periodCode.match(/^(HT|VT)(\d{2})$/)
  if (!match) return ''

  const year = Number(match[2])
  return match[1] === 'HT'
    ? `VT${String(year).padStart(2, '0')}`
    : `HT${String(year - 1).padStart(2, '0')}`
}

function normalizeCourseName(name?: string): string {
  return name?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

function isPerformanceCategoryName(name?: string): boolean {
  return name?.trim().toLowerCase() === 'föreställningar'
}

function isPerformanceText(value?: string): boolean {
  const normalized = value?.trim().toLowerCase()
  return Boolean(normalized?.includes('föreställning') || normalized?.includes('forestallning'))
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
