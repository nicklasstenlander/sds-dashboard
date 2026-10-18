import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Users } from 'lucide-react'
import type { RideauEventStat } from '../types/rideauStats'
import { formatEventDate, formatOreAsSek, isMarkedStatus, statusLabel } from '../utils/rideauStats'

interface RideauStatCardProps {
  event: RideauEventStat
  revenueBasis: string
}

export function RideauStatCard({ event, revenueBasis }: RideauStatCardProps) {
  const pct = event.capacity > 0 ? Math.round((event.sold / event.capacity) * 100) : 0
  const showPartialRefundNote = revenueBasis === 'gross_before_partial_refunds'

  const chartData = event.by_day.map((d) => ({
    label: d.date.slice(5), // "MM-DD" - litet diagram, kort etikett räcker
    tickets: d.tickets,
  }))

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-brand-dark truncate">{event.title}</h3>
          <p className="text-sm text-slate-500">{formatEventDate(event.starts_at)}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
            isMarkedStatus(event.status) ? 'bg-slate-100 text-slate-500' : 'bg-status-okSoft dark:bg-[rgba(93,184,138,0.14)] text-[#1e4025] dark:text-[var(--dark-positive)]'
          }`}
        >
          {statusLabel(event.status)}
        </span>
      </div>

      {/* Förloppsstapel sold/capacity */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>{event.sold} / {event.capacity} sålda</span>
          <span className="font-semibold text-brand-dark">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-accent transition-[width]"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Intäkt */}
      <div className="mb-4">
        <p className="text-2xl font-bold tabular-nums text-brand-dark leading-none">
          {formatOreAsSek(event.revenue_ore)}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          inkl. moms
          {showPartialRefundNote && (
            <span className="text-slate-400"> · Före eventuella delåterbetalningar</span>
          )}
        </p>
      </div>

      {/* Per biljettyp */}
      {event.by_ticket_type.length > 0 && (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-xs text-slate-400 text-left">
              <th className="font-medium pb-1">Biljettyp</th>
              <th className="font-medium pb-1 text-right">Sålda</th>
              <th className="font-medium pb-1 text-right">Intäkt</th>
            </tr>
          </thead>
          <tbody>
            {event.by_ticket_type.map((tt) => (
              <tr key={tt.name} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{tt.name}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">{tt.sold}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">{formatOreAsSek(tt.revenue_ore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Försäljning per dag */}
      {chartData.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-1">Sålda biljetter per dag</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                formatter={(v: number) => [`${v} st`, 'Sålda']}
              />
              <Bar dataKey="tickets" fill="#1e4025" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insläppta - bara om > 0 */}
      {event.checked_in > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Users className="w-3.5 h-3.5" />
          {event.checked_in} insläppta
        </p>
      )}
    </div>
  )
}
