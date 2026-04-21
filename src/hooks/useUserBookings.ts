import { useQuery } from '@tanstack/react-query'
import { fetchBookings } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'

export function useUserBookings(userId: number | null) {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['bookings', 'user', config.org, userId],
    queryFn: () => fetchBookings(config, { userId: String(userId) }),
    select: (data) => data.bookings,
    enabled: Boolean(config.org && config.pw && userId != null),
    staleTime: 2 * 60 * 1000,
  })
}
