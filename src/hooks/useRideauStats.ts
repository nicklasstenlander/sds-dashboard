import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchRideauStats } from '../services/rideauStatsService'

// Samma polling-mönster som useCalls.ts (refetchInterval: 60s). react-query
// v4 kör INTE refetchInterval i bakgrunden som standard
// (refetchIntervalInBackground är false om den inte sätts) - pollningen
// pausar alltså automatiskt när webbläsarfliken döljs, precis som
// ordertexten kräver, utan någon egen visibilitychange-lyssnare.
//
// enabled styrs på BÅDE inloggad (accessToken finns) och roll (admin) -
// en icke-admin (eller en utloggad) gör aldrig ens anropet, så servern
// behöver inte neka något den redan vet att klienten inte frågar om.
export function useRideauStats() {
  const { session, profile } = useAuth()
  const accessToken = session?.access_token
  const isAdmin = profile?.role === 'admin'

  return useQuery({
    queryKey: ['rideauStats'],
    queryFn: () => fetchRideauStats(accessToken as string),
    enabled: Boolean(accessToken) && isAdmin,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    // Ingen automatisk omförsöksstorm - ordertextens felvy har en egen,
    // manuell "Försök igen"-knapp (refetch()). Ett 403 ska dessutom
    // aldrig försöka om sig självt - det löser sig inte av att vänta.
    retry: false,
  })
}
