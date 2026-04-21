import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { Event } from '../types/cogwork'

const COLORS = ['#dd5c86', '#ee7a9f', '#f192ac', '#f4d1ce', '#009399', '#45aba5', '#a0c4b9', '#cfded2']

interface CategoryChartProps {
  events: Event[]
  loading?: boolean
}

export function CategoryChart({ events, loading }: CategoryChartProps) {
  const data = buildCategoryData(events)

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="h-48 bg-slate-50 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">Anmälda per kategori</h2>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400">
          Ingen kursdata tillgänglig
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={35}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => [v, 'Anmälda']}
              contentStyle={{
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                fontSize: '12px',
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            />
          </PieChart>
        </ResponsiveContainer>
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
