import { useQuery } from '@tanstack/react-query'
import { fetchProxyBookings } from '../services/proxyService'

export interface BookingFilters {
  eventBlockId?: string
}

export function useBookings(filters: BookingFilters = {}) {
  return useQuery({
    queryKey: ['bookings', filters.eventBlockId],
    queryFn: () => fetchProxyBookings(filters.eventBlockId),
    select: (data) => ({
      bookings: data.bookings,
      total: data.search?.numRowsFound ?? data.bookings.length,
    }),
    staleTime: 5 * 60 * 1000,
  })
}
