import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Search, RefreshCw, DatabaseZap, MessageSquare } from 'lucide-react'
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
import { paymentStatus, daysOverdue, daysUntilDue, daysLeftLabel, OVERDUE_BADGE_CLASS, overdueLabel } from '../utils/payment'

// ---------------------------------------------------------------------------
// Payment helpers
// ---------------------------------------------------------------------------
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
        className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${OVERDUE_BADGE_CLASS}`}
        title={`Förföll ${p?.paymentDue ?? ''}`}
      >
        {overdueLabel(overdue)}
      </span>
    )
  }

  const map = {
    paid:    { label: 'Betald',     cls: 'bg-status-okSoft text-[#1e4025] dark:bg-[rgba(93,184,138,0.14)] dark:text-[var(--dark-positive)]' },
    unpaid:  { label: 'Ej betald',  cls: 'bg-status-criticalSoft text-[#b4234f] dark:bg-[rgba(232,98,127,0.14)] dark:text-[var(--dark-warning)]' },
    partial: { label: 'Delbetald',  cls: 'bg-status-warningSoft text-[#5f4700] dark:bg-[rgba(234,179,8,0.14)] dark:text-[var(--dark-attention)]' },
  }
  const { label, cls } = map[s]
  // Betalt belopp visas bara när det avviker från priset (priset står redan i samma cell).
  const showPaidAmount =
    s === 'paid' && p?.amountPaid != null && p.priceAgreed != null && p.amountPaid !== p.priceAgreed
  const left = daysUntilDue(booking)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${cls}`}>
        {label}
        {showPaidAmount ? ` · ${p!.amountPaid!.toLocaleString('sv-SE')} ${p!.currency ?? 'SEK'}` : ''}
        {s === 'partial' && p?.amountPaid ? ` · ${p.amountPaid.toLocaleString('sv-SE')} ${p.currency ?? 'SEK'}` : ''}
      </span>
      {left != null && (
        <span
          className={`text-xs whitespace-nowrap ${left <= 1 ? 'font-semibold text-[#b4234f] dark:text-[var(--dark-warning)]' : 'text-slate-600'}`}
          title={p?.paymentDue ? `Förfaller ${formatDueDate(p.paymentDue)}` : undefined}
        >
          {daysLeftLabel(left)}
        </span>
      )}
    </span>
  )
}

function priceDisplay(p?: BookingPayment): string {
  if (p?.priceAgreed != null)
    return `${p.priceAgreed.toLocaleString('sv-SE')} ${p.currency ?? 'SEK'}`
  return '—'
}

type PayFilter = '' | 'paid' | 'unpaid' | 'partial' | 'overdue'

