import { matchesPeriodCode } from './periods'
import type { Event, EventBlock } from '../types/cogwork'

interface GroupingLike {
  eventBlock?: EventBlock
  additionalEventGroups?: { key: string; id: string | number; name: string }[]
}

interface EventLike {
  grouping?: GroupingLike
}

interface BookingEventLike {
  id?: number
  code?: string
  startDate?: string
  startDateTime?: string
}

/**
 * All eventBlock (termin) ids that appear as a "real" grouping.eventBlock
 * somewhere in the given events — the dynamically-derived universe of known
 * termins, e.g. {"18402", "19459"}. Never hardcode termin ids: new terms
 * must work without a code change.
 */
export function collectKnownEventBlockIds(events: (EventLike | undefined)[]): Set<string> {
  const ids = new Set<string>()
  for (const e of events) {
    const id = e?.grouping?.eventBlock?.id
    if (id != null) ids.add(String(id))
  }
  return ids
}

/**
 * Resolves which termin (eventBlock id) an event/booking belongs to.
 * Some CogWork events lack grouping.eventBlock entirely — e.g. Danskalas
 * (eventId 260274) — their termin then only shows up in
 * grouping.additionalEventGroups instead. Falls back to matching against
 * the set of known termin ids so such events aren't silently dropped by
 * period filtering. eventBlock.id is a number while
 * additionalEventGroups[].id is a string, so compare via String().
 * Returns null when no termin can be determined — callers must keep such
 * events visible under "Alla terminer" rather than dropping them.
 */
export function resolveEventBlockId(
  event: EventLike | undefined,
  knownEventBlockIds: Set<string>,
): string | null {
  const directId = event?.grouping?.eventBlock?.id
  if (directId != null) return String(directId)

  const fallback = event?.grouping?.additionalEventGroups?.find((group) =>
    knownEventBlockIds.has(String(group.id)),
  )
  return fallback ? String(fallback.id) : null
}

/** Display name for the resolved termin (e.g. "Vårterminen 2026"), for detail/label UI. */
export function resolveEventBlockName(
  event: EventLike | undefined,
  knownEventBlockIds: Set<string>,
): string | null {
  if (event?.grouping?.eventBlock?.name) return event.grouping.eventBlock.name

  const fallback = event?.grouping?.additionalEventGroups?.find((group) =>
    knownEventBlockIds.has(String(group.id)),
  )
  return fallback?.name ?? null
}

/**
 * Maps event id → resolved termin id, built from the full (unfiltered)
 * events list. CogWork's /bookings response embeds a stripped-down copy of
 * the event on each booking that never carries grouping at all — so
 * bookings can't resolve their own termin the way a full Event can. Look
 * the booking's event id up in this map instead of trying
 * resolveEventBlockId() on booking.event directly.
 */
export function buildEventIdBlockIdMap(events: Event[]): Map<string, string | null> {
  const knownEventBlockIds = collectKnownEventBlockIds(events)
  const map = new Map<string, string | null>()
  for (const e of events) map.set(String(e.id), resolveEventBlockId(e, knownEventBlockIds))
  return map
}

/**
 * Whether a booking belongs to the given termin. Prefers the authoritative
 * eventId → termin map (derived from full Event data); falls back to
 * matching the booking's own code/date fields against a period code (e.g.
 * "HT26") for bookings whose event isn't present in the fetched events list
 * at all.
 */
export function bookingMatchesEventBlockId(
  bookingEvent: BookingEventLike | undefined,
  targetEventBlockId: string,
  eventIdToBlockId: Map<string, string | null>,
  fallbackPeriodCode: string,
): boolean {
  const id = bookingEvent?.id != null ? String(bookingEvent.id) : undefined
  const resolved = id ? eventIdToBlockId.get(id) : undefined
  if (resolved != null) return resolved === targetEventBlockId

  return Boolean(fallbackPeriodCode && matchesPeriodCode(fallbackPeriodCode, [
    bookingEvent?.code,
    bookingEvent?.startDate,
    bookingEvent?.startDateTime,
  ]))
}
