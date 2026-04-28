import { useQuery } from '@tanstack/react-query'
import { fetchProxyEvents } from '../services/proxyService'
import { blockNameToCode } from '../utils/periods'
import { cacheKey, readBootstrapCache, readBootstrapTimestamp, writeBootstrapCache } from '../utils/cache'
import type { Event } from '../types/cogwork'
import type { EventsResponse } from '../types/cogwork'

export interface EventFilters {
  eventBlockId?: string
}

export function useEvents(filters: EventFilters = {}) {
  const key = cacheKey('events', filters.eventBlockId ?? 'all')

  return useQuery<EventsResponse, Error, Event[]>({
    queryKey: ['events', filters.eventBlockId],
    queryFn: async () => {
      const data = await fetchProxyEvents(filters.eventBlockId)
      writeBootstrapCache(key, data)
      return data
    },
    initialData: () => readBootstrapCache<EventsResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
    select: (data) => data.events,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export interface EventBlock {
  id: number
  name: string
  label: string
}

export function useEventBlocks() {
  const key = cacheKey('events', 'all')

  return useQuery<EventsResponse, Error, EventBlock[]>({
    queryKey: ['eventBlocks'],
    queryFn: async () => {
      const data = await fetchProxyEvents()
      writeBootstrapCache(key, data)
      return data
    },
    initialData: () => readBootstrapCache<EventsResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
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
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useCategories() {
  const key = cacheKey('events', 'all')

  return useQuery<EventsResponse, Error, { id: number; name: string }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const data = await fetchProxyEvents()
      writeBootstrapCache(key, data)
      return data
    },
    initialData: () => readBootstrapCache<EventsResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
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
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
