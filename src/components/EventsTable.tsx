import { useEffect, useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, RefreshCw, DatabaseZap, MessageSquare } from 'lucide-react'
import { buildCourseMetrics, bookingEventId, isAcceptedBooking, metricsForEvent } from '../utils/courseMetrics'
import { collectKnownEventBlockIds, resolveEventBlockName } from '../utils/eventBlock'
import type { Event, Booking } from '../types/cogwork'

interface EventsTableProps {
  events: Event[]
  bookings?: Booking[]
  loading?: boolean
  search: string
  activePeriod?: string
  onSelect?: (event: Event) => void
  /** Id för den kurs vars detaljpanel är öppen (markeras i listan). */
  selectedId?: string | null
  /** Rapporterar kursernas ordning som den visas (filter + sortering), för föregående/nästa i panelen. */
  onVisibleOrderChange?: (ids: string[]) => void
  /** Aktivt snabbfilter (styrs uppifrån så att t.ex. Översiktens "Kurser över 90 %" kan förvälja det). */
  filter?: CourseFilter
  onFilterChange?: (filter: CourseFilter) => void
  onRefresh?: () => void
  onDirectRefresh?: () => void
  onGroupSms?: (event: Event, courseBookings: Booking[]) => void
  isRefreshing?: boolean
  isDirectRefreshing?: boolean
}

type SortKey = 'name' | 'accepted' | 'fill' | 'revenue'

/** Snabbfilter ovanför listan. over90 = 90 % eller mer (inkl. överfulla), over100 = fler antagna än max. */
export type CourseFilter = 'all' | 'over90' | 'over100' | 'open' | 'hidden'
const COURSE_FILTERS: { id: CourseFilter; label: string }[] = [
  { id: 'all', label: 'Alla' },
  { id: 'over90', label: 'Över 90 %' },
  { id: 'over100', label: 'Överfulla' },
  { id: 'open', label: 'Lediga platser' },
  { id: 'hidden', label: 'Ej publika' },
]
type SortDir = 'asc' | 'desc'

function fillRate(e: Event, accepted: number): number {
  const max = e.requirements?.maxParticipants
  if (!max) return 0
  return Math.round((accepted / max) * 100)
}

function shortPeriod(name: string): string {
  return name
    .replace(/20(\d{2})/, '$1')
    .replace(/Vårterminen\s*/i, 'VT')
    .replace(/Höstterminen\s*/i, 'HT')
}

function fillBarColor(pct: number) {
  if (pct >= 90) return 'var(--fill-danger)'
  if (pct >= 70) return 'var(--fill-warn)'
  return 'var(--fill-ok)'
}

function fillBadgeClass(pct: number) {
  if (pct >= 90) return 'bg-status-criticalSoft text-status-critical dark:bg-[rgba(232,98,127,0.14)] dark:text-[var(--dark-warning)]'
  if (pct >= 70) return 'bg-status-warningSoft text-[#5f4700] dark:bg-[rgba(234,179,8,0.14)] dark:text-[var(--dark-attention)]'
  return 'bg-status-okSoft text-brand-forest dark:bg-[rgba(93,184,138,0.14)] dark:text-[var(--dark-positive)]'
}

/** "Fre 16.30-17.45" -> "Fre 16.30–17.45" (tankstreck i tidsintervall). */
function formatDayTime(s?: string): string {
  return s ? s.replace(/(\d)\s*-\s*(\d)/g, '$1–$2') : ''
}

interface ThProps {
  label: string
  title?: string
  sortKey?: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  hide?: string
  align?: 'left' | 'right'
}

