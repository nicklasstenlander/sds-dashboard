import React, { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Users, UserCheck, CreditCard, Clock, BookOpen, TrendingUp, Banknote, Search } from 'lucide-react'
import { KPICard } from '../components/KPICard'
import { PeriodFilter } from '../components/PeriodFilter'
import { BookingsChart } from '../components/BookingsChart'
import { CategoryChart } from '../components/CategoryChart'
import { EventsTable } from '../components/EventsTable'
import { CourseDetailPanel } from '../components/CourseDetailPanel'
import { BookingListPanel } from '../components/BookingListPanel'
import { AlertsPanel } from '../components/AlertsPanel'
import { useEventBlocks } from '../hooks/useEvents'
import { useAllData } from '../hooks/useAllData'
import { useAlerts } from '../hooks/useAlerts'
import { purgeProxyCache } from '../services/proxyService'
import { blockNameToCode, isPeriodCode, matchesPeriodCode } from '../utils/periods'
import { getDefaultEventBlockId } from '../config/cogwork'
import type { Booking, Event } from '../types/cogwork'

export function Dashboard() {
  const [eventBlockId, setEventBlockId] = useState(() => getDefaultEventBlockId())
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [activeFilter, setActiveFilter] = useState<'total' | 'antagna' | 'ejBetalda' | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [isDirectRefreshing, setIsDirectRefreshing] = useState(false)
  const clientPeriodCode = isPeriodCode(eventBlockId) ? eventBlockId : ''
  const queryEventBlockId = clientPeriodCode ? '' : eventBlockId

  const queryClient   = useQueryClient()
  const allDataQuery  = useAllData(queryEventBlockId)
  const eventBlocks   = useEventBlocks()
  const isRefreshing  = isManualRefreshing || isDirectRefreshing

  const rawEvents = allDataQuery.data?.events.events ?? []
  const rawBookings = allDataQuery.data?.bookings.bookings ?? []
  const allEvents = useMemo(
    () => clientPeriodCode
      ? buildEventsFromPeriod(rawEvents, rawBookings, clientPeriodCode)
      : rawEvents,
    [clientPeriodCode, rawEvents, rawBookings],
  )

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

  const bookings      = useMemo(
    () => clientPeriodCode
      ? rawBookings.filter((booking) => bookingMatchesPeriod(booking, clientPeriodCode))
      : rawBookings,
    [clientPeriodCode, rawBookings],
  )
  const bookingsTotal = clientPeriodCode
    ? bookings.length
    : (allDataQuery.data?.bookings.search?.numRowsFound ?? bookings.length)
  const kpi           = computeKPIs(events)
  const bookingKpi    = computeBookingKPIs(bookings)
  const revenueKpi    = computeRevenueKPIs(bookings)
  const { alerts, duplicateCount, pendingCount } = useAlerts(bookings)

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
    () => bookings.filter((b) => b.created?.startsWith(today)).length,
    [bookings, today],
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
    if (activeFilter === 'total') return bookings
    if (activeFilter === 'antagna') return bookings.filter(b => b.status?.code?.toUpperCase() === 'ACCEPTED')
    if (activeFilter === 'ejBetalda') return bookings.filter(b => b.payment?.paid === false)
    return []
  }, [activeFilter, bookings])

  return (
    <div className="space-y-6">
      <DashboardGreeting
        newToday={newToday}
        ejBetalda={bookingKpi.ejBetalda}
        avgFill={kpi.avgFill}
        periodLabel={periodLabel}
      />

      {/* Filters */}
      <div className="space-y-4">
        <PeriodFilter value={eventBlockId} onChange={setEventBlockId} />

        <div className="flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-full px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint min-w-[180px]"
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
              className="w-full text-sm border border-slate-200 rounded-full pl-9 pr-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint"
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

      {/* KPI — anmälningsstatus (från bokningar) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Totalt anmälda"
          value={bookingsTotal > 0 ? bookingsTotal.toLocaleString('sv-SE') : kpi.totalAccepted.toLocaleString('sv-SE')}
          subtitle={`${events.length} kurser`}
          delta={newToday > 0 ? { count: newToday, label: 'nya idag' } : undefined}
          icon={<Users className="w-6 h-6" />}
          color="violet"
          onClick={() => setActiveFilter('total')}
        />
        <KPICard
          title="Antagna"
          value={bookingKpi.antagna.toLocaleString('sv-SE')}
          subtitle={bookingKpi.total > 0 ? `${Math.round((bookingKpi.antagna / bookingKpi.total) * 100)}% av anmälda` : undefined}
          icon={<UserCheck className="w-6 h-6" />}
          color="emerald"
          onClick={() => setActiveFilter('antagna')}
        />
        <KPICard
          title="Ej betalda"
          value={bookingKpi.ejBetalda.toLocaleString('sv-SE')}
          subtitle={bookingKpi.ejBetalda > 0 ? 'Kräver åtgärd' : 'Alla betalda'}
          icon={<CreditCard className="w-6 h-6" />}
          color={bookingKpi.ejBetalda > 0 ? 'red' : 'emerald'}
          onClick={() => setActiveFilter('ejBetalda')}
        />
        <KPICard
          title="Väntar återkoppling"
          value={alerts.length.toLocaleString('sv-SE')}
          subtitle={pendingCount > 0 && duplicateCount > 0
            ? `${pendingCount} manuell check · ${duplicateCount} dubbelanmälda`
            : pendingCount > 0 ? `${pendingCount} behöver manuell check`
            : duplicateCount > 0 ? `${duplicateCount} dubbelanmälda`
            : 'Inga ärenden'}
          icon={
            <div className="relative">
              <Clock className="w-6 h-6" />
              {duplicateCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-400 ring-1 ring-white" />
              )}
            </div>
          }
          color={alerts.length > 0 ? 'amber' : 'emerald'}
          onClick={() => setAlertsOpen(true)}
        />
      </div>

      {/* KPI — kursstatus */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Aktiva kurser"
          value={events.length}
          subtitle={kpi.openCourses > 0 ? `${kpi.openCourses} öppna för anmälan` : undefined}
          icon={<BookOpen className="w-6 h-6" />}
          color="sky"
        />
        <KPICard
          title="Medelbeläggning"
          value={`${kpi.avgFill}%`}
          subtitle="av tillgängliga platser"
          icon={<TrendingUp className="w-6 h-6" />}
          color="emerald"
        />
        <KPICard
          title="Aviserat"
          value={revenueKpi.aviserat > 0 ? `${(revenueKpi.aviserat / 1000).toFixed(0)} tkr` : '—'}
          subtitle={revenueKpi.aviserat > 0 ? `${revenueKpi.aviserat.toLocaleString('sv-SE')} kr` : undefined}
          icon={<Banknote className="w-6 h-6" />}
          color="emerald"
        />
        <KPICard
          title="Mottaget"
          value={revenueKpi.mottaget > 0 ? `${(revenueKpi.mottaget / 1000).toFixed(0)} tkr` : '—'}
          subtitle={revenueKpi.mottaget > 0 ? `${revenueKpi.mottaget.toLocaleString('sv-SE')} kr` : undefined}
          icon={<Banknote className="w-6 h-6" />}
          color="dark"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookingsChart bookings={bookings} loading={allDataQuery.isLoading} />
        <CategoryChart events={events} loading={allDataQuery.isLoading} />
      </div>

      <EventsTable
        events={events}
        bookings={bookings}
        loading={allDataQuery.isLoading}
        search={search}
        onSelect={setSelectedEvent}
        onRefresh={handleCacheRefresh}
        onDirectRefresh={handleDirectRefresh}
        isRefreshing={isRefreshing}
        isDirectRefreshing={isDirectRefreshing}
      />

      {/* Course detail slide-in */}
      <CourseDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />

      {/* Booking list slide-in for KPI cards */}
      <BookingListPanel
        title={activeFilter ? panelTitles[activeFilter] : ''}
        bookings={filteredForPanel}
        onClose={() => setActiveFilter(null)}
      />

      {/* Alerts slide-in for "Väntar återkoppling" */}
      <AlertsPanel
        open={alertsOpen}
        alerts={alerts}
        onClose={() => setAlertsOpen(false)}
      />
    </div>
  )
}

