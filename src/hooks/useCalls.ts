import { useQuery } from '@tanstack/react-query'
import { fetchCalls } from '../services/telavoxService'

export function useCalls(fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ['telavoxCalls', fromDate, toDate],
    queryFn: () => fetchCalls(fromDate, toDate),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}
