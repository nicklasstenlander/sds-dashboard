import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchProxyEvents, fetchProxyTerms } from '../services/proxyService'
import type { ProxyTerm, TermsResponse } from '../services/proxyService'
import { EVENT_BLOCK_IDS_BY_CODE } from '../config/cogwork'
import {
  blockIdToPeriodCode,
  blockNameToPeriodCode,
  codeToFullLabel,
  codeToLabel,
  isPeriodCode,
  sortPeriodCodes,
} from '../utils/periods'
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
  code: string
  label: string
}

// Höj versionen när blocklistans form ändras, så att en gammal bootstrap-cache
// i localStorage inte fortsätter dölja terminer (staleTime är Infinity).
const EVENT_BLOCKS_CACHE_VERSION = 'eventBlocksV2'

const NO_TERMS: ProxyTerm[] = []

/**
 * Terminerna workern har lärt sig (type=terms). Svarar workern inte, t.ex.
 * innan den är deployad, blir listan tom och EVENT_BLOCK_IDS_BY_CODE räcker.
 */
export function useKnownTerms(): ProxyTerm[] {
  const key = cacheKey('terms')
  const { data } = useQuery<TermsResponse>({
    queryKey: ['terms'],
    queryFn: async () => {
      const data = await fetchProxyTerms().catch((): TermsResponse => ({ terms: [], cachedAt: '' }))
      if (data.terms.length) writeBootstrapCache(key, data)
      return data
    },
    initialData: () => readBootstrapCache<TermsResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  return data?.terms ?? NO_TERMS
}

export function useEventBlocks() {
  const key = cacheKey(EVENT_BLOCKS_CACHE_VERSION, 'events', 'all')
  const terms = useKnownTerms()
  const select = useCallback((data: EventsResponse) => deriveEventBlocks(data.events, terms), [terms])

  return useQuery<EventsResponse, Error, EventBlock[]>({
    queryKey: ['eventBlocks', EVENT_BLOCKS_CACHE_VERSION],
    queryFn: async () => {
      const data = await fetchProxyEvents()
      writeBootstrapCache(key, data)
      return data
    },
    initialData: () => readBootstrapCache<EventsResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
    select,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function deriveEventBlocks(events: Event[], terms: ProxyTerm[] = []): EventBlock[] {
  const byId = new Map<number, EventBlock>()
  events.forEach((e: Event) => {
    const block = e.grouping?.eventBlock
    if (block?.id && block.name && !byId.has(block.id)) {
      byId.set(block.id, toEventBlock(block.id, block.name))
    }
  })

  // Unionen behövs eftersom CogWork slutar lista kurser från en avslutad
  // termin — då försvinner terminens eventBlock ur events-svaret och
  // knappen med den (hände med HT25 och sedan VT26). Terminer som workern
  // har lärt sig och kända terminer i EVENT_BLOCK_IDS_BY_CODE läggs därför
  // alltid till, med riktigt numeriskt id.
  for (const term of terms) {
    const numericId = Number(term.id)
    if (Number.isInteger(numericId) && !byId.has(numericId)) {
      byId.set(numericId, toEventBlock(numericId, term.name))
    }
  }
  const seenCodes = new Set(Array.from(byId.values(), (block) => block.code))
  for (const [code, id] of Object.entries(EVENT_BLOCK_IDS_BY_CODE)) {
    const numericId = Number(id)
    if (byId.has(numericId) || seenCodes.has(code)) continue
    byId.set(numericId, toEventBlock(numericId, codeToFullLabel(code)))
    seenCodes.add(code)
  }

  return sortEventBlocks(Array.from(byId.values()))
}

function toEventBlock(id: number, name: string): EventBlock {
  const code = blockIdToPeriodCode(String(id)) || blockNameToPeriodCode(name) || name
  return { id, name, code, label: isPeriodCode(code) ? codeToLabel(code) : name }
}

/** Nyast först; block utan termin-kod hamnar sist. */
function sortEventBlocks<T extends { id: number | string; code: string }>(blocks: T[]): T[] {
  const order = sortPeriodCodes(blocks.map((block) => block.code).filter(isPeriodCode))
  const rank = (block: T) => {
    const index = order.indexOf(block.code)
    return index === -1 ? order.length : index
  }
  return [...blocks].sort((a, b) => rank(a) - rank(b) || String(b.id).localeCompare(String(a.id)))
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
