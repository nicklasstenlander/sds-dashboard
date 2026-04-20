import { useState, useMemo } from 'react'
import { Users, BookOpen, TrendingUp, Banknote, Search } from 'lucide-react'
import { KPICard } from '../components/KPICard'
import { PeriodFilter } from '../components/PeriodFilter'
import { BookingsChart } from '../components/BookingsChart'
import { CategoryChart } from '../components/CategoryChart'
import { EventsTable } from '../components/EventsTable'
import { CourseDetailPanel } from '../components/CourseDetailPanel'
import { useEvents } from '../hooks/useEvents'
import { useBookings } from '../hooks/useBookings'
import { useShop } from '../hooks/useShop'
import { categoriesFromEvents } from '../utils/categoryFromName'
import type { Event } from '../types/cogwork'

export function Dashboard() {
  const [eventBlockId, setEventBlockId] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  const eventsQuery   = useEvents({ eventBlockId })
  const bookingsQuery = useBookings({ eventBlockId })
  const shopQuery     = useShop()

  const allEvents = eventsQuery.data ?? []
  const shopData  = shopQuery.data

  // Map from verbose event code → dance-style name (from shop)
  const codeToStyle = useMemo(() => shopData?.codeToStyle ?? new Map<string, string>(), [shopData])

  // Category dropdown: shop eventGroups if available, else name-parsing fallback
  const categories = useMemo(() => {
    if (shopData?.groups.length) return shopData.groups
    return categoriesFromEvents(allEvents)
  }, [shopData, allEvents])

  // Client-side filter: look up dance style via code map, fall back to name parsing
  const events = useMemo(() => {
    if (!categoryFilter) return allEvents
    return allEvents.filter((e) => {
      const style = codeToStyle.get(e.code) ?? e.name.split(' - ')[0].trim()
      return style === categoryFilter
    })
  }, [allEvents, categoryFilter, codeToStyle])

  const bookings = bookingsQuery.data ?? []
  const kpi      = computeKPIs(events)

  return (
    <div className="space-y-6">
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
              <option key={c.id ?? c.name} value={c.name}>
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

      {eventsQuery.isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
          Kunde inte hämta kursdata:{' '}
          {eventsQuery.error instanceof Error ? eventsQuery.error.message : 'Okänt fel'}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Totalt anmälda"
          value={kpi.totalAccepted.toLocaleString('sv-SE')}
          subtitle={`${events.length} kurser totalt`}
          icon={<Users className="w-6 h-6" />}
          color="violet"
        />
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
          title="Beräknad intäkt"
          value={kpi.estimatedRevenue > 0 ? `${(kpi.estimatedRevenue / 1000).toFixed(0)} tkr` : '—'}
          subtitle={kpi.estimatedRevenue > 0 ? `${kpi.estimatedRevenue.toLocaleString('sv-SE')} kr` : 'Behöver API-nyckel'}
          icon={<Banknote className="w-6 h-6" />}
          color="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BookingsChart bookings={bookings} loading={bookingsQuery.isLoading} />
        <CategoryChart events={events} codeToStyle={codeToStyle} loading={eventsQuery.isLoading} />
      </div>

      {/* Events table */}
      <EventsTable
        events={events}
        codeToStyle={codeToStyle}
        loading={eventsQuery.isLoading}
        search={search}
        onSelect={setSelectedEvent}
      />

      {/* Course detail slide-in */}
      <CourseDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
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
