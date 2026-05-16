import { useState, useMemo } from 'react'
import { ArrowUpDown, ChevronRight, RefreshCw, DatabaseZap, MessageSquare } from 'lucide-react'
import type { Event, Booking } from '../types/cogwork'

interface EventsTableProps {
  events: Event[]
  bookings?: Booking[]
  loading?: boolean
  search: string
  onSelect?: (event: Event) => void
  onRefresh?: () => void
  onDirectRefresh?: () => void
  onGroupSms?: (event: Event, courseBookings: Booking[]) => void
  isRefreshing?: boolean
  isDirectRefreshing?: boolean
}

type SortKey = 'name' | 'accepted' | 'antagna' | 'fill' | 'price' | 'revenue' | 'category'
type SortDir = 'asc' | 'desc'

function fillRate(e: Event): number {
  const max = e.requirements?.maxParticipants
  const accepted = e.statistics?.accepted ?? 0
  if (!max) return 0
  return Math.round((accepted / max) * 100)
}

function fillBarColor(pct: number) {
  if (pct >= 90) return '#c53030'
  if (pct >= 70) return '#d4a942'
  return '#009399'
}

function fillBadgeClass(pct: number) {
  if (pct >= 90) return 'bg-red-50 text-red-700'
  if (pct >= 70) return 'bg-amber-50 text-amber-700'
  return 'bg-brand-mint text-brand-forest'
}

function bookingEventId(booking: Booking): string {
  return booking.event?.id != null ? String(booking.event.id) : ''
}

