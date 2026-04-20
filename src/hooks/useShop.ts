import { useQuery } from '@tanstack/react-query'
import { fetchShop } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'
import type { ShopEventGroup } from '../types/cogwork'

export interface ShopData {
  groups: ShopEventGroup[]
  /** Maps verbose event `code` → dance-style name */
  codeToStyle: Map<string, string>
}

export function useShop() {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['shop', config.org],
    queryFn: () => fetchShop(config),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(config.org),
    select: (data): ShopData => {
      const groupById = new Map<number, string>()
      data.eventGroups.forEach((g) => {
        if (g.id != null) groupById.set(g.id, g.name)
      })

      const codeToStyle = new Map<string, string>()
      data.events.forEach((e) => {
        if (e.code && e.eventGroup1Id != null) {
          const name = groupById.get(e.eventGroup1Id)
          if (name) codeToStyle.set(e.code, name)
        }
      })

      const groups = [...data.eventGroups].sort((a, b) =>
        a.name.localeCompare(b.name, 'sv'),
      )

      return { groups, codeToStyle }
    },
  })
}
