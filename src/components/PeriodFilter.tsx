import { useEventBlocks } from '../hooks/useEvents'

interface PeriodFilterProps {
  value: string
  onChange: (eventBlockId: string) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  // useEventBlocks ger redan unionen av terminer i events-svaret och alla
  // kända terminer i EVENT_BLOCK_IDS_BY_CODE, nyast först och med riktiga id:n.
  const { data: blocks = [], isLoading } = useEventBlocks()
  const options = blocks.map((block) => ({
    id: String(block.id),
    label: block.label,
  }))

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">Period</p>
      <div className="flex flex-wrap gap-2">
        <Pill active={value === ''} onClick={() => onChange('')}>
          Alla terminer
        </Pill>
        {isLoading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-slate-100 animate-pulse" />
            ))
          : options.map((b) => (
              <Pill
                key={b.id}
                active={value === b.id}
                onClick={() => onChange(b.id)}
              >
                {b.label}
              </Pill>
            ))}
      </div>
    </div>
  )
}

export function Pill({
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
          ? 'bg-brand-accentDark text-white border-brand-accentDark dark:bg-[var(--dark-green-secondary)] dark:border-[var(--dark-accent)] dark:text-[var(--dark-text-primary)]'
          : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark dark:bg-transparent dark:border-white/10 dark:text-[var(--dark-text-secondary)] dark:hover:border-white/20 dark:hover:text-[var(--dark-text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}
