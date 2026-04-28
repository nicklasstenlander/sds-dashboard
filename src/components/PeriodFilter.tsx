import { useEventBlocks } from '../hooks/useEvents'
import { blockNameToCode, codeToLabel, sortPeriodCodes } from '../utils/periods'

interface PeriodFilterProps {
  value: string
  onChange: (eventBlockId: string) => void
}

const EXTRA_PERIOD_CODES = ['HT25']

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const { data: blocks = [], isLoading } = useEventBlocks()
  const blockOptions = blocks.map((block) => ({
    id: String(block.id),
    code: blockNameToCode(block.name),
    label: block.label,
  }))
  const availableCodes = new Set(blockOptions.map((block) => block.code))
  const syntheticOptions = sortPeriodCodes(
    EXTRA_PERIOD_CODES.filter((code) => !availableCodes.has(code)),
  ).map((code) => ({
    id: code,
    code,
    label: codeToLabel(code),
  }))
  const options = [...blockOptions, ...syntheticOptions]

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
