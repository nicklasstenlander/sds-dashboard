import { useState } from 'react'
import type { Event } from '../types/cogwork'

const COLORS = ['#009399','#dd5c86','#45aba5','#ee7a9f','#a0c4b9','#f192ac','#cfded2','#f4d1ce']

interface CategoryChartProps {
  events: Event[]
  loading?: boolean
}

export function CategoryChart({ events, loading }: CategoryChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const data = buildCategoryData(events)
  const total = data.reduce((s, d) => s + d.value, 0)

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="h-48 bg-slate-50 rounded animate-pulse" />
      </div>
    )
  }

  // Build SVG donut segments via strokeDasharray on a circle with r=15.915
  // circumference = 2π × 15.915 ≈ 100, so pct maps directly to dasharray units
  let acc = 0
  const segments = data.map((d, i) => {
    const pct = total > 0 ? (d.value / total) * 100 : 0
    const dash = `${pct} ${100 - pct}`
    const offset = 25 - acc
    acc += pct
    return { ...d, dash, offset, color: COLORS[i % COLORS.length] }
  })

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Anmälda per kategori</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400">
          Ingen kursdata tillgänglig
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut */}
          <svg viewBox="0 0 42 42" width="148" height="148" style={{ flexShrink: 0 }}>
            <circle cx="21" cy="21" r="15.915" fill="white" stroke="#f1f5f9" strokeWidth="0.5" />
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
                  opacity: hovered === null || hovered === i ? 1 : 0.25,
                  transition: 'opacity 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
            <text x="21" y="19.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#1a2e2e">
              {total}
            </text>
            <text x="21" y="25" textAnchor="middle" fontSize="2.8" fill="#94a3b8">
              anmälda
            </text>
          </svg>

          {/* Legend */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {segments.map((seg, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs"
                style={{
                  opacity: hovered === null || hovered === i ? 1 : 0.35,
                  transition: 'opacity 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0, display: 'inline-block' }}
                />
                <span className="flex-1 truncate text-slate-500">{seg.name}</span>
                <span className="tabular-nums font-medium text-slate-700">{seg.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildCategoryData(events: Event[]) {
  const counts: Record<string, number> = {}
  for (const e of events) {
    const name = e.grouping?.primaryEventGroup?.name ?? 'Övrigt'
    const accepted = e.statistics?.accepted ?? 0
    counts[name] = (counts[name] ?? 0) + accepted
  }
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
}
