import React, { useCallback, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Search, Moon, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PeriodFilter } from '../components/PeriodFilter'
import { BookingsChart } from '../components/BookingsChart'
import { CategoryChart } from '../components/CategoryChart'
import { EventsTable, type CourseFilter } from '../components/EventsTable'
import { CourseDetailPanel } from '../components/CourseDetailPanel'
import { BookingListPanel } from '../components/BookingListPanel'
import { AlertsPanel } from '../components/AlertsPanel'
import { GroupSmsModal } from '../components/GroupSmsModal'
import { GoalCard } from '../components/GoalCard'
import { GoalModal } from '../components/GoalModal'
import { useEventBlocks } from '../hooks/useEvents'
import { useAllData } from '../hooks/useAllData'
import { useAllTermsBookings } from '../hooks/useAllTermsBookings'
import { useAlerts } from '../hooks/useAlerts'
import { useGoals, computeCurrentValue } from '../hooks/useGoals'
import { purgeProxyCache } from '../services/proxyService'
import { blockIdToPeriodCode, blockNameToCode, dateToPeriodCode, isPeriodCode, matchesPeriodCode } from '../utils/periods'
import { bookingMatchesEventBlockId, buildEventIdBlockIdMap, collectKnownEventBlockIds, resolveEventBlockId } from '../utils/eventBlock'
import { bookingTicketQuantity, buildCourseChangeInfoByParticipant, buildCourseMetrics, countActiveStudents, countBookingsByParticipant, isAcceptedBooking, isStatisticalBooking, isStatisticalEvent, metricsForEvent } from '../utils/courseMetrics'
import { getDefaultEventBlockId } from '../config/cogwork'
import type { Booking, Event } from '../types/cogwork'

interface DashboardProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export function Dashboard({ darkMode, onToggleDarkMode }: DashboardProps) {
  const { usingLegacyAuth, profile } = useAuth()
  const canSeeFinancials = usingLegacyAuth || profile?.role !== 'teacher'
  const firstName = profile?.full_name?.split(' ')[0] || null
  const greetingName = !usingLegacyAuth && firstName ? firstName : 'Sollentuna'

  const [eventBlockId, setEventBlockId] = useState(() => getDefaultEventBlockId())
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  // Vald kurs ligger i adressen (#/?kurs=<id>) så att den går att länka till och Tillbaka fungerar.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedEventId = searchParams.get('kurs')
  const [visibleEventIds, setVisibleEventIds] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<'total' | 'antagna' | 'ejBetalda' | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [courseFilter, setCourseFilter] = useState<CourseFilter>('all')
  const [groupSms, setGroupSms] = useState<{ courseName: string; bookings: Booking[] } | null>(null)
  const [goalModal, setGoalModal] = useState<{ open: boolean; goal?: import('../services/goalsService').Goal }>({ open: false })
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [isDirectRefreshing, setIsDirectRefreshing] = useState(false)
  // Period-filtrering görs alltid klientsidan (se resolveEventBlockId) — vi
  // hämtar därför alltid hela, ofiltrerade datasetet från proxyn. Kurser som
  // saknar grouping.eventBlock (t.ex. Danskalas) matchas annars fel om
  // filtreringen görs server-side på eventBlock.id, som de saknar helt.
  const clientPeriodCode = isPeriodCode(eventBlockId) ? eventBlockId : ''

  const queryClient   = useQueryClient()
  const allDataQuery  = useAllData('')
  const eventBlocks   = useEventBlocks()
  const isRefreshing  = isManualRefreshing || isDirectRefreshing