function Th({ label, title, sortKey, sort, onSort, hide, align }: ThProps) {
  const active = !!sortKey && sort.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  const right = align === 'right'
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : sortKey ? 'none' : undefined}
      title={title}
      className={`sticky top-0 z-10 bg-surface-page dark:bg-[var(--dark-card)] border-y border-slate-100 text-xs font-semibold py-2.5 px-3 whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${hide ?? ''}`}
    >
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1 rounded sds-focus-ring hover:text-brand-dark ${active ? 'text-brand-dark' : 'text-slate-600'} ${right ? 'flex-row-reverse' : ''}`}
        >
          {label}
          <Icon className={`w-3 h-3 ${active ? '' : 'opacity-50'}`} aria-hidden="true" />
        </button>
      ) : (
        <span className="text-slate-600">{label}</span>
      )}
    </th>
  )
}

export function EventsTable({ events, bookings = [], loading, search, activePeriod, onSelect, selectedId, onVisibleOrderChange, filter: filterProp, onFilterChange, onRefresh, onDirectRefresh, onGroupSms, isRefreshing, isDirectRefreshing }: EventsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'accepted', dir: 'desc' })
  const [filterState, setFilterState] = useState<CourseFilter>('all')
  const filter = filterProp ?? filterState
  const setFilter = (f: CourseFilter) => { setFilterState(f); onFilterChange?.(f) }

  const metricsByEvent = useMemo(() => buildCourseMetrics(bookings), [bookings])
  const knownEventBlockIds = useMemo(() => collectKnownEventBlockIds(events), [events])

  const withMetrics = events
    .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .map((e) => {
      const metrics = metricsForEvent(metricsByEvent, e, false)
      const price = e.pricing?.basePriceInclVat ?? metrics.price ?? 0
      return {
        ...e,
        _registered: metrics.registered,
        _accepted: metrics.accepted,
        _fill: fillRate(e, metrics.accepted),
        _price: price,
        _revenue: metrics.revenue || (metrics.accepted * price),
      }
    })

  const matchesFilter = (e: (typeof withMetrics)[number], f: CourseFilter) => {
    const max = e.requirements?.maxParticipants
    switch (f) {
      case 'over90':  return !!max && e._fill >= 90
      case 'over100': return !!max && e._accepted > max
      case 'open':    return !!max && e._accepted < max
      case 'hidden':  return e.registration?.showing === false
      default:        return true
    }
  }
  const filterCounts = Object.fromEntries(
    COURSE_FILTERS.map(({ id }) => [id, withMetrics.filter((e) => matchesFilter(e, id)).length]),
  ) as Record<CourseFilter, number>

  const filtered = withMetrics
    .filter((e) => matchesFilter(e, filter))
    .sort((a, b) => {
      let diff = 0
      switch (sort.key) {
        case 'name':     diff = a.name.localeCompare(b.name, 'sv'); break
        case 'accepted': diff = a._registered - b._registered; break
        case 'fill':     diff = a._fill - b._fill; break
        case 'revenue':  diff = a._revenue - b._revenue; break
      }
      return sort.dir === 'asc' ? diff : -diff
    })

  const orderKey = filtered.map((e) => String(e.id)).join(',')
  useEffect(() => {
    onVisibleOrderChange?.(orderKey ? orderKey.split(',') : [])
  }, [orderKey, onVisibleOrderChange])

  // Håll vald rad synlig när man bläddrar med föregående/nästa eller öppnar via länk.
  useEffect(() => {
    if (!selectedId) return
    document.querySelector(`[data-event-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-5 w-36 bg-slate-100 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div id="kurslista" className="card overflow-clip scroll-mt-4">
      <div className="p-5 pb-0 flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-dark">
          Kursöversikt{' '}
          <span className="text-slate-600 font-normal">· {filtered.length} kurser</span>
        </h2>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Ladda om listan (snabbt, från cache)"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-dark px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing && !isDirectRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isRefreshing && !isDirectRefreshing ? 'Uppdaterar…' : 'Uppdatera'}</span>
            </button>
          )}
          {onDirectRefresh && (
            <button
              onClick={onDirectRefresh}
              disabled={isDirectRefreshing}
              title="Hämta färsk data direkt från CogWork (tar längre tid)"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-forest px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isDirectRefreshing
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <DatabaseZap className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isDirectRefreshing ? 'Hämtar…' : 'Hämta från CogWork'}</span>
            </button>
          )}
        </div>
      </div>
      <div role="group" aria-label="Filtrera kurser" className="px-5 pt-3 pb-3 flex flex-wrap gap-2">
        {COURSE_FILTERS.map(({ id, label }) => {
          const active = filter === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(id)}
              className={`sds-focus-ring text-sm px-3.5 py-1.5 rounded-full border transition-colors ${
                active
                  ? 'bg-brand-dark text-white border-brand-dark font-medium'
                  : 'bg-white border-slate-200 text-brand-dark hover:border-brand-dark'
              }`}
            >
              {label}{id !== 'all' && <span className={active ? 'opacity-80' : 'text-slate-600'}> {filterCounts[id]}</span>}
            </button>
          )
        })}
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <Th label="Kurs" sortKey="name" sort={sort} onSort={toggleSort} />
            <Th label="Anmälda" title="Antal anmälningar, inklusive de som inte antagits" sortKey="accepted" align="right" hide="hidden sm:table-cell" sort={sort} onSort={toggleSort} />
            <Th label="Antagna / max" title="Antagna elever av max antal platser, med beläggning i procent" sortKey="fill" sort={sort} onSort={toggleSort} />
            <Th label="Intäkt (kr)" title="Antagna × pris" sortKey="revenue" align="right" hide="hidden md:table-cell" sort={sort} onSort={toggleSort} />
            <th scope="col" className="sticky top-0 z-10 bg-surface-page dark:bg-[var(--dark-card)] border-y border-slate-100 w-px">
              <span className="sr-only">Åtgärder</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-transparent">
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-10 text-sm text-slate-600">
                {search ? `Inga kurser matchar ”${search}”. Prova ett annat sökord.` : filter !== 'all' ? 'Inga kurser matchar det här filtret.' : 'Inga kurser i den här perioden.'}
              </td>
            </tr>
          )}
          {filtered.map((e) => {
            const max = e.requirements?.maxParticipants
            const over = !!max && e._accepted > max
            const category = e.grouping?.primaryEventGroup?.name
            const dayTime = formatDayTime(e.schedule?.dayAndTimeInfo)
            const meta = [category, dayTime].filter(Boolean).join(' · ')
            return (
              <tr
                key={e.key}
                data-event-id={String(e.id)}
                onClick={() => onSelect?.(e)}
                {...(onSelect ? {
                  tabIndex: 0,
                  onKeyDown: (ev: React.KeyboardEvent) => {
                    if (ev.target !== ev.currentTarget) return
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(e) }
                  },
                } : {})}
                aria-current={selectedId === String(e.id) ? 'true' : undefined}
                className={`hover:bg-slate-50 dark:hover:bg-[rgba(255,255,255,0.03)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-forest ${selectedId === String(e.id) ? 'bg-surface-selected shadow-[inset_4px_0_0_#009399] dark:bg-[rgba(255,255,255,0.06)]' : ''} ${onSelect ? 'cursor-pointer' : ''}`}
              >
                {/* Kurs: namn + kategori · dag/tid på en rad. w-full/max-w-0 låter cellen ta resten av bredden och trunkera i stället för att tvinga fram sidled-scroll. */}
                <td className="w-full max-w-0 py-2.5 px-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-sm font-medium text-brand-dark" title={e.name}>{e.name}</span>
                    {e.registration?.showing === false && (
                      <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
                        Ej publik
                      </span>
                    )}
                    {!activePeriod && resolveEventBlockName(e, knownEventBlockIds) && (
                      <span className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
                        {shortPeriod(resolveEventBlockName(e, knownEventBlockIds)!)}
                      </span>
                    )}
                  </div>
                  {meta && (
                    <div className="truncate text-xs text-slate-500 mt-0.5" title={meta}>{meta}</div>
                  )}
                </td>
                <td className="hidden sm:table-cell py-2.5 px-3 text-sm text-slate-700 tabular-nums text-right whitespace-nowrap">
                  {e._registered}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  {max ? (
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-[4.5rem] text-right text-sm tabular-nums ${over ? 'font-semibold text-[#b4234f] dark:text-[var(--dark-warning)]' : 'text-slate-700'}`}
                        title={over ? `${e._accepted - max} över max` : undefined}
                      >
                        <span className="font-semibold">{e._accepted}</span>
                        <span className="text-slate-500 font-normal"> / {max}</span>
                      </span>
                      <div className="hidden sm:block w-12 h-1.5 bg-slate-100 dark:bg-[var(--fill-track)] rounded-full overflow-hidden shrink-0" aria-hidden="true">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(e._fill, 100)}%`, background: fillBarColor(e._fill) }}
                        />
                      </div>
                      <span className={`w-12 text-center text-xs font-semibold px-2 py-0.5 rounded-full ${fillBadgeClass(e._fill)}`}>
                        {e._fill}%
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <span className="w-[4.5rem] text-right text-sm tabular-nums text-slate-700">
                        <span className="font-semibold">{e._accepted}</span>
                      </span>
                      <span className="hidden sm:inline text-xs text-slate-500">Ingen maxgräns</span>
                    </div>
                  )}
                </td>
                <td className="hidden md:table-cell py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                  {e._revenue > 0 || e._price > 0 ? (
                    <>
                      <div className={`text-sm ${e._revenue > 0 ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                        {e._revenue > 0 ? e._revenue.toLocaleString('sv-SE') : '—'}
                      </div>
                      {e._price > 0 && <div className="text-xs text-slate-500">à {e._price.toLocaleString('sv-SE')}</div>}
                    </>
                  ) : (
                    <span className="text-sm text-slate-500" title="Inget pris inlagt i CogWork">—</span>
                  )}
                </td>
                <td className="py-2.5 pl-1 pr-3">
                  <div className="flex items-center justify-end gap-0.5">
                    {onGroupSms && (() => {
                      const courseBookings = bookings.filter(b => bookingEventId(b) === String(e.id))
                      const hasAccepted = courseBookings.some(isAcceptedBooking)
                      return hasAccepted ? (
                        <button
                          type="button"
                          onClick={ev => { ev.stopPropagation(); onGroupSms(e, courseBookings) }}
                          title="Skicka SMS till gruppen"
                          aria-label={`Skicka SMS till gruppen i ${e.name}`}
                          className="p-1.5 rounded text-slate-500 hover:text-brand-dark hover:bg-slate-100 transition-colors sds-focus-ring"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      ) : null
                    })()}
                    {onSelect && <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
