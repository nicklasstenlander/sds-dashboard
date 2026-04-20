import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO, startOfMonth } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { Booking } from '../types/cogwork'

interface BookingsChartProps {
  bookings: Booking[]
  loading?: boolean
}

export function BookingsChart({ bookings, loading }: BookingsChartProps) {
  const data = buildMonthlyData(bookings)

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="h-48 bg-slate-50 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Anmälningar per månad</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400">
          Ingen bokningsdata tillgänglig — kontrollera API-nyckel
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="month"
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
            <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function buildMonthlyData(bookings: Booking[]) {
  const counts: Record<string, number> = {}

  for (const b of bookings) {
    if (!b.created) continue
    try {
      const key = format(startOfMonth(parseISO(b.created)), 'yyyy-MM')
      counts[key] = (counts[key] ?? 0) + 1
    } catch {}
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      month: format(parseISO(`${key}-01`), 'MMM yy', { locale: sv }),
      count,
    }))
}
