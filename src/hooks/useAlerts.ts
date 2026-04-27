import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchBookings } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'
import { useEvents } from './useEvents'
import { EXCLUDED_DUPLICATE_GROUP_IDS } from '../config/cogwork'
import type { Booking } from '../types/cogwork'

export type AlertType = 'duplicate'

export interface Alert {
  booking: Booking
  type: AlertType
  count: number // för dubbletter: antal gånger personen är bokad på exakt samma kurs
}

export function useAlerts() {
  const { config } = useApiConfig()

  const dupQuery = useQuery({
    queryKey: ['bookings-duplicates', config.org, config.pw],
    queryFn: () => fetchBookings(config, { duplicatesOnly: 'true', maxRows: '50' }),
    enabled: Boolean(config.org && config.pw),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  })

  // Alla events (ingen termin-filter) — bygg eventId → primaryEventGroup.id-tabell
  const allEventsQuery = useEvents({})

  const excludeEventIds = useMemo(() => {
    const ids = new Set<number>()
    for (const e of allEventsQuery.data ?? []) {
      const groupId = e.grouping?.primaryEventGroup?.id
      if (groupId !== undefined && EXCLUDED_DUPLICATE_GROUP_IDS.includes(groupId)) {
        ids.add(e.id)
      }
    }
    return ids
  }, [allEventsQuery.data])

  const alerts = useMemo<Alert[]>(() => {
    const dupBookings = dupQuery.data?.bookings ?? []
    const seen = new Set<string>()
    const result: Alert[] = []

    // Gruppera per (deltagare + event-ID) — en person flaggas bara om de har
    // 2+ bokningar på EXAKT SAMMA kurs, och kursen inte är en Föreställning.
    // Detta undviker att studenter med flera olika kurser felaktigt flaggas.
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
