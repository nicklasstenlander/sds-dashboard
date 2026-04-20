import { Search } from 'lucide-react'
import { useEventBlocks, useCategories } from '../hooks/useEvents'
import { blockNameToCode, codeToLabel, sortPeriodCodes } from '../utils/periods'

export interface FilterState {
  eventBlockId: string
  catId: string
  search: string
}

interface FiltersProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  showSearch?: boolean
}

export function Filters({ filters, onChange, showSearch = true }: FiltersProps) {
  const { data: blocks = [] } = useEventBlocks()
  const { data: categories = [] } = useCategories()

  const periodPills = sortPeriodCodes(
    blocks
      .map((b) => ({ ...b, code: blockNameToCode(b.name) }))
      .filter((b) => /^(HT|VT)\d{2}$/.test(b.code))
      .map((b) => b.code),
  ).slice(0, 5)

  function update(partial: Partial<FilterState>) {
    onChange({ ...filters, ...partial })
  }

  function selectPeriodCode(code: string) {
    const block = blocks.find((b) => blockNameToCode(b.name) === code)
    update({ eventBlockId: block ? String(block.id) : '' })
  }

  const activeCode = (() => {
    if (!filters.eventBlockId) return ''
    const block = blocks.find((b) => String(b.id) === filters.eventBlockId)
    return block ? blockNameToCode(block.name) : ''
  })()

  return (
    <div className="space-y-3">
      {/* Period pills */}
      {periodPills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1">Period:</span>
          <button
            onClick={() => update({ eventBlockId: '' })}
            className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
              !filters.eventBlockId
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
            }`}
          >
            Alla
          </button>
          {periodPills.map((code) => (
            <button
              key={code}
              onClick={() => selectPeriodCode(code)}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
                activeCode === code
                  ? 'bg-brand-dark text-white border-brand-dark'
                  : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
              }`}
            >
              {codeToLabel(code)}
            </button>
          ))}
        </div>
      )}

      {/* Category + search */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.catId}
          onChange={(e) => update({ catId: e.target.value })}
          className="text-sm border border-slate-200 rounded-full px-4 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-mint min-w-[160px]"
        >
          <option value="">Alla kategorier</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>

        {showSearch && (
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Sök kurs…"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-full pl-9 pr-4 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-mint"
            />
          </div>
        )}
      </div>
    </div>
  )
}
