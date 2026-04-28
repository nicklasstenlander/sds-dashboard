import { useQuery } from '@tanstack/react-query'
import { fetchAllData } from '../services/proxyService'
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
      const data = await fetchAllData(eventBlockId || undefined)
      writeBootstrapCache(key, data)
      writeBootstrapCache(eventsKey, data.events)
      writeBootstrapCache(bookingsKey, data.bookings)
      writeBootstrapCache(duplicatesKey, data.duplicates)
      return data
    },
    initialData: () => readBootstrapCache<AllDataResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
