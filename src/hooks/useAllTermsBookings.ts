import { useMemo } from 'react'
import { useKnownTerms } from './useEvents'
import { isPeriodCode } from '../utils/periods'
import { useQueries } from '@tanstack/react-query'
import { fetchProxyBookings } from '../services/proxyService'
import { cacheKey, readBootstrapCache, readBootstrapTimestamp, writeBootstrapCache } from '../utils/cache'
import { EVENT_BLOCK_IDS_BY_CODE } from '../config/cogwork'
import type { BookingsResponse, Booking } from '../types/cogwork'

// Proxyns "inget periodfilter"-läge ger inte garanterat bokningar över flera terminer,
// så vi hämtar varje känd termin explicit och slår ihop dem för elevens fulla historik.
export function useAllTermsBookings() {
  const terms = useKnownTerms()
  const knownEventBlockIds = useMemo(
    () => Array.from(new Set([
      ...Object.values(EVENT_BLOCK_IDS_BY_CODE),
      ...terms.filter((term) => isPeriodCode(term.code)).map((term) => term.id),
    ])),
    [terms],
  )
  const queries = useQueries({
    queries: knownEventBlockIds.map((eventBlockId) => {
      const key = cacheKey('bookings', eventBlockId)
      return {
        queryKey: ['bookings', eventBlockId],
        queryFn: async () => {
          const data = await fetchProxyBookings(eventBlockId)
          writeBootstrapCache(key, data)
          return data
        },
        initialData: () => readBootstrapCache<BookingsResponse>(key),
        initialDataUpdatedAt: () => readBootstrapTimestamp(key),
        staleTime: 0,
        refetchOnMount: 'always' as const,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      }
    }),
  })

  const isLoading = queries.some((q) => q.isLoading)
  const dataUpdatedAtSignature = queries.map((q) => q.dataUpdatedAt).join(',')

  const bookings = useMemo(() => {
    const byKey = new Map<string, Booking>()
    for (const q of queries) {
      for (const booking of q.data?.bookings ?? []) byKey.set(booking.key, booking)
    }
    return Array.from(byKey.values())
  }, [dataUpdatedAtSignature])

  return { bookings, isLoading }
}
