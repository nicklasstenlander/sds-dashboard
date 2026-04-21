import type { ReactNode } from 'react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  trend?: { value: number; label: string }
  color?: 'violet' | 'emerald' | 'amber' | 'sky' | 'red'
  onClick?: () => void
}

const colorMap = {
  violet:  { bg: 'bg-brand-mintLight', icon: 'text-brand-pinkDark', border: 'border-brand-pink'   },
  emerald: { bg: 'bg-brand-mint',      icon: 'text-brand-forest',   border: 'border-brand-sage'   },
  amber:   { bg: 'bg-brand-mintLight', icon: 'text-brand-pinkMid',  border: 'border-brand-pink'   },
  sky:     { bg: 'bg-slate-50',        icon: 'text-brand-forest',   border: 'border-brand-mint'   },
  red:     { bg: 'bg-red-50',          icon: 'text-red-600',        border: 'border-red-100'      },
}

export function KPICard({ title, value, subtitle, icon, trend, color = 'violet', onClick }: KPICardProps) {
  const c = colorMap[color]

  return (
    <div
      className={`card p-5 border ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-500 truncate">{title}</p>
          <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          {trend && (
            <p className={`mt-2 text-xs font-medium ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={`shrink-0 w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
