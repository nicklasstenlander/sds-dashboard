import { useState } from 'react'
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
  const [hovered, setHovered] = useState<number | null>(null)
  const data = buildData(bookings, granularity)
  const max = Math.max(...data.map(d => d.count), 1)

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

  const CHART_H = 160
  const BAR_COLOR = '#dd5c86'

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
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 100 100`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: CHART_H }}
          >
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1="0" x2="100"
                y1={t * 100} y2={t * 100}
                stroke="#f1f5f9" strokeWidth="0.3" strokeDasharray="0.8 0.8"
              />
            ))}
            {/* Bars */}
            {data.map((d, i) => {
              const total = data.length
              const barW = (100 / total) * 0.6
              const gap = (100 / total) * 0.4
              const h = (d.count / max) * 88
              const x = i * (barW + gap) + gap / 2
              const y = 100 - h
              return (
                <g
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={x} y={y} width={barW} height={h}
                    rx="0.8"
                    fill={BAR_COLOR}
                    style={{
                      opacity: hovered === null || hovered === i ? 1 : 0.3,
                      transition: 'opacity 0.15s',
                    }}
                  />
                  {/* Invisible hit area */}
                  <rect x={x - gap / 2} y="0" width={barW + gap} height="100" fill="transparent" />
                </g>
              )
            })}
          </svg>

          {/* X-axis labels */}
          <div className="flex mt-1" style={{ fontSize: 10, color: '#94a3b8' }}>
            {data.map((d, i) => (
              <div
                key={i}
                style={{ flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {i % Math.ceil(data.length / 8) === 0 ? d.label : ''}
              </div>
            ))}
          </div>

          {/* Tooltip */}
          {hovered !== null && data[hovered] && (
            <div
              style={{
                position: 'absolute',
                left: `${((hovered + 0.5) / data.length) * 100}%`,
                top: 0,
                transform: 'translateX(-50%) translateY(-28px)',
                background: '#1a2e2e',
                color: 'white',
                padding: '3px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {data[hovered].label}: {data[hovered].count}
            </div>
          )}
        </div>
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
        label = `v${getISOWeek(parseISO(key))}`
      } else {
        label = format(parseISO(key), 'd/M', { locale: sv })
      }
      return { label, count }
    })
}
