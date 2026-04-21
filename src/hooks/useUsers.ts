import { useQuery } from '@tanstack/react-query'
import { fetchUsers } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'

export function useUsers(query: string) {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['users', config.org, query],
    queryFn: () => fetchUsers(config, query),
    select: (data) => data.users,
    enabled: Boolean(config.org && config.pw && query.trim().length >= 2),
    staleTime: 2 * 60 * 1000,
  })
}
