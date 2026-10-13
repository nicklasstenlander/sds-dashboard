import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { RideauEventStat } from '../types/rideauStats'

/** Öre -> "X kr", svensk tusentalsavgränsning. Avrundar till närmaste
 * krona - samma precision som övriga kr-värden i appen (Shop.tsx,
 * CourseDetailPanel.tsx använder också toLocaleString('sv-SE') utan
 * decimaler). */
export function formatOreAsSek(ore: number): string {
  return `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`
}

/** null/ogiltigt datum -> "Inget datum satt" - ALDRIG new Date(null)
 * (som i JS blir 1970-01-01, en falsk framtida/förflutna-signal). */
export function formatEventDate(startsAt: string | null): string {
  if (!startsAt) return 'Inget datum satt'
  const date = new Date(startsAt)
  if (Number.isNaN(date.getTime())) return 'Inget datum satt'
  return format(date, "d MMM yyyy, HH:mm", { locale: sv })
}

/** "HH:MM" för cached_at/stale_since - samma null-säkerhet som ovan. */
export function formatUpdatedAt(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return ''
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, 'HH:mm', { locale: sv })
}

export interface EventFilterOptions {
  showCancelled: boolean
}

/** Döljer 'cancelled' som standard (knappstyrd), döljer ALLTID 'draft' med
 * noll sålda (ett utkast ingen köpt något av är inte relevant statistik -
 * men ett utkast med sälj syns, t.ex. om det backats till draft EFTER
 * att biljetter redan såldes). Andra statusar (published, okänt) visas
 * alltid. */
export function shouldShowEvent(event: RideauEventStat, opts: EventFilterOptions): boolean {
  if (event.status === 'cancelled' && !opts.showCancelled) return false
  if (event.status === 'draft' && event.sold === 0) return false
  return true
}

export function filterEvents(events: RideauEventStat[], opts: EventFilterOptions): RideauEventStat[] {
  return events.filter((e) => shouldShowEvent(e, opts))
}

/** Kommande (datum >= nu) stigande datum först, därefter passerade
 * (fallande, senaste först), därefter de utan datum sist. */
export function sortEvents(events: RideauEventStat[], now: Date = new Date()): RideauEventStat[] {
  const upcoming: RideauEventStat[] = []
  const past: RideauEventStat[] = []
  const noDate: RideauEventStat[] = []

  for (const event of events) {
    const parsed = event.starts_at ? new Date(event.starts_at) : null
    if (!parsed || Number.isNaN(parsed.getTime())) {
      noDate.push(event)
    } else if (parsed.getTime() >= now.getTime()) {
      upcoming.push(event)
    } else {
      past.push(event)
    }
  }

  upcoming.sort((a, b) => new Date(a.starts_at as string).getTime() - new Date(b.starts_at as string).getTime())
  past.sort((a, b) => new Date(b.starts_at as string).getTime() - new Date(a.starts_at as string).getTime())

  return [...upcoming, ...past, ...noDate]
}

/** Visningsetikett för statusbadgen - "Avbokad"/"Utkast" ska märkas grått
 * och tydligt (ordertextens krav), published får en diskret, odramatisk
 * etikett. */
export function statusLabel(status: RideauEventStat['status']): string {
  switch (status) {
    case 'cancelled': return 'Avbokad'
    case 'draft': return 'Utkast'
    case 'published': return 'Publicerad'
    default: return status
  }
}

/** true för status som ska få den gråa "märkt tydligt"-behandlingen. */
export function isMarkedStatus(status: RideauEventStat['status']): boolean {
  return status === 'cancelled' || status === 'draft'
}

/** Kort felmeddelande per HTTP-status, matchat mot Fas 3-kontraktets fem
 * tillstånd. 403 hanteras SEPARAT av sidan (egen "Du saknar behörighet"-
 * vy) - denna funktion är bara till för den generella felvyn. */
export function describeRideauStatsError(status: number | undefined): string {
  if (status === 403) return 'Du saknar behörighet'
  return 'Kunde inte hämta statistik'
}
