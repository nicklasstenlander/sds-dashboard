import { useQuery } from '@tanstack/react-query'
import { fetchProxyEvents } from '../services/proxyService'
import { blockNameToCode } from '../utils/periods'
import type { Event } from '../types/cogwork'

export interface EventFilters {
  eventBlockId?: string
}

export function useEvents(filters: EventFilters = {}) {
  return useQuery({
    queryKey: ['events', filters.eventBlockId],
    queryFn: () => fetchProxyEvents(filters.eventBlockId),
    select: (data) => data.events,
    staleTime: 5 * 60 * 1000,
  })
}

export interface EventBlock {
  id: number
  name: string
  label: string
}

export function useEventBlocks() {
  return useQuery({
    queryKey: ['eventBlocks'],
    queryFn: () => fetchProxyEvents(),
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
          const label = /^(HT|VT)\d{2}$/.test(code)
            ? `${code.slice(0, 2)} 20${code.slice(2)}`
            : name
          return { id, name, label }
        })
        .sort((a, b) => b.id - a.id)
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchProxyEvents(),
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
    staleTime: 5 * 60 * 1000,
  })
}