  const rawEvents = allDataQuery.data?.events.events ?? []
  const rawBookings = allDataQuery.data?.bookings.bookings ?? []
  const goalEvents = rawEvents
  // Bokningar från VARJE känd termin (VT/HT) — behövs för new_students-målet,
  // som annars bara ser den aktuella periodens historik (se useAllTermsBookings).
  const { bookings: goalBookings, isLoading: goalBookingsLoading } = useAllTermsBookings()
  const goalsLoading = goalBookingsLoading && goalBookings.length === 0
  const statisticalGoalBookings = useMemo(
    () => goalBookings.filter(isStatisticalBooking),
    [goalBookings],
  )
  const bookingCountByParticipant = useMemo(
    () => countBookingsByParticipant(statisticalGoalBookings),
    [statisticalGoalBookings],
  )
  const knownEventBlockIds = useMemo(() => collectKnownEventBlockIds(rawEvents), [rawEvents])
  // CogWork's /bookings response embeds a stripped-down event on each booking
  // that never carries grouping — so a booking can't resolve its own termin.
  // Look its event id up in a map built from the full (grouping-complete)
  // events list instead.
  const eventIdToBlockId = useMemo(() => buildEventIdBlockIdMap(rawEvents), [rawEvents])
  const allEvents = useMemo(() => {
    if (!eventBlockId) return rawEvents
    if (clientPeriodCode) return buildEventsFromPeriod(rawEvents, rawBookings, clientPeriodCode)
    return rawEvents.filter((e) => resolveEventBlockId(e, knownEventBlockIds) === eventBlockId)
  }, [eventBlockId, clientPeriodCode, rawEvents, rawBookings, knownEventBlockIds])

  // Unique sorted categories from the already-loaded events
  const categories = useMemo(() => {
    const seen = new Map<number, string>()
    allEvents.forEach((e) => {
      const g = e.grouping?.primaryEventGroup
      if (g?.id && g.name && !seen.has(g.id)) seen.set(g.id, g.name)
    })
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  }, [allEvents])

  const events = useMemo(() => {
    if (!categoryFilter) return allEvents
    return allEvents.filter((e) => e.grouping?.primaryEventGroup?.name === categoryFilter)
  }, [allEvents, categoryFilter])

