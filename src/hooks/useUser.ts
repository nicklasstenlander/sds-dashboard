import { useQuery } from '@tanstack/react-query'
import { fetchUser } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'

export function useUser(name: string | null) {
  const { config } = useApiConfig()
  return useQuery({
    queryKey: ['user', config.org, name],
    queryFn: () => fetchUser(config, name!),
    select: (data) => data.users[0] ?? null,
    enabled: Boolean(config.org && config.pw && name),
  })
}