export function EventsTable({ events, bookings = [], loading, search, onSelect, onRefresh, onDirectRefresh, onGroupSms, isRefreshing, isDirectRefreshing }: EventsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'accepted', dir: 'desc' })

  // Count paid (antagna) bookings per event id
  const antagnaPer = useMemo(() => {
    const map: Record<string, number> = {}
    for (const b of bookings) {
      const eventId = bookingEventId(b)
      if (b.payment?.paid === true && eventId) {
        map[eventId] = (map[eventId] ?? 0) + 1
      }
    }
    return map
  }, [bookings])

  const paymentPer = useMemo(() => {
    const map: Record<string, { price?: number; revenue: number }> = {}
    const priceCounts: Record<string, Record<number, number>> = {}

    for (const b of bookings) {
      const eventId = bookingEventId(b)
      const price = b.payment?.priceAgreed
      if (!eventId || !price) continue

      priceCounts[eventId] ??= {}
      priceCounts[eventId][price] = (priceCounts[eventId][price] ?? 0) + 1

      if (b.status?.code?.toUpperCase() === 'ACCEPTED') {
        map[eventId] ??= { revenue: 0 }
        map[eventId].revenue += price
      }
    }

    for (const [eventId, counts] of Object.entries(priceCounts)) {
      map[eventId] ??= { revenue: 0 }
      map[eventId].price = Number(
        Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0][0],
      )
    }

    return map
  }, [bookings])

  const filtered = events
    .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .map((e) => {
      const payments = paymentPer[String(e.id)]
      const price = e.pricing?.basePriceInclVat ?? payments?.price ?? 0
      const revenue = payments?.revenue ?? ((e.statistics?.accepted ?? 0) * price)
      return {
        ...e,
        _fill: fillRate(e),
        _price: price,
        _revenue: revenue,
      }
    })
    .sort((a, b) => {
      let diff = 0
      switch (sort.key) {
        case 'name':     diff = a.name.localeCompare(b.name, 'sv'); break
        case 'accepted': diff = (a.statistics?.accepted ?? 0) - (b.statistics?.accepted ?? 0); break
        case 'antagna':  diff = (antagnaPer[String(a.id)] ?? 0) - (antagnaPer[String(b.id)] ?? 0); break
        case 'fill':     diff = a._fill - b._fill; break
        case 'price':    diff = a._price - b._price; break
        case 'revenue':  diff = a._revenue - b._revenue; break
        case 'category': diff = (a.grouping?.primaryEventGroup?.name ?? '').localeCompare(b.grouping?.primaryEventGroup?.name ?? '', 'sv'); break
      }
      return sort.dir === 'asc' ? diff : -diff
    })

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  const Th = ({ label, sortKey, hide }: { label: string; sortKey?: SortKey; hide?: string }) => (
    <th
      className={`text-left text-xs font-semibold text-slate-400 py-3 px-4 whitespace-nowrap ${sortKey ? 'cursor-pointer select-none hover:text-slate-600' : ''} ${hide ?? ''}`}
      onClick={() => sortKey && toggleSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey && <ArrowUpDown className="w-3 h-3" />}
      </span>
    </th>
  )

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
    <div className="card">
      <div className="p-5 pb-0 flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-dark">
          Kursöversikt{' '}
          <span className="text-slate-400 font-light">({filtered.length} kurser)</span>
        </h2>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Uppdatera från proxy-cache"
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
              title="Hämta färsk data direkt från CogWork (långsammare)"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-brand-forest px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isDirectRefreshing
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <DatabaseZap className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isDirectRefreshing ? 'Hämtar…' : 'Från CogWork'}</span>
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto mt-3 rounded-b-2xl">
        <table className="w-full">
          <thead className="border-y border-slate-100 bg-slate-50/60">
            <tr>
              <Th label="Kurs"        sortKey="name"     />
              <Th label="Kategori"    sortKey="category" hide="hidden sm:table-cell" />
              <Th label="Dag / tid"   hide="hidden md:table-cell" />
              <Th label="Period"      hide="hidden md:table-cell" />
              <Th label="Anmälda"     sortKey="accepted" />
              <Th label="Antagna"     sortKey="antagna"  hide="hidden sm:table-cell" />
              <Th label="Max"         hide="hidden sm:table-cell" />
              <Th label="Beläggning"  sortKey="fill"     />
              <Th label="Pris (kr)"   sortKey="price"    hide="hidden lg:table-cell" />
              <Th label="Intäkt (kr)" sortKey="revenue"  hide="hidden lg:table-cell" />
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-10 text-sm text-slate-400">
                  Inga kurser hittades
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr
                key={e.key}
                onClick={() => onSelect?.(e)}
                className={`hover:bg-brand-mint transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
              >
                <td className="py-3 px-4 text-sm font-medium text-brand-dark max-w-[160px] sm:max-w-[220px]">
                  <div className="flex items-start gap-1.5 flex-wrap">
                    <span className="line-clamp-2">{e.name}</span>
                    {e.registration?.showing === false && (
                      <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 whitespace-nowrap">
                        Ej publik
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden sm:table-cell py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                  {e.grouping?.primaryEventGroup?.name ?? '—'}
                </td>
                <td className="hidden md:table-cell py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                  {e.schedule?.dayAndTimeInfo || '—'}
                </td>
                <td className="hidden md:table-cell py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                  {e.grouping?.eventBlock?.name || '—'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-600 tabular-nums">
                  {e.statistics?.accepted ?? '—'}
                </td>
                <td className="hidden sm:table-cell py-3 px-4 text-sm font-semibold text-brand-forest tabular-nums">
                  {antagnaPer[String(e.id)] ?? 0}
                </td>
                <td className="hidden sm:table-cell py-3 px-4 text-sm text-slate-500 tabular-nums">
                  {e.requirements?.maxParticipants ?? '—'}
                </td>
                <td className="py-3 px-4">
                  {e.requirements?.maxParticipants ? (
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(e._fill, 100)}%`, background: fillBarColor(e._fill) }}
                        />
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${fillBadgeClass(e._fill)}`}>
                        {e._fill}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </td>
                <td className="hidden lg:table-cell py-3 px-4 text-sm text-slate-600 tabular-nums whitespace-nowrap">
                  {e._price > 0 ? e._price.toLocaleString('sv-SE') : '—'}
                </td>
                <td className="hidden lg:table-cell py-3 px-4 text-sm font-medium text-slate-700 tabular-nums whitespace-nowrap">
                  {e._revenue > 0 ? e._revenue.toLocaleString('sv-SE') : '—'}
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-1">
                    {onGroupSms && (() => {
                      const courseBookings = bookings.filter(b => b.event?.id === e.id)
                      const hasAccepted = courseBookings.some(b => b.status?.code?.toUpperCase() === 'ACCEPTED')
                      return hasAccepted ? (
                        <button
                          onClick={ev => { ev.stopPropagation(); onGroupSms(e, courseBookings) }}
                          title="Skicka SMS till gruppen"
                          className="p-1 rounded text-slate-300 hover:text-brand-dark hover:bg-slate-100 transition-colors"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      ) : null
                    })()}
                    {onSelect && <ChevronRight className="w-4 h-4 text-slate-300" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
