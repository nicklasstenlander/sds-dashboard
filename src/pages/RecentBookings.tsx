import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Search, RefreshCw, DatabaseZap } from 'lucide-react'
import { useBookings } from '../hooks/useBookings'
import { useAllTermsBookings } from '../hooks/useAllTermsBookings'
import { useEvents } from '../hooks/useEvents'
import { useApiConfig } from '../context/ApiContext'
import { purgeProxyCache } from '../services/proxyService'
import { blockIdToPeriodCode, isPeriodCode, matchesPeriodCode } from '../utils/periods'
import { bookingMatchesEventBlockId, buildEventIdBlockIdMap } from '../utils/eventBlock'
import { countBookingsByParticipant, isNewStudentBooking, isPerformanceBooking, isStatisticalBooking } from '../utils/courseMetrics'
import { PeriodFilter } from '../components/PeriodFilter'
import { ParticipantPanel } from '../components/ParticipantPanel'
import { formatBookingStatus } from '../lib/status'
import type { Booking, BookingPayment, Event } from '../types/cogwork'

// ---------------------------------------------------------------------------
// Payment helpers
// ---------------------------------------------------------------------------
function paymentStatus(b: Booking): 'paid' | 'unpaid' | 'partial' | 'unknown' {
  const p = b.payment
  if (!p) return 'unknown'
  if (p.paid === true) return 'paid'
  if (p.paid === false) {
    if (p.amountPaid != null && p.priceAgreed != null && p.amountPaid > 0 && p.amountPaid < p.priceAgreed)
      return 'partial'
    return 'unpaid'
  }
  return 'unknown'
}

// Antal hela dagar sedan förfallodatumet passerat (0 = ej förfallen / ej obetald).
function daysOverdue(b: Booking): number {
  const due = b.payment?.paymentDue
  if (!due || paymentStatus(b) !== 'unpaid') return 0
  // Datum utan klockslag gäller hela förfallodagen, så de räknas som förfallna först efter dagens slut.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(due.trim())
  const dueDate = new Date(dateOnly ? `${due.trim()}T23:59:59` : due.replace(' ', 'T'))
  if (Number.isNaN(dueDate.getTime())) return 0
  const diff = Date.now() - dueDate.getTime()
  return diff > 0 ? Math.max(1, Math.floor(diff / 86_400_000)) : 0
}

function formatDueDate(due: string): string {
  try {
    return format(parseISO(due.replace(' ', 'T')), 'd MMM', { locale: sv })
  } catch {
    return due.slice(0, 10)
  }
}

function PayBadge({ booking }: { booking: Booking }) {
  const s = paymentStatus(booking)
  const p = booking.payment
  if (s === 'unknown') return <span className="text-xs text-slate-600">—</span>

  const overdue = daysOverdue(booking)
  if (overdue > 0) {
    return (
      <span
        className="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full bg-status-critical text-white"
        title={`Förföll ${p?.paymentDue ?? ''}`}
      >
        Förfallen · {overdue} {overdue === 1 ? 'dag' : 'dagar'}
      </span>
    )
  }

  const map = {
    paid:    { label: 'Betald',    cls: 'bg-status-okSoft text-brand-forest' },
    unpaid:  { label: 'Obetald',   cls: 'bg-status-criticalSoft text-status-critical' },
    partial: { label: 'Delbetald', cls: 'bg-status-warningSoft text-[#5f4700]' },
  }
  const { label, cls } = map[s]
  // Betalt belopp visas bara när det avviker från priset (priset står redan i samma cell).
  const showPaidAmount =
    s === 'paid' && p?.amountPaid != null && p.priceAgreed != null && p.amountPaid !== p.priceAgreed
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
      {label}
      {showPaidAmount ? ` · ${p!.amountPaid!.toLocaleString('sv-SE')} ${p!.currency ?? 'SEK'}` : ''}
      {s === 'partial' && p?.amountPaid ? ` · ${p.amountPaid.toLocaleString('sv-SE')} ${p.currency ?? 'SEK'}` : ''}
      {s === 'unpaid' && p?.paymentDue ? ` · förfaller ${formatDueDate(p.paymentDue)}` : ''}
    </span>
  )
}

