import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchProxyDuplicates, fetchProxyEvents } from '../services/proxyService'
import { EXCLUDED_DUPLICATE_GROUP_IDS } from '../config/cogwork'
import type { Booking, Event } from '../types/cogwork'

export type AlertType = 'duplicate'

export interface Alert {
  booking: Booking
  type: AlertType
  count: number // antal gånger personen är bokad på exakt samma kurs
}

export function useAlerts() {
  const queryClient = useQueryClient()

  const dupQuery = useQuery({
    queryKey: ['duplicates'],
    queryFn: () => fetchProxyDuplicates(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  // Återanvänd events från proxy-cachen om den finns — annars hämta separat
  const eventsQuery = useQuery({
    queryKey: ['events', undefined],
    queryFn: () => fetchProxyEvents(),
    staleTime: 5 * 60 * 1000,
    initialData: () => {
      // Försök återanvänd data från useAllData-cachen för att slippa extra anrop
      const allData = queryClient.getQueryData<{ events: { events: Event[] } }>(['allData', ''])
      return allData?.events
    },
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

    // Gruppera per (deltagare + event-ID) — flagga bara om 2+ bokningar på samma kurs
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
      return code.includes('forestallning') ||
        (eId !== undefined && excludeEventIds.has(eId))
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

    return result
  }, [dupQuery.data, excludeEventIds])

  return { alerts, duplicateCount: alerts.length, isLoading: dupQuery.isLoading }
}