/** Nyckeltal som också är filter: siffra + etikett, aktivt val markeras med teal kant. */
function FilterTile({
  label,
  count,
  active,
  onClick,
  tone = 'neutral',
  loading,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  tone?: 'neutral' | 'critical' | 'warning'
  loading?: boolean
}) {
  const numberColor =
    tone === 'critical' ? 'text-[#b4234f] dark:text-[var(--dark-warning)]' : tone === 'warning' ? 'text-[#5f4700] dark:text-[var(--dark-attention)]' : 'text-brand-dark'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`sds-focus-ring flex-1 min-w-[140px] text-left px-5 py-4 border-b-4 transition-colors ${
        active
          ? 'border-brand-forest bg-surface-page dark:bg-white/5'
          : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
      }`}
    >
      <span className={`block text-3xl font-bold tabular-nums leading-none ${numberColor}`}>
        {loading ? '–' : count.toLocaleString('sv-SE')}
      </span>
      <span className="block text-sm text-slate-600 mt-1.5">{label}</span>
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
  const [payFilter, setPayFilter] = useState<PayFilter>(() => {
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

  const hasActiveFilter = payFilter !== '' || onlyWithComment || search !== ''
  function clearFilters() {
    setPayFilter('')
    setOnlyWithComment(false)
    setSearch('')
  }

  return (
    <div className="space-y-5">
      {/* Sidhuvud */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark tracking-tight">Anmälningar</h1>
          <p className="text-sm text-slate-600 mt-1">Senaste anmälningar och betalstatus. Eleverna har tre dagar på sig att betala.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCacheRefresh}
            disabled={isManualRefreshing}
            title="Ladda om listan (snabbt, från cache)"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-dark px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-brand-dark transition-colors disabled:opacity-50 sds-focus-ring"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing && !isDirectRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isManualRefreshing && !isDirectRefreshing ? 'Uppdaterar…' : 'Uppdatera'}</span>
          </button>
          <button
            type="button"
            onClick={handleDirectRefresh}
            disabled={isDirectRefreshing}
            title="Rensar cachen och hämtar färsk data direkt från CogWork (tar längre tid)"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-dark px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-brand-dark transition-colors disabled:opacity-50 sds-focus-ring ml-2"
          >
            {isDirectRefreshing
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <DatabaseZap className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isDirectRefreshing ? 'Hämtar…' : 'Hämta från CogWork'}</span>
          </button>
        </div>
      </header>

      {isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Kunde inte hämta anmälningar'}
        </div>
      )}

      {/* Period + sök */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodFilter value={eventBlockId} onChange={setEventBlockId} />
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="search"
            aria-label="Sök deltagare eller kurs"
            placeholder="Sök deltagare eller kurs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-slate-200 bg-white rounded-full pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-forest/40"
          />
        </div>
      </div>

      {/* Nyckeltal = filter */}
      <div role="group" aria-label="Filtrera på betalning" className="card overflow-hidden flex flex-wrap divide-x divide-slate-100 dark:divide-white/5">
        <FilterTile label="Alla anmälningar" count={bookings.length} active={payFilter === '' && !onlyWithComment} onClick={() => { setPayFilter(''); setOnlyWithComment(false) }} loading={isSettling} />
        <FilterTile label="Ej betalda" count={unpaidCount} tone={unpaidCount > 0 ? 'critical' : 'neutral'} active={payFilter === 'unpaid'} onClick={() => setPayFilter(payFilter === 'unpaid' ? '' : 'unpaid')} loading={isSettling} />
        {overdueCount > 0 && (
          <FilterTile label="Förfallna" count={overdueCount} tone="critical" active={payFilter === 'overdue'} onClick={() => setPayFilter(payFilter === 'overdue' ? '' : 'overdue')} loading={isSettling} />
        )}
        {partialCount > 0 && (
          <FilterTile label="Delbetalda" count={partialCount} tone="warning" active={payFilter === 'partial'} onClick={() => setPayFilter(payFilter === 'partial' ? '' : 'partial')} loading={isSettling} />
        )}
        <FilterTile label="Betalda" count={paidCount} active={payFilter === 'paid'} onClick={() => setPayFilter(payFilter === 'paid' ? '' : 'paid')} loading={isSettling} />
        <FilterTile label="Med kommentar" count={commentCount} active={onlyWithComment} onClick={() => setOnlyWithComment((v) => !v)} loading={isSettling} />
      </div>

      {/* Lista */}
      <div className="card overflow-clip">
        <div className="px-5 py-3.5 flex items-center justify-between gap-4 border-b border-slate-100">
          <p className="text-sm text-slate-600" aria-live="polite">
            {isSettling ? 'Hämtar anmälningar…' : (
              <>
                <span className="font-semibold text-brand-dark">
                  {filtered.length < bookings.length
                    ? `${filtered.length.toLocaleString('sv-SE')} av ${bookingsTotal.toLocaleString('sv-SE')}`
                    : bookingsTotal.toLocaleString('sv-SE')}
                </span>{' '}
                anmälningar, senast anmälda först
              </>
            )}
          </p>
          {hasActiveFilter && (
            <button type="button" onClick={clearFilters} className="text-sm text-brand-forest hover:underline sds-focus-ring rounded">
              Rensa filter
            </button>
          )}
        </div>

        {isSettling ? (
          <div className="divide-y divide-slate-100">
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
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm text-slate-600">
              {hasActiveFilter ? 'Inga anmälningar matchar dina filter.' : 'Inga anmälningar i den här perioden.'}
            </p>
            {hasActiveFilter && (
              <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand-forest hover:underline sds-focus-ring rounded">
                Visa alla anmälningar
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <Th className="w-[32%]">Deltagare</Th>
                <Th className="hidden md:table-cell w-[30%]">Kurs</Th>
                <Th>Betalning</Th>
                <Th className="hidden xl:table-cell">Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((b) => {
                const comment = b.comment?.trim()
                return (
                  <tr
                    key={b.key}
                    onClick={() => b.participant?.name && setSelectedName(b.participant.name)}
                    className={`hover:bg-slate-50 dark:hover:bg-[var(--dark-green-secondary)] transition-colors align-top ${b.participant?.name ? 'cursor-pointer' : ''}`}
                  >
                    <td className="py-3 px-5 max-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {b.participant?.name ? (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); setSelectedName(b.participant!.name!) }}
                            className="text-sm font-semibold text-brand-dark hover:text-brand-forest hover:underline text-left sds-focus-ring rounded"
                          >
                            {b.participant.name}
                          </button>
                        ) : <span className="text-sm text-slate-600">—</span>}
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
                      <div className="md:hidden text-sm text-brand-dark mt-0.5 truncate" title={b.event?.name ?? undefined}>
                        {b.event?.name ?? '—'}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 whitespace-nowrap">
                        <span className="md:hidden">{bookingScheduleDisplay(b, eventById)} · </span>Anmäld {formatDate(b.created)}
                      </div>
                      {comment && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-600" title={comment}>
                          <MessageSquare className="w-3.5 h-3.5 mt-px shrink-0 text-slate-500" aria-label="Kommentar" />
                          <span className="line-clamp-2">{comment}</span>
                        </div>
                      )}
                    </td>
                    <td className="hidden md:table-cell py-3 px-3 max-w-0">
                      <span className="block truncate text-sm text-brand-dark" title={b.event?.name ?? undefined}>{b.event?.name ?? '—'}</span>
                      <span className="block truncate text-xs text-slate-600 mt-0.5" title={bookingScheduleDisplay(b, eventById)}>
                        {bookingScheduleDisplay(b, eventById)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-medium tabular-nums whitespace-nowrap text-brand-dark">{priceDisplay(b.payment)}</span>
                        <PayBadge booking={b} />
                      </div>
                    </td>
                    <td className="hidden xl:table-cell py-3 px-3 pr-5 text-sm text-slate-600 whitespace-nowrap">
                      {formatBookingStatus(b.status?.code, b.status?.name)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="contents">
        <ParticipantPanel name={selectedName} onClose={() => setSelectedName(null)} />
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`sticky top-0 z-10 bg-surface-page dark:bg-[var(--dark-card)] border-b border-slate-100 text-left text-xs font-semibold text-slate-600 py-2.5 px-3 first:px-5 whitespace-nowrap ${className}`}
    >
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
