import { useEffect, useState } from 'react'
import { Target, CheckCircle } from 'lucide-react'
import type { Goal, GoalMetric } from '../services/goalsService'

function formatValue(metric: GoalMetric, value: number): string {
  switch (metric) {
    case 'revenue':   return `${value.toLocaleString('sv-SE')} kr`
    case 'occupancy': return `${value}%`
    default:          return value.toLocaleString('sv-SE')
  }
}

function metricLabel(metric: GoalMetric): string {
  switch (metric) {
    case 'bookings_count': return 'anmälningar'
    case 'accepted_count': return 'antagna'
    case 'revenue':        return 'intäkt'
    case 'occupancy':      return 'beläggning'
    case 'new_students':   return 'nya elever'
  }
}

function daysLeft(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

interface GoalCardProps {
  goal:         Goal
  currentValue: number
  onClick:      () => void
  loading?:     boolean
}

export function GoalCard({ goal, currentValue, onClick, loading = false }: GoalCardProps) {
  const pct        = goal.target > 0 ? Math.min(Math.round((currentValue / goal.target) * 100), 100) : 0
  const achieved   = pct >= 100
  const days       = daysLeft(goal.deadline)
  const overdue    = days < 0 && !achieved

  // Animate progress bar on mount
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setBarWidth(pct))
    return () => cancelAnimationFrame(t)
  }, [pct])

  const barColor = achieved ? '#1e4025' : overdue ? '#dd5c86' : '#CDDCD1'

  const daysColor = days > 14
    ? 'text-brand-forest'
    : days >= 1
    ? 'text-amber-600'
    : 'text-red-600'

  return (
    <div
      onClick={onClick}
      className={`card p-5 cursor-pointer hover:shadow-md transition-shadow border ${
        achieved ? 'border-[#1e4025]' : overdue ? 'border-[#dd5c86]' : 'border-slate-100'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {achieved
              ? <CheckCircle className="w-4 h-4 text-[#1e4025] shrink-0" />
              : <Target className="w-4 h-4 text-slate-400 shrink-0" />}
            <p className="text-sm font-semibold text-brand-dark truncate">{goal.title}</p>
          </div>
          {goal.description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 pl-6">{goal.description}</p>
          )}
        </div>
        {loading ? (
          <span className="h-6 w-10 rounded bg-slate-100 animate-pulse shrink-0" />
        ) : (
          <span className={`text-lg font-bold tabular-nums shrink-0 ${achieved ? 'text-[#1e4025]' : overdue ? 'text-[#dd5c86]' : 'text-brand-dark'}`}>
            {pct}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${loading ? 'animate-pulse' : ''}`}
          style={{ width: loading ? '35%' : `${barWidth}%`, background: loading ? '#e2e8f0' : barColor }}
        />
      </div>

      {/* Values + deadline */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        {loading ? (
          <span className="font-semibold text-slate-400">Hämtar måldata…</span>
        ) : (
          <span>
            <span className="font-semibold text-brand-dark">{formatValue(goal.metric, currentValue)}</span>
            {' / '}{formatValue(goal.metric, goal.target)}{' '}{metricLabel(goal.metric)}
          </span>
        )}
        {!loading && achieved ? (
          <span className="font-semibold text-[#1e4025]">Uppnått! ✓</span>
        ) : !loading ? (
          <span className={`font-medium ${daysColor}`}>
            {days < 0 ? `${Math.abs(days)} dagar sedan` : days === 0 ? 'Idag' : `${days} dagar kvar`}
          </span>
        ) : null}
      </div>
    </div>
  )
}
