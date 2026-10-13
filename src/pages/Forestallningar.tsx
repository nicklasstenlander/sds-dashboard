import { useMemo, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRideauStats } from '../hooks/useRideauStats'
import { RideauStatCard } from '../components/RideauStatCard'
import { RideauStatsError } from '../services/rideauStatsService'
import { describeRideauStatsError, filterEvents, formatUpdatedAt, sortEvents } from '../utils/rideauStats'

function CardSkeleton() {
  return (
    <div className="card p-5">
      <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse mb-2" />
      <div className="h-3 w-1/3 bg-slate-100 rounded animate-pulse mb-4" />
      <div className="h-2 w-full bg-slate-100 rounded animate-pulse mb-4" />
      <div className="h-6 w-1/2 bg-slate-100 rounded animate-pulse mb-4" />
      <div className="h-20 w-full bg-slate-50 rounded animate-pulse" />
    </div>
  )
}

export function Forestallningar() {
  const { profile, loading: authLoading, usingLegacyAuth } = useAuth()
  const [showCancelled, setShowCancelled] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const query = useRideauStats()

  const visibleEvents = useMemo(() => {
    if (!query.data) return []
    return sortEvents(filterEvents(query.data.events, { showCancelled }))
  }, [query.data, showCancelled])

  if (authLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  // Klientens egna rollkontroll - samma rollkälla (profile.role) som
  // resten av appen. usingLegacyAuth (tillfälligt PIN-läge, inget
  // profile/roll alls) räknas INTE som admin här - till skillnad från
  // canSeeSettings/canSeeFinancials på andra sidor (som släpper igenom
  // legacy auth) är "ENDAST admin" ordertextens egna, strikta krav för
  // just den här fliken. Servern (Workern) nekar ändå oberoende av detta
  // - den här kontrollen är bara för att undvika ett onödigt 403-anrop
  // och visa rätt vy direkt.
  if (usingLegacyAuth || !isAdmin) {
    return <ForbiddenState />
  }

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  if (query.isError) {
    const status = query.error instanceof RideauStatsError ? query.error.status : undefined
    if (status === 403) return <ForbiddenState />
    return (
      <div className="card p-8 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="w-8 h-8 text-status-critical" />
        <p className="text-sm font-medium text-brand-dark">{describeRideauStatsError(status)}</p>
        <button
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-brand-mint text-brand-dark hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Försök igen
        </button>
      </div>
    )
  }

  const data = query.data
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {query.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>Uppdaterad {formatUpdatedAt(data.cached_at)}</span>
        </div>
        <button
          onClick={() => setShowCancelled((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
        >
          {showCancelled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showCancelled ? 'Dölj avbokade' : 'Visa avbokade'}
        </button>
      </div>

      {data.stale && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-status-warningSoft text-[#5f4700] text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Visar senaste kända data, uppdaterad {formatUpdatedAt(data.stale_since ?? data.cached_at)}
        </div>
      )}

      {visibleEvents.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Inga föreställningar att visa
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleEvents.map((event) => (
            <RideauStatCard key={event.event_id} event={event} revenueBasis={data.revenue_basis} />
          ))}
        </div>
      )}
    </div>
  )
}

function ForbiddenState() {
  return (
    <div className="card p-8 flex flex-col items-center text-center gap-3">
      <ShieldAlert className="w-8 h-8 text-slate-400" />
      <p className="text-sm font-medium text-brand-dark">Du saknar behörighet</p>
    </div>
  )
}
