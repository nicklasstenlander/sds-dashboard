import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Search, RefreshCw } from 'lucide-react'
import { useBookings } from '../hooks/useBookings'
import { useApiConfig } from '../context/ApiContext'
import { PeriodFilter } from '../components/PeriodFilter'
import type { Booking, BookingPayment } from '../types/cogwork'

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

function PayBadge({ booking }: { booking: Booking }) {
  const s = paymentStatus(booking)
  const p = booking.payment
  const map = {
    paid:    { label: 'Betald',    cls: 'bg-brand-mint text-brand-forest' },
    unpaid:  { label: 'Obetald',   cls: 'bg-red-50 text-red-700' },
    partial: { label: 'Delbetald', cls: 'bg-amber-100 text-amber-800' },
    unknown: { label: '—',         cls: '' },
  }
  const { label, cls } = map[s]
  if (s === 'unknown') return <span className="text-xs text-slate-300">—</span>
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {label}
      {s === 'paid' && p?.amountPaid
        ? ` · ${p.amountPaid.toLocaleString('sv-SE')} ${p.currency ?? 'SEK'}`
        : ''}
      {s === 'unpaid' && p?.paymentDue ? ` · förfaller ${p.paymentDue}` : ''}
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
  const [eventBlockId, setEventBlockId] = useState('')
  const [payFilter, setPayFilter] = useState<'' | 'paid' | 'unpaid' | 'partial'>('')
  const [search, setSearch] = useState('')

  // Server-side period filter; client-side for payment + search
  const { data: bookings = [], isLoading, isError, error, isFetching } = useBookings({ eventBlockId })

  const filtered = useMemo(
    () =>
      bookings
        .filter((b) => {
          if (payFilter && paymentStatus(b) !== payFilter) return false
          if (search) {
            const q = search.toLowerCase()
            return (
              b.participant?.name?.toLowerCase().includes(q) ||
              b.event?.name?.toLowerCase().includes(q)
            )
          }
          return true
        })
        .sort((a, b) => b.created.localeCompare(a.created)),
    [bookings, payFilter, search],
  )

  const paidCount    = bookings.filter((b) => paymentStatus(b) === 'paid').length
  const unpaidCount  = bookings.filter((b) => paymentStatus(b) === 'unpaid').length
  const partialCount = bookings.filter((b) => paymentStatus(b) === 'partial').length

  if (!config.pw) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-mintLight flex items-center justify-center mb-4 text-2xl">
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Anmälningar</h1>
        <button
          onClick={() => queryClient.invalidateQueries()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-dark px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Uppdatera</span>
        </button>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Kunde inte hämta anmälningar'}
        </div>
      )}

      {/* Period */}
      <PeriodFilter value={eventBlockId} onChange={setEventBlockId} />

      {/* Payment filter */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-400">Betalning</p>
        <div className="flex flex-wrap gap-2">
          <Pill active={payFilter === ''} onClick={() => setPayFilter('')}>
            Alla
          </Pill>
          <Pill active={payFilter === 'paid'} onClick={() => setPayFilter('paid')}>
            Betalda {!isLoading && `(${paidCount})`}
          </Pill>
          <Pill active={payFilter === 'unpaid'} onClick={() => setPayFilter('unpaid')}>
            Obetalda {!isLoading && `(${unpaidCount})`}
          </Pill>
          {partialCount > 0 && (
            <Pill active={payFilter === 'partial'} onClick={() => setPayFilter('partial')}>
              Delbetalda ({partialCount})
            </Pill>
          )}
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
        <div className="px-5 py-4 border-b border-slate-50 flex items-center gap-6">
          <h2 className="text-sm font-bold text-brand-dark">
            {isLoading ? 'Hämtar…' : `${filtered.length} anmälningar`}
          </h2>
          {!isLoading && bookings.length > 0 && (
            <div className="flex gap-4 text-xs text-slate-500">
              <span>
                <span className="font-semibold text-brand-forest">{paidCount}</span> betalda
              </span>
              <span>
                <span className="font-semibold text-red-600">{unpaidCount}</span> obetalda
              </span>
              {partialCount > 0 && (
                <span>
                  <span className="font-semibold text-amber-700">{partialCount}</span> delbetalda
                </span>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
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
            <p className="text-sm text-slate-400 font-light">Inga anmälningar hittades</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60 border-b border-slate-100">
                <tr>
                  <Th>Anmäld</Th>
                  <Th>Deltagare</Th>
                  <Th>Kurs</Th>
                  <Th>Pris</Th>
                  <Th>Betalning</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((b) => (
                  <tr key={b.key} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-5 text-sm text-slate-400 whitespace-nowrap">
                      {formatDate(b.created)}
                    </td>
                    <td className="py-3 px-5 text-sm font-medium text-brand-dark whitespace-nowrap">
                      {b.participant?.name ?? '—'}
                    </td>
                    <td className="py-3 px-5 text-sm text-slate-700 max-w-[280px]">
                      <span className="line-clamp-1">{b.event?.name ?? '—'}</span>
                    </td>
                    <td className="py-3 px-5 text-sm text-slate-600 tabular-nums whitespace-nowrap">
                      {priceDisplay(b.payment)}
                    </td>
                    <td className="py-3 px-5 whitespace-nowrap">
                      <PayBadge booking={b} />
                    </td>
                    <td className="py-3 px-5 text-sm text-slate-500 whitespace-nowrap">
                      {b.status?.name ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-xs font-semibold text-slate-400 py-3 px-5 whitespace-nowrap">
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