function DashboardGreeting({
  newToday,
  ejBetalda,
  avgFill,
  periodLabel,
}: {
  newToday: number
  ejBetalda: number
  avgFill: number
  periodLabel: string
}) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'God morgon' : hour < 17 ? 'God dag' : 'God kväll'
  const dayName = format(now, 'EEEE', { locale: sv }).toUpperCase()
  const dateStr = format(now, 'd MMMM', { locale: sv }).toUpperCase()

  const statNodes: React.ReactNode[] = []
  if (newToday > 0) statNodes.push(<><strong>{newToday}</strong> nya anmälningar idag</>)
  if (ejBetalda > 0) statNodes.push(<><strong>{ejBetalda}</strong> fakturor väntar betalning</>)
  if (avgFill > 0) statNodes.push(<>Terminen ligger på <strong>{avgFill}%</strong> beläggning</>)

  return (
    <div>
      <p className="text-xs font-semibold text-brand-forest tracking-widest uppercase mb-3">
        {dayName} {dateStr}{periodLabel ? ` · ${periodLabel}` : ''}
      </p>
      <h1
        className="text-brand-dark"
        style={{ fontSize: 'clamp(36px, 4vw, 56px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
      >
        <span style={{ fontWeight: 300, fontStyle: 'italic' }}>{greeting},</span>
        <br />
        <span style={{ fontWeight: 400 }}>Sollentuna.</span>
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

function computeKPIs(events: Event[]) {
  let totalAccepted = 0
  let totalMax = 0
  let estimatedRevenue = 0
  let openCourses = 0
  for (const e of events) {
    const accepted = e.statistics?.accepted ?? 0
    const max      = e.requirements?.maxParticipants ?? 0
    const price    = e.pricing?.basePriceInclVat ?? 0
    totalAccepted   += accepted
    if (max > 0) totalMax += max
    estimatedRevenue += accepted * price
    if (e.registration?.open) openCourses++
  }
  const avgFill = totalMax > 0 ? Math.round((totalAccepted / totalMax) * 100) : 0
  return { totalAccepted, avgFill, estimatedRevenue, openCourses }
}

function computeBookingKPIs(bookings: import('../types/cogwork').Booking[]) {
  let antagna = 0
  let ejBetalda = 0
  let vantarAterkoppling = 0
  for (const b of bookings) {
    const code = b.status?.code?.toUpperCase() ?? ''
    if (code === 'ACCEPTED') antagna++
    if (b.payment?.paid === false) ejBetalda++
    if (code === 'AWAITING_RESPONSE' || code === 'WAITING') vantarAterkoppling++
  }
  return { total: bookings.length, antagna, ejBetalda, vantarAterkoppling }
}

function computeRevenueKPIs(bookings: import('../types/cogwork').Booking[]) {
  let mottaget = 0
  let aviserat = 0
  for (const b of bookings) {
    if (b.payment?.paid === true && b.payment.amountPaid)
      mottaget += b.payment.amountPaid
    if (b.payment?.priceAgreed && b.status?.code?.toUpperCase() === 'ACCEPTED')
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
  const byId = new Map<number, Event>(fromEvents.map((event) => [event.id, event]))

  for (const booking of bookings) {
    if (!bookingMatchesPeriod(booking, periodCode)) continue
    const bookingEvent = booking.event
    if (!bookingEvent?.id || byId.has(bookingEvent.id)) continue

    const eventBookings = bookings.filter((b) => b.event?.id === bookingEvent.id)
    const accepted = eventBookings.filter((b) => b.status?.code?.toUpperCase() === 'ACCEPTED').length
    byId.set(bookingEvent.id, {
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
        showing: false,
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
