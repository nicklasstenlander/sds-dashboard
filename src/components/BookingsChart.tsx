import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO, startOfMonth, startOfWeek, startOfDay, getISOWeek } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { Booking } from '../types/cogwork'

type Granularity = 'month' | 'week' | 'day'

interface BookingsChartProps {
  bookings: Booking[]
  loading?: boolean
}

export function BookingsChart({ bookings, loading }: BookingsChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('month')
  const data = buildData(bookings, granularity)

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="h-48 bg-slate-50 rounded animate-pulse" />
      </div>
    )
  }

  const titles: Record<Granularity, string> = {
    month: 'Anmälningar per månad',
    week:  'Anmälningar per vecka',
    day:   'Anmälningar per dag',
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-slate-700">{titles[granularity]}</h2>
        <div className="flex gap-1">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                granularity === g
                  ? 'bg-brand-mint text-brand-dark'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              {g === 'month' ? 'Månad' : g === 'week' ? 'Vecka' : 'Dag'}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400">
          Ingen bokningsdata tillgänglig — kontrollera API-nyckel
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '12px',
              }}
              formatter={(v: number) => [v, 'Anmälningar']}
            />
            <Bar dataKey="count" fill="#dd5c86" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function buildData(bookings: Booking[], granularity: Granularity) {
  const counts: Record<string, number> = {}

  for (const b of bookings) {
    if (!b.created) continue
    try {
      const date = parseISO(b.created)
      let key: string
      if (granularity === 'month') {
        key = format(startOfMonth(date), 'yyyy-MM')
      } else if (granularity === 'week') {
        key = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      } else {
        key = format(startOfDay(date), 'yyyy-MM-dd')
      }
      counts[key] = (counts[key] ?? 0) + 1
    } catch {}
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      let label: string
      if (granularity === 'month') {
        label = format(parseISO(`${key}-01`), 'MMM yy', { locale: sv })
      } else if (granularity === 'week') {
        const d = parseISO(key)
        label = `v${getISOWeek(d)}`
      } else {
        label = format(parseISO(key), 'd/M', { locale: sv })
      }
      return { label, count }
    })
}
