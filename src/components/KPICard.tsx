import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  trend?: { value: number; label: string }
  delta?: { count: number; label: string }
  color?: 'violet' | 'emerald' | 'amber' | 'sky' | 'red' | 'dark' | 'ok' | 'warning' | 'critical'
  onClick?: () => void
}

const colorMap = {
  violet:   { cardBg: 'bg-identity-violet', iconBg: 'bg-white/60', icon: 'text-brand-pinkDark',     border: 'border-purple-200',       title: 'text-slate-700',         value: 'text-brand-dark', delta: 'text-brand-dark' },
  emerald:  { cardBg: 'bg-slate-100',      iconBg: 'bg-white/60', icon: 'text-brand-dark',       border: 'border-brand-sage',       title: 'text-brand-dark/80',     value: 'text-brand-dark', delta: 'text-brand-dark' },
  amber:    { cardBg: 'bg-identity-amber',  iconBg: 'bg-black/10', icon: 'text-[#6b4f00]',          border: 'border-[#e6c940]',        title: 'text-[#6b4f00]',         value: 'text-[#6b4f00]',  delta: 'text-[#6b4f00]' },
  sky:      { cardBg: 'bg-identity-sky',    iconBg: 'bg-white/60', icon: 'text-sky-800',            border: 'border-sky-200',          title: 'text-slate-700',         value: 'text-brand-dark', delta: 'text-brand-dark' },
  red:      { cardBg: 'bg-status-criticalSoft', iconBg: 'bg-white/60', icon: 'text-status-critical', border: 'border-status-critical/30', title: 'text-brand-dark',        value: 'text-[#b4234f]', delta: 'text-[#b4234f]' },
  ok:       { cardBg: 'bg-status-okSoft',   iconBg: 'bg-white/60', icon: 'text-brand-dark',       border: 'border-status-ok',        title: 'text-brand-dark/80',     value: 'text-brand-dark', delta: 'text-brand-dark' },
  warning:  { cardBg: 'bg-status-warningSoft', iconBg: 'bg-white/60', icon: 'text-[#6b4f00]',       border: 'border-status-warning/40', title: 'text-[#5f4700]',         value: 'text-[#5f4700]',  delta: 'text-[#5f4700]' },
  critical: { cardBg: 'bg-status-criticalSoft', iconBg: 'bg-white/60', icon: 'text-status-critical', border: 'border-status-critical/30', title: 'text-brand-dark',        value: 'text-[#b4234f]', delta: 'text-[#b4234f]' },
  dark:     { cardBg: 'bg-[#1a2e2e]',       iconBg: 'bg-white/10', icon: 'text-white/80',           border: 'border-[#1a2e2e]',        title: 'text-white/80',          value: 'text-white',      delta: 'text-brand-mint' },
}

export function KPICard({ title, value, subtitle, icon, trend, delta, color = 'violet', onClick }: KPICardProps) {
  const c = colorMap[color]

  // Klickbara kort är knappar för tangentbord/skärmläsare (Enter/Space öppnar detaljpanelen).
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onClick || e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={`card kpi-card group relative p-5 border ${c.cardBg} ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark' : ''}`}
      data-kpi-color={color}
      onClick={onClick}
      {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: handleKeyDown, 'aria-label': `${title}: ${value}. Visa detaljer` } : {})}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className={`kpi-card-title text-sm font-medium truncate ${c.title}`}>{title}</p>
          <p className={`kpi-card-value mt-1 text-4xl font-bold tabular-nums leading-none ${c.value}`}>{value}</p>
          {subtitle && <p className={`kpi-card-subtitle mt-1 text-sm ${color === 'red' || color === 'critical' ? 'opacity-100 font-medium' : 'opacity-70'} ${c.value}`}>{subtitle}</p>}
          {delta != null && delta.count !== 0 && (
            <p className={`kpi-card-delta mt-1 text-xs font-semibold ${delta.count > 0 ? c.delta : 'text-slate-500'}`}>
              {delta.count > 0 ? '+' : ''}{delta.count} {delta.label}
            </p>
          )}
          {trend && (
            <p className={`mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-[#1e4025] dark:text-[var(--dark-positive)]' : 'text-status-critical'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`kpi-card-icon shrink-0 w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
      {onClick && (
        <ChevronRight
          aria-hidden="true"
          className={`absolute bottom-3 right-3 w-4 h-4 opacity-40 transition-all group-hover:opacity-80 group-hover:translate-x-0.5 ${c.icon}`}
        />
      )}
    </div>
  )
}
