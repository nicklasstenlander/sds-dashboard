import type { ReactNode } from 'react'

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
  violet:   { cardBg: 'bg-identity-violet', iconBg: 'bg-white/60', icon: 'text-brand-pinkDark',     border: 'border-purple-200',       title: 'text-slate-700',         value: 'text-brand-dark', delta: 'text-brand-forest' },
  emerald:  { cardBg: 'bg-brand-mint',      iconBg: 'bg-white/60', icon: 'text-brand-forest',       border: 'border-brand-sage',       title: 'text-brand-dark/80',     value: 'text-brand-dark', delta: 'text-brand-forest' },
  amber:    { cardBg: 'bg-identity-amber',  iconBg: 'bg-black/10', icon: 'text-[#6b4f00]',          border: 'border-[#e6c940]',        title: 'text-[#6b4f00]',         value: 'text-[#6b4f00]',  delta: 'text-[#6b4f00]' },
  sky:      { cardBg: 'bg-identity-sky',    iconBg: 'bg-white/60', icon: 'text-sky-800',            border: 'border-sky-200',          title: 'text-slate-700',         value: 'text-brand-dark', delta: 'text-brand-forest' },
  red:      { cardBg: 'bg-status-criticalSoft', iconBg: 'bg-white/60', icon: 'text-status-critical', border: 'border-status-critical/30', title: 'text-brand-dark',        value: 'text-status-critical', delta: 'text-status-critical' },
  ok:       { cardBg: 'bg-status-okSoft',   iconBg: 'bg-white/60', icon: 'text-brand-forest',       border: 'border-status-ok',        title: 'text-brand-dark/80',     value: 'text-brand-dark', delta: 'text-brand-forest' },
  warning:  { cardBg: 'bg-status-warningSoft', iconBg: 'bg-white/60', icon: 'text-[#6b4f00]',       border: 'border-status-warning/40', title: 'text-[#5f4700]',         value: 'text-[#5f4700]',  delta: 'text-[#5f4700]' },
  critical: { cardBg: 'bg-status-criticalSoft', iconBg: 'bg-white/60', icon: 'text-status-critical', border: 'border-status-critical/30', title: 'text-brand-dark',        value: 'text-status-critical', delta: 'text-status-critical' },
  dark:     { cardBg: 'bg-[#1a2e2e]',       iconBg: 'bg-white/10', icon: 'text-white/80',           border: 'border-[#1a2e2e]',        title: 'text-white/80',          value: 'text-white',      delta: 'text-brand-mint' },
}

export function KPICard({ title, value, subtitle, icon, trend, delta, color = 'violet', onClick }: KPICardProps) {
  const c = colorMap[color]

  return (
    <div
      className={`card kpi-card p-5 border ${c.cardBg} ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      data-kpi-color={color}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className={`kpi-card-title text-sm font-medium truncate ${c.title}`}>{title}</p>
          <p className={`kpi-card-value mt-1 text-4xl font-bold tabular-nums leading-none ${c.value}`}>{value}</p>
          {subtitle && <p className={`kpi-card-subtitle mt-1 text-sm opacity-70 ${c.value}`}>{subtitle}</p>}
          {delta != null && delta.count !== 0 && (
            <p className={`kpi-card-delta mt-1 text-xs font-semibold ${delta.count > 0 ? c.delta : 'text-slate-400'}`}>
              {delta.count > 0 ? '+' : ''}{delta.count} {delta.label}
            </p>
          )}
          {trend && (
            <p className={`mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-brand-forest' : 'text-status-critical'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`kpi-card-icon shrink-0 w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
