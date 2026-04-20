import { useQuery } from '@tanstack/react-query'
import { fetchBookings } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'

export interface BookingFilters {
  minDate?: string
  maxDate?: string
  eventBlockId?: string
  catId?: string
}

export function useBookings(filters: BookingFilters = {}) {
  const { config } = useApiConfig()

  return useQuery({
    queryKey: ['bookings', config.org, config.pw, filters],
    queryFn: () =>
      fetchBookings(config, {
        ...(filters.minDate ? { minDate: filters.minDate } : {}),
        ...(filters.maxDate ? { maxDate: filters.maxDate } : {}),
        ...(filters.eventBlockId ? { eventBlockId: filters.eventBlockId } : {}),
        ...(filters.catId ? { catId: filters.catId } : {}),
      }),
    select: (data) => data.bookings,
    enabled: Boolean(config.org && config.pw),
  })
}
