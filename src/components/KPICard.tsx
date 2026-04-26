import type { ReactNode } from 'react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  trend?: { value: number; label: string }
  delta?: { count: number; label: string }
  color?: 'violet' | 'emerald' | 'amber' | 'sky' | 'red' | 'dark'
  onClick?: () => void
}

const colorMap = {
  violet:  { cardBg: 'bg-[#f0e9f5]', iconBg: 'bg-white/60', icon: 'text-brand-pinkDark', border: 'border-purple-200',    title: 'text-slate-500',    value: 'text-brand-dark',  delta: 'text-brand-forest' },
  emerald: { cardBg: 'bg-brand-mint', iconBg: 'bg-white/60', icon: 'text-brand-forest',   border: 'border-brand-sage',    title: 'text-brand-dark/70',value: 'text-brand-dark',  delta: 'text-brand-forest' },
  amber:   { cardBg: 'bg-[#f7dc66]',  iconBg: 'bg-black/10', icon: 'text-[#7a5c00]',      border: 'border-[#e6c940]',     title: 'text-[#7a5c00]/80', value: 'text-[#7a5c00]',   delta: 'text-[#7a5c00]'    },
  sky:     { cardBg: 'bg-sky-100',    iconBg: 'bg-white/60', icon: 'text-sky-700',        border: 'border-sky-200',       title: 'text-slate-500',    value: 'text-brand-dark',  delta: 'text-brand-forest' },
  red:     { cardBg: 'bg-red-100',    iconBg: 'bg-white/60', icon: 'text-red-600',        border: 'border-red-200',       title: 'text-slate-500',    value: 'text-red-800',     delta: 'text-red-600'      },
  dark:    { cardBg: 'bg-[#1a2e2e]', iconBg: 'bg-white/10', icon: 'text-white/80',       border: 'border-[#1a2e2e]',     title: 'text-white/60',     value: 'text-white',       delta: 'text-brand-mint'   },
}

export function KPICard({ title, value, subtitle, icon, trend, delta, color = 'violet', onClick }: KPICardProps) {
  const c = colorMap[color]

  return (
    <div
      className={`card p-5 border ${c.cardBg} ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${c.title}`}>{title}</p>
          <p className={`mt-1 text-4xl font-bold tabular-nums leading-none ${c.value}`}>{value}</p>
          {subtitle && <p className={`mt-1 text-sm opacity-70 ${c.value}`}>{subtitle}</p>}
          {delta != null && delta.count !== 0 && (
            <p className={`mt-1 text-xs font-semibold ${delta.count > 0 ? c.delta : 'text-slate-400'}`}>
              {delta.count > 0 ? '+' : ''}{delta.count} {delta.label}
            </p>
          )}
          {trend && (
            <p className={`mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`shrink-0 w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
