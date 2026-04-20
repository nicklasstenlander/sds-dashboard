import { useEventBlocks } from '../hooks/useEvents'

interface PeriodFilterProps {
  value: string
  onChange: (eventBlockId: string) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const { data: blocks = [], isLoading } = useEventBlocks()

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-400">Period</p>
      <div className="flex flex-wrap gap-2">
        <Pill active={value === ''} onClick={() => onChange('')}>
          Alla terminer
        </Pill>
        {isLoading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-slate-100 animate-pulse" />
            ))
          : blocks.map((b) => (
              <Pill
                key={b.id}
                active={value === String(b.id)}
                onClick={() => onChange(String(b.id))}
              >
                {b.label}
              </Pill>
            ))}
      </div>
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
        active
          ? 'bg-brand-dark text-white border-brand-dark'
          : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
      }`}
    >
      {children}
    </button>
  )
}
