import { useQuery } from '@tanstack/react-query'
import { fetchShop } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'
import type { ShopEventGroup } from '../types/cogwork'

export function useShop() {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['shop', config.org],
    queryFn: () => fetchShop(config),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(config.org),
    select: (data): ShopEventGroup[] =>
      [...data.eventGroups].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
  })
}
