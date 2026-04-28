import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchProxyDuplicates, fetchProxyEvents } from '../services/proxyService'
import type { AllDataResponse } from '../services/proxyService'
import { EXCLUDED_DUPLICATE_GROUP_IDS } from '../config/cogwork'
import { cacheKey, readBootstrapCache, readBootstrapTimestamp, writeBootstrapCache } from '../utils/cache'
import type { Booking, BookingsResponse, Event, EventsResponse } from '../types/cogwork'

export type AlertType = 'duplicate' | 'pending'

export interface Alert {
  booking: Booking
  type: AlertType
  count: number
}

// Status-koder för bokningar som väntar på handläggning
const PENDING_STATUS_CODES = ['NEW']

export function useAlerts(allBookings: Booking[] = []) {
  const queryClient = useQueryClient()
  const duplicatesCacheKey = cacheKey('duplicates', 'all')
  const eventsCacheKey = cacheKey('events', 'all')

  const dupQuery = useQuery<BookingsResponse>({
    queryKey: ['duplicates'],
    queryFn: async () => {
      const data = await fetchProxyDuplicates()
      writeBootstrapCache(duplicatesCacheKey, data)
      return data
    },
    initialData: () => readBootstrapCache<BookingsResponse>(duplicatesCacheKey),
    initialDataUpdatedAt: () => readBootstrapTimestamp(duplicatesCacheKey),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const eventsQuery = useQuery<EventsResponse>({
    queryKey: ['events', undefined],
    queryFn: async () => {
      const data = await fetchProxyEvents()
      writeBootstrapCache(eventsCacheKey, data)
      return data
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialData: () => {
      const allData = queryClient.getQueryData<AllDataResponse>(['allData', ''])
      return allData?.events ?? readBootstrapCache<EventsResponse>(eventsCacheKey)
    },
    initialDataUpdatedAt: () => readBootstrapTimestamp(eventsCacheKey),
  })

  const excludeEventIds = useMemo(() => {
    const ids = new Set<number>()
    const eventList: Event[] = Array.isArray(eventsQuery.data)
      ? eventsQuery.data
      : (eventsQuery.data as { events: Event[] } | undefined)?.events ?? []
    for (const e of eventList) {
      const groupId = e.grouping?.primaryEventGroup?.id
      if (groupId !== undefined && EXCLUDED_DUPLICATE_GROUP_IDS.includes(groupId)) {
        ids.add(e.id)
      }
    }
    return ids
  }, [eventsQuery.data])

  const alerts = useMemo<Alert[]>(() => {
    const dupBookings = dupQuery.data?.bookings ?? []
    const seen = new Set<string>()
    const result: Alert[] = []

    // Dubbelanmälda — gruppera per (deltagare + event-ID)
    const byParticipantEvent = new Map<string, typeof dupBookings>()
    for (const b of dupBookings) {
      const pKey = b.participant?.key ?? String(b.participant?.id ?? '')
      const eId  = String(b.event?.id ?? '')
      if (!pKey || !eId) continue
      const groupKey = `${pKey}::${eId}`
      byParticipantEvent.set(groupKey, [...(byParticipantEvent.get(groupKey) ?? []), b])
    }

    const isForestallning = (b: Booking) => {
      const code = b.event?.code?.toLowerCase() ?? ''
      const eId  = b.event?.id
      return code.includes('forestallning') || (eId !== undefined && excludeEventIds.has(eId))
    }

    const seenParticipant = new Set<string>()
    for (const groupBookings of byParticipantEvent.values()) {
      if (groupBookings.length <= 1) continue
      const first = groupBookings[0]
      if (isForestallning(first)) continue
      const pKey = first.participant?.key ?? String(first.participant?.id ?? '')
      if (seenParticipant.has(pKey)) continue
      seenParticipant.add(pKey)
      if (!seen.has(first.key)) {
        seen.add(first.key)
        result.push({ booking: first, type: 'duplicate', count: groupBookings.length })
      }
    }

    // Väntar återkoppling — bokningar med status NEW som inte redan visas
    for (const b of allBookings) {
      const code = b.status?.code?.toUpperCase() ?? ''
      if (PENDING_STATUS_CODES.includes(code) && !seen.has(b.key)) {
        seen.add(b.key)
        result.push({ booking: b, type: 'pending', count: 1 })
      }
    }

    return result
  }, [dupQuery.data, allBookings, excludeEventIds])

  const duplicateCount = alerts.filter(a => a.type === 'duplicate').length
  const pendingCount   = alerts.filter(a => a.type === 'pending').length

  return { alerts, duplicateCount, pendingCount, isLoading: dupQuery.isLoading }
}
