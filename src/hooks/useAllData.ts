import { useQuery } from '@tanstack/react-query'
import { fetchAllData } from '../services/proxyService'
import { fetchAllEvents } from '../api/cogwork'
import { cacheKey, readBootstrapCache, readBootstrapTimestamp, writeBootstrapCache } from '../utils/cache'
import type { AllDataResponse } from '../services/proxyService'

/**
 * Hämtar bookings + events + duplicates i ett enda proxy-anrop.
 * Används av Dashboard för att minimera nätverksanrop (3+ → 1).
 */
export function useAllData(eventBlockId: string) {
  const key = cacheKey('allData', eventBlockId || 'all')
  const eventsKey = cacheKey('events', eventBlockId || 'all')
  const bookingsKey = cacheKey('bookings', eventBlockId || 'all')
  const duplicatesKey = cacheKey('duplicates', 'all')

  return useQuery<AllDataResponse>({
    queryKey: ['allData', eventBlockId],
    queryFn: async () => {
      const [data, allEventsResult] = await Promise.all([
        fetchAllData(eventBlockId || undefined),
        fetchAllEvents(eventBlockId || undefined).catch(() => null),
      ])
      // Om all_events-endpointen svarar, ersätt proxy-events med fullständig lista
      const mergedData: AllDataResponse = allEventsResult
        ? { ...data, events: { ...data.events, events: allEventsResult.events } }
        : data
      writeBootstrapCache(key, mergedData)
      writeBootstrapCache(eventsKey, mergedData.events)
      writeBootstrapCache(bookingsKey, mergedData.bookings)
      writeBootstrapCache(duplicatesKey, mergedData.duplicates)
      return mergedData
    },
    initialData: () => readBootstrapCache<AllDataResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