function priceDisplay(p?: BookingPayment): string {
  if (p?.priceAgreed != null)
    return `${p.priceAgreed.toLocaleString('sv-SE')} ${p.currency ?? 'SEK'}`
  return '—'
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
        active
          ? 'bg-brand-dark text-white border-brand-dark'
          : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function RecentBookings() {
  const { config } = useApiConfig()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [eventBlockId, setEventBlockId] = useState(() => searchParams.get('period') ?? '')
  // Djuplänkar från Översikten: #/anmalningar?betalning=obetalda|forfallna|delbetalda|betalda&period=<period>
  const [payFilter, setPayFilter] = useState<'' | 'paid' | 'unpaid' | 'partial' | 'overdue'>(() => {
    const preset = searchParams.get('betalning')
    if (preset === 'obetalda') return 'unpaid'
    if (preset === 'forfallna') return 'overdue'
    if (preset === 'delbetalda') return 'partial'
    if (preset === 'betalda') return 'paid'
    return ''
  })
  const [onlyWithComment, setOnlyWithComment] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [isDirectRefreshing, setIsDirectRefreshing] = useState(false)
  const clientPeriodCode = isPeriodCode(eventBlockId) ? eventBlockId : ''

  // Period-filtrering görs alltid klientsidan, så vi hämtar alltid hela,
  // ofiltrerade bokningslistan — annars försvinner bokningar för kurser som
  // saknar grouping.eventBlock (t.ex. Danskalas) tyst ur ett server-filtrerat
  // svar. `events` (ofiltrerad) ger både dag/tid-info och den
  // grouping-kompletta eventlistan som bokningarnas egna, grouping-lösa
  // event-fält resolvas mot.
  const { data: bookingsData, isLoading, isFetching, isError, error, refetch } = useBookings({})
  const { data: events = [] } = useEvents()

  // Visa aldrig "Inga anmälningar hittades" medan en bakgrundsuppdatering ännu kan ge tomt→fyllt
  const isSettling = isLoading || (isFetching && (bookingsData?.bookings.length ?? 0) === 0)

  async function handleCacheRefresh() {
    setIsManualRefreshing(true)
    try {
      await refetch({ cancelRefetch: false })
    } finally {
      setIsManualRefreshing(false)
    }
  }

  async function handleDirectRefresh() {
    setIsDirectRefreshing(true)
    try {
      await purgeProxyCache()
      await queryClient.invalidateQueries()
    } catch (e) {
      console.error('CogWork-refresh misslyckades:', e)
    } finally {
      setIsDirectRefreshing(false)
    }
  }
  // Bokningar från VARJE känd termin (VT/HT) för "Ny elev" — samma källa som Översiktens new_students-mål
  const { bookings: allBookingsUnfiltered } = useAllTermsBookings()
  const bookingCountByParticipant = useMemo(
    () => countBookingsByParticipant(allBookingsUnfiltered.filter(isStatisticalBooking)),
    [allBookingsUnfiltered],
  )
  const eventById = useMemo(
    () => new Map(events.map((event) => [String(event.id), event])),
    [events],
  )
  const eventIdToBlockId = useMemo(() => buildEventIdBlockIdMap(events), [events])

  const allBookings = bookingsData?.bookings ?? []
  const bookings = useMemo(() => {
    if (!eventBlockId) return allBookings
    return clientPeriodCode
      ? allBookings.filter((booking) => bookingMatchesPeriod(booking, clientPeriodCode))
      : allBookings.filter((booking) => bookingMatchesEventBlockId(booking.event, eventBlockId, eventIdToBlockId, blockIdToPeriodCode(eventBlockId)))
  }, [eventBlockId, clientPeriodCode, allBookings, eventIdToBlockId])
  const bookingsTotal = eventBlockId ? bookings.length : (bookingsData?.total ?? bookings.length)

  const filtered = useMemo(
    () =>
      bookings
        .filter((b) => {
          if (payFilter === 'overdue') {
            if (daysOverdue(b) === 0) return false
          } else if (payFilter && paymentStatus(b) !== payFilter) return false
          if (onlyWithComment && !b.comment?.trim()) return false
          if (search) {
            const q = search.toLowerCase()
            const schedule = bookingScheduleDisplay(b, eventById).toLowerCase()
            return (
              b.participant?.name?.toLowerCase().includes(q) ||
              b.event?.name?.toLowerCase().includes(q) ||
              schedule.includes(q)
            )
          }
          return true
        })
        .sort((a, b) => b.created.localeCompare(a.created)),
    [bookings, eventById, payFilter, onlyWithComment, search],
  )

  const paidCount    = bookings.filter((b) => paymentStatus(b) === 'paid').length
  const unpaidCount  = bookings.filter((b) => paymentStatus(b) === 'unpaid').length
  const partialCount = bookings.filter((b) => paymentStatus(b) === 'partial').length
  const overdueCount = bookings.filter((b) => daysOverdue(b) > 0).length
  const commentCount = bookings.filter((b) => b.comment?.trim()).length

  if (!config.pw) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-pinkLight flex items-center justify-center mb-4 text-2xl">
          🔒
        </div>
        <p className="font-bold text-brand-dark text-lg">API-nyckel krävs</p>
        <p className="text-sm text-slate-500 mt-1 font-light max-w-xs">
          Anmälningsdata kräver autentisering. Lägg till din API-nyckel i inställningarna.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-dark">Anmälningar</h1>

      {isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Kunde inte hämta anmälningar'}
        </div>
      )}

      {/* Period */}
      <PeriodFilter value={eventBlockId} onChange={setEventBlockId} />

      {/* Payment filter */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-600">Betalning</p>
        <div className="flex flex-wrap gap-2">
          <Pill active={payFilter === ''} onClick={() => setPayFilter('')}>
            Alla
          </Pill>
          <Pill active={payFilter === 'paid'} onClick={() => setPayFilter('paid')}>
            Betalda {!isSettling && `(${paidCount})`}
          </Pill>
          <Pill active={payFilter === 'unpaid'} onClick={() => setPayFilter('unpaid')}>
            Obetalda {!isSettling && `(${unpaidCount})`}
          </Pill>
          {partialCount > 0 && (
            <Pill active={payFilter === 'partial'} onClick={() => setPayFilter('partial')}>
              Delbetalda ({partialCount})
            </Pill>
          )}
          {overdueCount > 0 && (
            <Pill active={payFilter === 'overdue'} onClick={() => setPayFilter('overdue')}>
              Förfallna ({overdueCount})
            </Pill>
          )}
          <span className="w-px bg-slate-200 mx-1" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={onlyWithComment}
            onClick={() => setOnlyWithComment((v) => !v)}
            className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
              onlyWithComment
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
            }`}
          >
            Har kommentar {!isSettling && `(${commentCount})`}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Sök deltagare eller kurs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-full pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-mint"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-bold text-brand-dark">
              {isSettling ? 'Hämtar…' : (
                filtered.length < bookings.length
                  ? `${filtered.length.toLocaleString('sv-SE')} av ${bookingsTotal.toLocaleString('sv-SE')} anmälningar`
                  : `${bookingsTotal.toLocaleString('sv-SE')} anmälningar`
              )}
            </h2>
          {!isSettling && bookings.length > 0 && (
            <div className="flex gap-4 text-xs text-slate-500">
              <span>
                <span className="font-semibold text-brand-forest">{paidCount}</span> betalda
              </span>
              <span>
                <span className="font-semibold text-status-critical">{unpaidCount}</span> obetalda
              </span>
              {partialCount > 0 && (
                <span>
                  <span className="font-semibold text-amber-700">{partialCount}</span> delbetalda
                </span>
              )}
              {overdueCount > 0 && (
                <span>
                  <span className="font-semibold text-status-critical">{overdueCount}</span> förfallna
                </span>
              )}
            </div>
          )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCacheRefresh}
              disabled={isManualRefreshing}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-dark px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing && !isDirectRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isManualRefreshing && !isDirectRefreshing ? 'Uppdaterar…' : 'Uppdatera'}</span>
            </button>
            <button
              onClick={handleDirectRefresh}
              disabled={isDirectRefreshing}
              title="Rensa proxy-cache och hämta färsk data från CogWork (långsammare)"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-forest px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isDirectRefreshing
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <DatabaseZap className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isDirectRefreshing ? 'Hämtar…' : 'Från CogWork'}</span>
            </button>
          </div>
        </div>

        {isSettling ? (
          <div className="divide-y divide-slate-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-36 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 flex-1 bg-slate-100 rounded animate-pulse" />
                <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-slate-600 font-light">Inga anmälningar hittades</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60 border-b border-slate-100">
                <tr>
                  <Th>Deltagare / anmäld</Th>
                  <Th>Kurs / tid</Th>
                  <Th>Pris / betalning</Th>
                  <Th>Status</Th>
                  <Th>Kommentar</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((b) => (
                  <tr key={b.key} className="hover:bg-slate-50/60 dark:hover:bg-[var(--dark-green-secondary)] transition-colors align-top">
                    <td className="py-2.5 px-3 text-sm font-medium max-w-[260px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {b.participant?.name ? (
                          <button
                            onClick={() => setSelectedName(b.participant!.name!)}
                            className="text-brand-dark hover:text-brand-forest hover:underline text-left"
                          >
                            {b.participant.name}
                          </button>
                        ) : '—'}
                        {isPerformanceBooking(b) ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
                            Biljettköp
                          </span>
                        ) : isNewStudentBooking(b, bookingCountByParticipant) && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: '#CDDCD1', color: '#1e4025' }}>
                            Ny elev
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-normal text-slate-500 mt-0.5 whitespace-nowrap">
                        Anmäld {formatDate(b.created)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-slate-700 max-w-[260px]">
                      <span className="line-clamp-1" title={b.event?.name ?? undefined}>{b.event?.name ?? '—'}</span>
                      <span className="block text-xs text-slate-500 mt-0.5 line-clamp-1" title={bookingScheduleDisplay(b, eventById)}>
                        {bookingScheduleDisplay(b, eventById)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-slate-600">
                      <div className="flex flex-col items-start gap-1">
                        <span className="tabular-nums whitespace-nowrap">{priceDisplay(b.payment)}</span>
                        <PayBadge booking={b} />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-slate-500 whitespace-nowrap">
                      {formatBookingStatus(b.status?.code, b.status?.name)}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-slate-600 max-w-[220px]">
                      {b.comment
                        ? <span className="line-clamp-2" title={b.comment}>{b.comment}</span>
                        : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="contents">
        <ParticipantPanel name={selectedName} onClose={() => setSelectedName(null)} />
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-xs font-semibold text-slate-600 py-3 px-3 whitespace-nowrap">
      {children}
    </th>
  )
}

function formatDate(dt: string): string {
  try {
    return format(parseISO(dt.replace(' ', 'T')), 'd MMM yyyy', { locale: sv })
  } catch {
    return dt
  }
}

function bookingScheduleDisplay(booking: Booking, eventById: Map<string, Event>): string {
  const event = booking.event?.id ? eventById.get(String(booking.event.id)) : undefined
  const schedule = event?.schedule

  if (schedule?.dayAndTimeInfo) return schedule.dayAndTimeInfo

  const startDate = booking.event?.startDate ?? booking.event?.startDateTime?.slice(0, 10) ?? schedule?.start?.date
  const startTime = booking.event?.startTime ?? booking.event?.startDateTime?.slice(11, 16) ?? schedule?.start?.time

  if (startDate && startTime) return formatScheduleDateTime(startDate, startTime)
  if (startDate) return formatScheduleDate(startDate)
  if (startTime) return startTime
  return '—'
}

function formatScheduleDateTime(date: string, time: string): string {
  try {
    return `${format(parseISO(date), 'EEEE', { locale: sv })} ${time}`
  } catch {
    return `${date} ${time}`
  }
}

function formatScheduleDate(date: string): string {
  try {
    return format(parseISO(date), 'EEEE d MMM', { locale: sv })
  } catch {
    return date
  }
}

function bookingMatchesPeriod(booking: Booking, periodCode: string): boolean {
  return matchesPeriodCode(periodCode, [
    booking.event?.code,
    booking.event?.startDate,
    booking.event?.startDateTime,
    booking.event?.grouping?.eventBlock?.name,
  ])
}
