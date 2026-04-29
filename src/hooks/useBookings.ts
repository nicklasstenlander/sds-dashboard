import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProxyBookings } from '../services/proxyService'
import type { AllDataResponse } from '../services/proxyService'
import { cacheKey, readBootstrapCache, readBootstrapTimestamp, writeBootstrapCache } from '../utils/cache'
import type { BookingsResponse } from '../types/cogwork'

export interface BookingFilters {
  eventBlockId?: string
}

export function useBookings(filters: BookingFilters = {}) {
  const queryClient = useQueryClient()
  const eventBlockId = filters.eventBlockId || ''
  const cachePart = eventBlockId || 'all'
  const allDataQueryKey = ['allData', eventBlockId]
  const allDataCacheKey = cacheKey('allData', cachePart)
  const key = cacheKey('bookings', cachePart)

  return useQuery<BookingsResponse, Error, { bookings: BookingsResponse['bookings']; total: number }>({
    queryKey: ['bookings', eventBlockId],
    queryFn: async () => {
      const data = await fetchProxyBookings(eventBlockId || undefined)
      writeBootstrapCache(key, data)
      return data
    },
    initialData: () => {
      const allData = queryClient.getQueryData<AllDataResponse>(allDataQueryKey)
        ?? readBootstrapCache<AllDataResponse>(allDataCacheKey)
      return readBootstrapCache<BookingsResponse>(key) ?? allData?.bookings
    },
    initialDataUpdatedAt: () => (
      readBootstrapTimestamp(key)
        ?? queryClient.getQueryState<AllDataResponse>(allDataQueryKey)?.dataUpdatedAt
        ?? readBootstrapTimestamp(allDataCacheKey)
    ),
    select: (data) => ({
      bookings: data.bookings,
      total: data.search?.numRowsFound ?? data.bookings.length,
    }),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
