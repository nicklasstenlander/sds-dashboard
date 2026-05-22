import { useState } from 'react'
import { buildCourseMetrics, metricsForEvent } from '../utils/courseMetrics'
import type { Booking, Event } from '../types/cogwork'

const COLORS = [
  'var(--category-1)',
  'var(--category-2)',
  'var(--category-3)',
  'var(--category-4)',
  'var(--category-5)',
  'var(--category-6)',
  'var(--category-7)',
  'var(--category-8)',
  'var(--category-9)',
  'var(--category-10)',
  'var(--category-11)',
]
const TOP_N = 7

interface CategoryChartProps {
  events: Event[]
  bookings?: Booking[]
  loading?: boolean
}

export function CategoryChart({ events, bookings = [], loading }: CategoryChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const data = buildCategoryData(events, bookings)
  const total = data.reduce((s, d) => s + d.value, 0)

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="h-48 bg-slate-50 rounded animate-pulse" />
      </div>
    )
  }

  let acc = 0
  const segments = data.map((d, i) => {
    const pct = total > 0 ? (d.value / total) * 100 : 0
    const dash = `${pct} ${100 - pct}`
    const offset = 25 - acc
    acc += pct
    return { ...d, dash, offset, color: COLORS[i % COLORS.length] }
  })

  const hoveredSeg = hovered !== null ? segments[hovered] : null

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Anmälda per kategori</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400">
          Ingen kursdata tillgänglig
        </div>
      ) : (
        <div className="flex items-center gap-8">
          {/* Donut — larger now that legend is compact */}
          <svg
            className="[--donut-bg:#ffffff] [--donut-border:#f1f5f9] [--donut-text:#1a2e2e] [--donut-muted:#94a3b8] dark:[--donut-bg:var(--dark-icon-bg)] dark:[--donut-border:var(--dark-border-active)] dark:[--donut-text:var(--dark-text-primary)] dark:[--donut-muted:var(--dark-text-tertiary)]"
            viewBox="0 0 42 42"
            width="180"
            height="180"
            style={{ flexShrink: 0 }}
          >
            <circle cx="21" cy="21" r="15.915" fill="var(--donut-bg)" stroke="var(--donut-border)" strokeWidth="0.5" />
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx="21" cy="21" r="15.915"
                fill="transparent"
                stroke={seg.color}
                strokeWidth="6.5"
                strokeDasharray={seg.dash}
                strokeDashoffset={seg.offset}
                style={{
                  opacity: hovered === null || hovered === i ? 1 : 0.2,
                  transition: 'opacity 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            {hoveredSeg ? (
              <>
                <text x="21" y="19" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="var(--donut-text)">
                  {hoveredSeg.value}
                </text>
                <text x="21" y="24.5" textAnchor="middle" fontSize="2.4" fill="var(--donut-muted)">
                  {hoveredSeg.name.length > 14 ? hoveredSeg.name.slice(0, 14) + '…' : hoveredSeg.name}
                </text>
              </>
            ) : (
              <>
                <text x="21" y="19.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="var(--donut-text)">
                  {total}
                </text>
                <text x="21" y="25" textAnchor="middle" fontSize="2.8" fill="var(--donut-muted)">
                  anmälda
                </text>
              </>
            )}
          </svg>

          {/* Compact legend — max TOP_N + 1 rows */}
          <div className="flex-1 min-w-0 space-y-2">
            {segments.map((seg, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 text-xs"
                style={{
                  opacity: hovered === null || hovered === i ? 1 : 0.3,
                  transition: 'opacity 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0, display: 'inline-block' }} />
                <span className="flex-1 truncate text-slate-500">{seg.name}</span>
                <span className="tabular-nums font-semibold text-slate-700">{seg.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildCategoryData(events: Event[], bookings: Booking[]) {
  const metricsByEvent = buildCourseMetrics(bookings)
  const counts: Record<string, number> = {}
  for (const e of events) {
    const name = e.grouping?.primaryEventGroup?.name ?? 'Övrigt'
    const registered = metricsForEvent(metricsByEvent, e, false).registered
    counts[name] = (counts[name] ?? 0) + registered
  }
  const sorted = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0 && d.name.toLowerCase() !== 'föreställningar')
    .sort((a, b) => b.value - a.value)

  if (sorted.length <= TOP_N + 1) return sorted

  const top = sorted.slice(0, TOP_N)
  const rest = sorted.slice(TOP_N)
  const restValue = rest.reduce((s, d) => s + d.value, 0)
  return [...top, { name: `Övriga (${rest.length} kategorier)`, value: restValue }]
}
