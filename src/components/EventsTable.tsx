import { useState } from 'react'
import { ArrowUpDown, ChevronRight } from 'lucide-react'
import type { Event } from '../types/cogwork'

interface EventsTableProps {
  events: Event[]
  loading?: boolean
  search: string
  onSelect?: (event: Event) => void
}

type SortKey = 'name' | 'accepted' | 'fill' | 'price' | 'revenue'
type SortDir = 'asc' | 'desc'

function fillRate(e: Event): number {
  const max = e.requirements?.maxParticipants
  const accepted = e.statistics?.accepted ?? 0
  if (!max) return 0
  return Math.round((accepted / max) * 100)
}

function fillColor(pct: number) {
  if (pct >= 90) return 'bg-red-100 text-red-700'
  if (pct >= 70) return 'bg-amber-100 text-amber-700'
  return 'bg-brand-mint text-brand-forest'
}

export function EventsTable({ events, loading, search, onSelect }: EventsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'accepted', dir: 'desc' })

  const filtered = events
    .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .map((e) => ({
      ...e,
      _fill: fillRate(e),
      _revenue: (e.statistics?.accepted ?? 0) * (e.pricing?.basePriceInclVat ?? 0),
    }))
    .sort((a, b) => {
      let diff = 0
      switch (sort.key) {
        case 'name':     diff = a.name.localeCompare(b.name, 'sv'); break
        case 'accepted': diff = (a.statistics?.accepted ?? 0) - (b.statistics?.accepted ?? 0); break
        case 'fill':     diff = a._fill - b._fill; break
        case 'price':    diff = (a.pricing?.basePriceInclVat ?? 0) - (b.pricing?.basePriceInclVat ?? 0); break
        case 'revenue':  diff = a._revenue - b._revenue; break
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
    <div className="card overflow-hidden">
      <div className="p-5 pb-0 flex items-center justify-between">
        <h2 className="text-sm font-bold text-brand-dark">
          Kursöversikt{' '}
          <span className="text-slate-400 font-light">({filtered.length} kurser)</span>
        </h2>
      </div>
      <div className="overflow-x-auto mt-3">
        <table className="w-full">
          <thead className="border-y border-slate-100 bg-slate-50/60">
            <tr>
              <Th label="Kurs"        sortKey="name"     />
              <Th label="Kategori"    hide="hidden sm:table-cell" />
              <Th label="Dag / tid"   hide="hidden md:table-cell" />
              <Th label="Period"      hide="hidden md:table-cell" />
              <Th label="Anmälda"     sortKey="accepted" />
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
                className={`hover:bg-brand-mintLight transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
              >
                <td className="py-3 px-4 text-sm font-medium text-brand-dark max-w-[160px] sm:max-w-[220px]">
                  <span className="line-clamp-2">{e.name}</span>
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
                <td className="py-3 px-4 text-sm font-semibold text-brand-dark tabular-nums">
                  {e.statistics?.accepted ?? '—'}
                </td>
                <td className="hidden sm:table-cell py-3 px-4 text-sm text-slate-500 tabular-nums">
                  {e.requirements?.maxParticipants ?? '—'}
                </td>
                <td className="py-3 px-4">
                  {e.requirements?.maxParticipants ? (
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${fillColor(e._fill)}`}>
                      {e._fill}%
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </td>
                <td className="hidden lg:table-cell py-3 px-4 text-sm text-slate-600 tabular-nums whitespace-nowrap">
                  {e.pricing?.basePriceInclVat ? e.pricing.basePriceInclVat.toLocaleString('sv-SE') : '—'}
                </td>
                <td className="hidden lg:table-cell py-3 px-4 text-sm font-medium text-slate-700 tabular-nums whitespace-nowrap">
                  {e._revenue > 0 ? e._revenue.toLocaleString('sv-SE') : '—'}
                </td>
                <td className="py-3 px-2">
                  {onSelect && <ChevronRight className="w-4 h-4 text-slate-300" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