  // Slå upp mot det som visas i tabellen (inkl. kurser som bara finns i bokningsdata), sedan mot rådata.
  const findEventById = (id: string | undefined) =>
    id ? allEvents.find((e) => String(e.id) === id) ?? rawEvents.find((e) => String(e.id) === id) : undefined
  const selectedEvent: Event | null = findEventById(selectedEventId ?? undefined) ?? null
  const selectEvent = useCallback((event: Event | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (event) next.set('kurs', String(event.id))
      else next.delete('kurs')
      return next
    }, { replace: Boolean(selectedEventId) })
  }, [setSearchParams, selectedEventId])
  const selectedIndex = selectedEventId ? visibleEventIds.indexOf(selectedEventId) : -1
  const stepEvent = (delta: number) => {
    const id = visibleEventIds[selectedIndex + delta]
    const next = findEventById(id)
    if (next) selectEvent(next)
  }
  const selectedEventPeriodCode = selectedEvent ? eventPeriodCode(selectedEvent) : ''
  const courseChangeByParticipant = useMemo(
    () => buildCourseChangeInfoByParticipant(statisticalGoalBookings, selectedEventPeriodCode),
    [statisticalGoalBookings, selectedEventPeriodCode],
  )

  const bookings = useMemo(() => {
    let result = rawBookings
    if (eventBlockId) {
      result = clientPeriodCode
        ? rawBookings.filter(b => bookingMatchesPeriod(b, clientPeriodCode))
        : rawBookings.filter(b => bookingMatchesEventBlockId(b.event, eventBlockId, eventIdToBlockId, blockIdToPeriodCode(eventBlockId)))
    }
    if (categoryFilter) {
      const eventIds = new Set(events.map(e => String(e.id)))
      result = result.filter(b => b.event?.id != null && eventIds.has(String(b.event.id)))
    }
    return result
  }, [eventBlockId, clientPeriodCode, rawBookings, categoryFilter, events, eventIdToBlockId])

  const statisticalEvents = useMemo(
    () => events.filter(isStatisticalEvent),
    [events],
  )
  const statisticalBookings = useMemo(
    () => bookings.filter(isStatisticalBooking),
    [bookings],
  )

  const kpi           = computeKPIs(statisticalEvents, statisticalBookings)
  const bookingKpi    = computeBookingKPIs(statisticalBookings)
  const bookingsTotal = bookingKpi.total
  const revenueKpi    = computeRevenueKPIs(statisticalBookings)
  const activeStudents = useMemo(
    () => countActiveStudents(statisticalBookings),
    [statisticalBookings],
  )
  const { data: goals = [] } = useGoals()
  // Pågående mål först, uppnådda sist – det som kräver uppmärksamhet ska synas överst.
  const goalsWithValue = useMemo(() => {
    const list = goals.map((goal) => ({
      goal,
      currentValue: computeCurrentValue(goal, statisticalGoalBookings, goalEvents.filter(isStatisticalEvent)),
    }))
    const done = (g: { goal: { target: number }; currentValue: number }) => g.goal.target > 0 && g.currentValue >= g.goal.target
    return [...list.filter((g) => !done(g)), ...list.filter(done)]
  }, [goals, statisticalGoalBookings, goalEvents])
  const { alerts, duplicateCount, pendingCount } = useAlerts(statisticalBookings)
  // Antal kurser som är fulla eller nästan fulla (>= 90 %), samma underlag som kurstabellens filter.
  const over90Count = useMemo(() => {
    const metrics = buildCourseMetrics(bookings)
    return events.filter((e) => {
      const max = e.requirements?.maxParticipants
      return !!max && metricsForEvent(metrics, e, false).accepted / max >= 0.9
    }).length
  }, [events, bookings])

  async function handleCacheRefresh() {
    setIsManualRefreshing(true)
    try {
      await allDataQuery.refetch({ cancelRefetch: false })
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

  const today = new Date().toISOString().slice(0, 10)
  const newToday = useMemo(
    () => statisticalBookings
      .filter((b) => b.created?.startsWith(today))
      .reduce((sum, b) => sum + bookingTicketQuantity(b), 0),
    [statisticalBookings, today],
  )

  // Period label for greeting header (e.g. "HT26")
  const periodLabel = useMemo(() => {
    if (clientPeriodCode) return clientPeriodCode
    if (!eventBlockId) return ''
    const block = eventBlocks.data?.find(b => String(b.id) === eventBlockId)
    if (!block) return ''
    return blockNameToCode(block.name)
  }, [clientPeriodCode, eventBlockId, eventBlocks.data])

  const panelTitles = { total: 'Alla anmälda', antagna: 'Antagna', ejBetalda: 'Ej betalda' }

  const filteredForPanel = useMemo(() => {
    if (!activeFilter) return []
    if (activeFilter === 'total') return statisticalBookings
    if (activeFilter === 'antagna') return statisticalBookings.filter(b => b.status?.code?.toUpperCase() === 'ACCEPTED')
    if (activeFilter === 'ejBetalda') return statisticalBookings.filter(b => b.payment?.paid === false)
    return []
  }, [activeFilter, statisticalBookings])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <DashboardGreeting
          newToday={newToday}
          ejBetalda={bookingKpi.ejBetalda}
          avgFill={kpi.avgFill}
          periodLabel={periodLabel}
          greetingName={greetingName}
        />
        <div className="shrink-0 flex items-center gap-2 mt-1">
          <button
            onClick={onToggleDarkMode}
            title={darkMode ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-[var(--dark-text-secondary)] hover:text-brand-dark dark:hover:text-[var(--dark-text-primary)] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:border-brand-dark dark:hover:border-white/20 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{darkMode ? 'Ljust läge' : 'Mörkt läge'}</span>
          </button>
          <button
            onClick={() => setGoalModal({ open: true })}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-[var(--dark-text-secondary)] hover:text-brand-dark dark:hover:text-[var(--dark-text-primary)] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:border-brand-dark dark:hover:border-white/20 transition-colors"
          >
            <span className="text-base leading-none">＋</span> Nytt mål
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <PeriodFilter value={eventBlockId} onChange={setEventBlockId} />

        <div className="flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-slate-200 dark:border-white/10 rounded-full px-4 py-2 bg-white dark:bg-[var(--dark-card)] text-slate-700 dark:text-[var(--dark-text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-accent/40 dark:focus:ring-[var(--dark-positive)] dark:focus:border-[var(--dark-positive)] min-w-[180px]"
          >
            <option value="">Alla kategorier</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Sök kurs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-white/10 rounded-full pl-9 pr-4 py-2 bg-white dark:bg-[var(--dark-card)] text-slate-700 dark:text-[var(--dark-text-primary)] placeholder:text-slate-500 dark:placeholder:text-[var(--dark-text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-accent/40 dark:focus:ring-[var(--dark-positive)] dark:focus:border-[var(--dark-positive)]"
            />
          </div>
        </div>
      </div>

      {allDataQuery.isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
          Kunde inte hämta data:{' '}
          {allDataQuery.error instanceof Error ? allDataQuery.error.message : 'Okänt fel'}
        </div>
      )}

      {/* Att följa upp: det som kräver handling idag */}
      <section aria-labelledby="h-todo">
        <h2 id="h-todo" className={SECTION_LABEL}>Att följa upp</h2>
        <div className="card overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 lg:divide-x divide-slate-100 dark:divide-white/5">
          <AttentionTile
            count={bookingKpi.ejBetalda}
            label="Ej betalda"
            hint={bookingKpi.ejBetalda > 0 ? 'Kortbetalning inte slutförd. Tre dagar att betala.' : 'Alla har betalat.'}
            action="Visa bokningarna"
            tone={bookingKpi.ejBetalda > 0 ? 'critical' : 'calm'}
            onClick={() => setActiveFilter('ejBetalda')}
          />
          <AttentionTile
            count={alerts.length}
            label="Att granska"
            hint={pendingCount > 0 && duplicateCount > 0
              ? `${duplicateCount} dubbelanmälda och ${pendingCount} som behöver manuell kontroll.`
              : pendingCount > 0 ? `${pendingCount} behöver manuell kontroll.`
              : duplicateCount > 0 ? `${duplicateCount} dubbelanmälda.`
              : 'Inget behöver granskas.'}
            action="Granska"
            tone={alerts.length > 0 ? 'warning' : 'calm'}
            onClick={() => setAlertsOpen(true)}
          />
          <AttentionTile
            count={over90Count}
            label="Kurser över 90 %"
            hint={over90Count > 0 ? 'Fulla eller överfulla. Kolla om det behövs kö eller en extra grupp.' : 'Inga kurser är nästan fulla.'}
            action="Visa kurserna"
            tone={over90Count > 0 ? 'warning' : 'calm'}
            onClick={() => {
              setCourseFilter('over90')
              document.getElementById('kurslista')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          />
          <AttentionTile
            count={newToday}
            label="Ny anmälan idag"
            hint={`Totalt ${bookingsTotal.toLocaleString('sv-SE')} anmälda ${periodLabel ? `i ${periodLabel}` : 'under perioden'}.`}
            action="Se alla anmälda"
            tone="info"
            onClick={() => setActiveFilter('total')}
          />
        </div>
      </section>

      {/* Terminen i siffror */}
      <section aria-labelledby="h-kpi">
        <h2 id="h-kpi" className={SECTION_LABEL}>Terminen i siffror</h2>
        <div className="card overflow-hidden flex flex-wrap">
          <StatCell
            label="Antagna"
            value={bookingKpi.antagna.toLocaleString('sv-SE')}
            sub={bookingKpi.total > 0 ? `${Math.round((bookingKpi.antagna / bookingKpi.total) * 100)}% av anmälda` : undefined}
            onClick={() => setActiveFilter('antagna')}
          />
          <StatCell
            label="Anmälda"
            value={bookingsTotal > 0 ? bookingsTotal.toLocaleString('sv-SE') : kpi.totalAccepted.toLocaleString('sv-SE')}
            sub={`${events.length} kurser`}
            onClick={() => setActiveFilter('total')}
          />
          <StatCell label="Elever" value={activeStudents.toLocaleString('sv-SE')} sub="unika med aktiv antagning" />
          <StatCell label="Medelbeläggning" value={`${kpi.avgFill}%`} sub="av tillgängliga platser" />
          {canSeeFinancials && (
            <div className="flex-[2_1_320px] p-5 bg-slate-900 text-white">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-white/70">Betalning</p>
                {revenueKpi.aviserat > revenueKpi.mottaget && (
                  <p className="text-xs text-white/70">{(revenueKpi.aviserat - revenueKpi.mottaget).toLocaleString('sv-SE')} kr återstår</p>
                )}
              </div>
              <p className="mt-1 text-4xl font-bold tabular-nums leading-none">
                {revenueKpi.mottaget > 0 ? revenueKpi.mottaget.toLocaleString('sv-SE') : '—'}
                {revenueKpi.mottaget > 0 && <span className="ml-2 text-base font-normal text-white/70">kr mottaget</span>}
              </p>
              {revenueKpi.aviserat > 0 && (
                <>
                  <div
                    className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden"
                    role="img"
                    aria-label={`${Math.min(100, Math.round((revenueKpi.mottaget / revenueKpi.aviserat) * 100))} procent av aviserat belopp är mottaget`}
                  >
                    <div className="h-full rounded-full bg-[#dd5c86]" style={{ width: `${Math.min(100, (revenueKpi.mottaget / revenueKpi.aviserat) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-white/70">
                    {Math.round((revenueKpi.mottaget / revenueKpi.aviserat) * 100)}% av {revenueKpi.aviserat.toLocaleString('sv-SE')} kr aviserat
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Mål */}
      {goals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-3">Mål</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goalsWithValue.map(({ goal, currentValue }) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                currentValue={currentValue}
                loading={goalsLoading}
                onClick={() => setGoalModal({ open: true, goal })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookingsChart bookings={statisticalBookings} loading={allDataQuery.isLoading} />
        <CategoryChart events={statisticalEvents} bookings={statisticalBookings} loading={allDataQuery.isLoading} />
      </div>

      <EventsTable
        events={events}
        bookings={bookings}
        loading={allDataQuery.isLoading}
        search={search}
        activePeriod={eventBlockId}
        onSelect={selectEvent}
        selectedId={selectedEventId}
        onVisibleOrderChange={setVisibleEventIds}
        filter={courseFilter}
        onFilterChange={setCourseFilter}
        onRefresh={handleCacheRefresh}
        onDirectRefresh={handleDirectRefresh}
        onGroupSms={(event, courseBookings) => setGroupSms({ courseName: event.name, bookings: courseBookings })}
        isRefreshing={isRefreshing}
        isDirectRefreshing={isDirectRefreshing}
      />

      {/* Paneler/modaler: i en display:contents-wrapper så att space-y-6 inte ger dem margin-top (förskjuter fixed-element ~24px) */}
      <div className="contents">
        {/* Course detail slide-in */}
        <CourseDetailPanel
          event={selectedEvent}
          bookingCountByParticipant={bookingCountByParticipant}
          courseChangeByParticipant={courseChangeByParticipant}
          onClose={() => selectEvent(null)}
          position={selectedIndex >= 0 ? { index: selectedIndex, total: visibleEventIds.length } : undefined}
          onPrev={selectedIndex > 0 ? () => stepEvent(-1) : undefined}
          onNext={selectedIndex >= 0 && selectedIndex < visibleEventIds.length - 1 ? () => stepEvent(1) : undefined}
        />

        {/* Booking list slide-in for KPI cards */}
        <BookingListPanel
          title={activeFilter ? panelTitles[activeFilter] : ''}
          bookings={filteredForPanel}
          onClose={() => setActiveFilter(null)}
          footerLink={activeFilter === 'ejBetalda'
            ? {
                to: `/anmalningar?betalning=obetalda${eventBlockId ? `&period=${encodeURIComponent(eventBlockId)}` : ''}`,
                label: 'Visa i Anmälningar',
              }
            : undefined}
        />

        <GroupSmsModal
          isOpen={Boolean(groupSms)}
          onClose={() => setGroupSms(null)}
          courseName={groupSms?.courseName ?? ''}
          bookings={groupSms?.bookings ?? []}
        />

        {/* Alerts slide-in for "Väntar återkoppling" */}
        <AlertsPanel
          open={alertsOpen}
          alerts={alerts}
          onClose={() => setAlertsOpen(false)}
        />

        <GoalModal
          isOpen={goalModal.open}
          onClose={() => setGoalModal({ open: false })}
          goal={goalModal.goal}
        />
      </div>
    </div>
  )
}

function DashboardGreeting({
  newToday,
  ejBetalda,
  avgFill,
  periodLabel,
  greetingName,
}: {
  newToday: number
  ejBetalda: number
  avgFill: number
  periodLabel: string
  greetingName: string
}) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'God morgon' : hour < 17 ? 'God dag' : 'God kväll'
  const dayName = format(now, 'EEEE', { locale: sv }).toUpperCase()
  const dateStr = format(now, 'd MMMM', { locale: sv }).toUpperCase()

  const statNodes: React.ReactNode[] = []
  if (newToday > 0) statNodes.push(<><strong>{newToday}</strong> {newToday === 1 ? "ny anmälan" : "nya anmälningar"} idag</>)
  if (ejBetalda > 0) statNodes.push(<><strong>{ejBetalda}</strong> betalningar väntar</>)
  if (avgFill > 0) statNodes.push(<>Terminen ligger på <strong>{avgFill}%</strong> beläggning</>)

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 dark:text-[var(--dark-text-secondary)] tracking-widest uppercase mb-2">
        {dayName} {dateStr}{periodLabel ? ` · ${periodLabel}` : ''}
      </p>
      <h1
        className="text-brand-dark dark:text-slate-100"
        style={{ fontSize: 'clamp(32px, 3.2vw, 48px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
      >
        <span style={{ fontWeight: 300 }}>{greeting},</span>
        <br className="lg:hidden" />
        <span className="hidden lg:inline">{' '}</span>
        <span style={{ fontWeight: 400 }}>{greetingName}.</span>
      </h1>
      {statNodes.length > 0 && (
        <p className="text-sm text-slate-500 mt-3">
          {statNodes.map((node, i) => (
            <React.Fragment key={i}>{i > 0 ? '. ' : ''}{node}</React.Fragment>
          ))}.
        </p>
      )}
    </div>
  )
}

const SECTION_LABEL = 'mb-3 text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest'

const ATTENTION_TONES = {
  critical: { bar: 'border-l-[#b4234f]', number: 'text-[#b4234f] dark:text-[var(--dark-warning)]' },
  warning:  { bar: 'border-l-[#E0A23B]', number: 'text-[#5f4700] dark:text-[var(--dark-attention)]' },
  info:     { bar: 'border-l-transparent', number: 'text-brand-dark dark:text-[var(--dark-text-primary)]' },
  calm:     { bar: 'border-l-transparent', number: 'text-slate-600' },
} as const

/** En sak som kräver handling: stor siffra, kort förklaring och en tydlig åtgärd. */
function AttentionTile({
  count, label, hint, action, tone, onClick,
}: {
  count: number
  label: string
  hint: string
  action: string
  tone: keyof typeof ATTENTION_TONES
  onClick: () => void
}) {
  const t = ATTENTION_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sds-focus-ring text-left p-5 border-l-4 ${t.bar} hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex flex-col gap-1.5`}
    >
      <span className="flex items-baseline gap-2.5">
        <span className={`text-4xl font-bold tabular-nums leading-none ${t.number}`}>{count.toLocaleString('sv-SE')}</span>
        <span className="text-base font-medium text-brand-dark">{label}</span>
      </span>
      <span className="text-sm text-slate-600">{hint}</span>
      <span className="text-sm font-medium text-brand-dark dark:text-[var(--dark-accent)] mt-1">{action} →</span>
    </button>
  )
}

/** Ett nyckeltal i bandet. Klickbart (knapp) när siffran har en detaljvy. */
function StatCell({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="block text-sm text-slate-600">{label}</span>
      <span className="block mt-1 text-4xl font-bold tabular-nums leading-tight text-brand-dark">{value}</span>
      {sub && <span className="block mt-1 text-sm text-slate-600">{sub}</span>}
    </>
  )
  const cls = 'flex-[1_1_150px] p-5 border-r border-slate-100 dark:border-white/5 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}. Visa detaljer`} className={`${cls} sds-focus-ring hover:bg-slate-50 dark:hover:bg-white/5 transition-colors`}>{inner}</button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

function computeKPIs(events: Event[], bookings: Booking[]) {
  const metricsByEvent = buildCourseMetrics(bookings)
  let totalAccepted = 0
  let totalMax = 0
  let estimatedRevenue = 0
  for (const e of events) {
    const metrics = metricsForEvent(metricsByEvent, e, false)
    const max      = e.requirements?.maxParticipants ?? 0
    totalAccepted   += metrics.accepted
    if (max > 0) totalMax += max
    estimatedRevenue += metrics.revenue
  }
  const avgFill = totalMax > 0 ? Math.round((totalAccepted / totalMax) * 100) : 0
  return { totalAccepted, avgFill, estimatedRevenue }
}

function computeBookingKPIs(bookings: import('../types/cogwork').Booking[]) {
  let antagna = 0
  let ejBetalda = 0
  let vantarAterkoppling = 0
  for (const b of bookings) {
    const code = b.status?.code?.toUpperCase() ?? ''
    const quantity = bookingTicketQuantity(b)
    if (isAcceptedBooking(b)) antagna += quantity
    if (b.payment?.paid === false) ejBetalda++
    if (code === 'AWAITING_RESPONSE' || code === 'WAITING') vantarAterkoppling++
  }
  return {
    total: bookings.reduce((sum, b) => sum + bookingTicketQuantity(b), 0),
    antagna,
    ejBetalda,
    vantarAterkoppling,
  }
}

function computeRevenueKPIs(bookings: import('../types/cogwork').Booking[]) {
  let mottaget = 0
  let aviserat = 0
  for (const b of bookings) {
    if (b.payment?.paid === true && b.payment.amountPaid)
      mottaget += b.payment.amountPaid
    if (b.payment?.priceAgreed && isAcceptedBooking(b))
      aviserat += b.payment.priceAgreed
  }
  return { mottaget, aviserat }
}

function eventMatchesPeriod(event: Event, periodCode: string): boolean {
  return matchesPeriodCode(periodCode, [
    event.code,
    event.schedule?.start?.date,
    event.schedule?.start?.date && `${event.schedule.start.date} ${event.schedule.start.time ?? ''}`,
    event.grouping?.eventBlock?.name,
  ])
}

function eventPeriodCode(event: Event): string {
  const blockName = event.grouping?.eventBlock?.name
  if (blockName) {
    const code = blockNameToCode(blockName)
    if (isPeriodCode(code)) return code
  }

  if (isPeriodCode(event.code)) return event.code
  return dateToPeriodCode(event.schedule?.start?.date)
}

function bookingMatchesPeriod(booking: Booking, periodCode: string): boolean {
  return matchesPeriodCode(periodCode, [
    booking.event?.code,
    booking.event?.startDate,
    booking.event?.startDateTime,
    booking.event?.grouping?.eventBlock?.name,
  ])
}

function buildEventsFromPeriod(events: Event[], bookings: Booking[], periodCode: string): Event[] {
  const fromEvents = events.filter((event) => eventMatchesPeriod(event, periodCode))
  const byId = new Map<string, Event>(fromEvents.map((event) => [String(event.id), event]))

  for (const booking of bookings) {
    if (!bookingMatchesPeriod(booking, periodCode)) continue
    const bookingEvent = booking.event
    if (!bookingEvent?.id || byId.has(String(bookingEvent.id))) continue

    const eventBookings = bookings.filter((b) => String(b.event?.id) === String(bookingEvent.id))
    const accepted = eventBookings
      .filter(isAcceptedBooking)
      .reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0)
    byId.set(String(bookingEvent.id), {
      id: bookingEvent.id,
      key: bookingEvent.key,
      name: bookingEvent.name,
      created: '',
      code: bookingEvent.code ?? periodCode,
      category: bookingEvent.category ?? { id: 0, name: '' },
      place: '',
      pricing: {
        currency: bookingEvent.pricing?.currency ?? 'SEK',
        basePriceInclVat: bookingEvent.pricing?.basePriceInclVat ?? 0,
      },
      registration: {
        status: '',
        statusName: '',
        statusText: '',
        showing: true,
        open: false,
      },
      schedule: {
        dayAndTimeInfo: bookingEvent.startDateTime ?? bookingEvent.startDate ?? '',
        start: {
          date: bookingEvent.startDate ?? bookingEvent.startDateTime?.slice(0, 10) ?? '',
          time: bookingEvent.startTime ?? bookingEvent.startDateTime?.slice(11, 16) ?? '',
          dayOfWeek: '',
        },
        end: { date: '', time: '', dayOfWeek: '' },
        numberOfPlannedOccasions: 0,
        numberOfScheduledOccasions: 0,
      },
      statistics: { accepted: accepted || eventBookings.length },
      grouping: {
        eventBlock: bookingEvent.grouping?.eventBlock ?? { key: periodCode, id: 0, name: periodCode },
        primaryEventGroup: bookingEvent.category
          ? { key: String(bookingEvent.category.id), id: bookingEvent.category.id, name: bookingEvent.category.name }
          : undefined,
      },
      requirements: {
        minAge: 0,
        maxAge: 0,
        maxParticipants: 0,
      },
      instructorsName: '',
    })
  }

  return Array.from(byId.values())
}
