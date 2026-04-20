import { useQuery } from '@tanstack/react-query'
import { fetchEvents } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'
import { blockNameToCode } from '../utils/periods'
import type { Event } from '../types/cogwork'

export interface EventFilters {
  eventBlockId?: string
  eventGroupId?: string
  minDate?: string
  maxDate?: string
}

export function useEvents(filters: EventFilters = {}) {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['events', config.org, config.pw, filters],
    queryFn: () =>
      fetchEvents(config, {
        ...(filters.eventBlockId ? { eventBlockId: filters.eventBlockId } : {}),
        ...(filters.eventGroupId ? { eventGroup1Id: filters.eventGroupId } : {}),
        ...(filters.minDate ? { minDate: filters.minDate } : {}),
        ...(filters.maxDate ? { maxDate: filters.maxDate } : {}),
      }),
    select: (data) => data.events,
    enabled: Boolean(config.org),
  })
}

export interface EventBlock {
  id: number
  name: string
  /** Short display label, e.g. "HT 2025" or original name if no match */
  label: string
}

export function useEventBlocks() {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['eventBlocks', config.org, config.pw],
    queryFn: () => fetchEvents(config, { maxRows: '500' }),
    select: (data): EventBlock[] => {
      const seen = new Map<number, string>()
      data.events.forEach((e: Event) => {
        const block = e.grouping?.eventBlock
        if (block?.id && block.name && !seen.has(block.id)) {
          seen.set(block.id, block.name)
        }
      })
      return Array.from(seen.entries())
        .map(([id, name]) => {
          const code = blockNameToCode(name)
          // Show as "HT 2025" if code matched, otherwise use the raw name
          const label = /^(HT|VT)\d{2}$/.test(code)
            ? `${code.slice(0, 2)} 20${code.slice(2)}`
            : name
          return { id, name, label }
        })
        .sort((a, b) => b.id - a.id) // highest id = newest term
    },
    enabled: Boolean(config.org),
  })
}

export function useCategories() {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['categories', config.org, config.pw],
    queryFn: () => fetchEvents(config, { maxRows: '500' }),
    select: (data): { id: number; name: string }[] => {
      const seen = new Map<number, string>()
      data.events.forEach((e: Event) => {
        const g = e.grouping?.primaryEventGroup
        if (g?.id && !seen.has(g.id)) seen.set(g.id, g.name)
      })
      return Array.from(seen.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    },
    enabled: Boolean(config.org),
  })
}
