import { useQuery } from '@tanstack/react-query'
import { fetchAllData } from '../services/proxyService'

/**
 * Hämtar bookings + events + duplicates i ett enda proxy-anrop.
 * Används av Dashboard för att minimera nätverksanrop (3+ → 1).
 */
export function useAllData(eventBlockId: string) {
  return useQuery({
    queryKey: ['allData', eventBlockId],
    queryFn: () => fetchAllData(eventBlockId || undefined),
    staleTime: 5 * 60 * 1000,
  })
}
