import { useQuery } from '@tanstack/react-query'
import { fetchBookings } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'

export function useEventBookings(eventId: number | null) {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['bookings', 'event', config.org, config.pw, eventId],
    queryFn: () => fetchBookings(config, { eventId: String(eventId), maxRows: '500' }),
    select: (data) => data.bookings,
    enabled: Boolean(config.org && config.pw && eventId != null),
  })
}
