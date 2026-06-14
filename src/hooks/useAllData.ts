import { useQuery } from '@tanstack/react-query'
import { fetchAllData } from '../services/proxyService'
import { fetchAllEvents } from '../api/cogwork'
import { cacheKey, readBootstrapCache, readBootstrapTimestamp, writeBootstrapCache } from '../utils/cache'
import type { AllDataResponse } from '../services/proxyService'
import type { Event } from '../types/cogwork'

const FULL_EVENTS_CACHE_VERSION = 'fullEventsV2'

/**
 * Hämtar bookings + events + duplicates i ett enda proxy-anrop.
 * Används av Dashboard för att minimera nätverksanrop (3+ → 1).
 */
export function useAllData(eventBlockId: string) {
  const key = cacheKey(FULL_EVENTS_CACHE_VERSION, 'allData', eventBlockId || 'all')
  const eventsKey = cacheKey(FULL_EVENTS_CACHE_VERSION, 'events', eventBlockId || 'all')
  const bookingsKey = cacheKey('bookings', eventBlockId || 'all')
  const duplicatesKey = cacheKey('duplicates', 'all')

  return useQuery<AllDataResponse>({
    queryKey: ['allData', eventBlockId],
    queryFn: async () => {
      const [data, allEventsResult] = await Promise.all([
        fetchAllData(eventBlockId || undefined),
        fetchAllEvents(eventBlockId || undefined).catch(() => null),
      ])
      // Om all_events-endpointen svarar, använd den fullständiga listan men behåll
      // fält som Apps Script saknar (t.ex. pricing) från den ordinarie proxyn.
      const mergedData: AllDataResponse = allEventsResult
        ? { ...data, events: { ...data.events, events: mergeEvents(data.events.events, allEventsResult.events) } }
        : data
      writeBootstrapCache(key, mergedData)
      writeBootstrapCache(eventsKey, mergedData.events)
      writeBootstrapCache(bookingsKey, mergedData.bookings)
      writeBootstrapCache(duplicatesKey, mergedData.duplicates)
      return mergedData
    },
    initialData: () => readBootstrapCache<AllDataResponse>(key),
    initialDataUpdatedAt: () => readBootstrapTimestamp(key),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

function mergeEvents(proxyEvents: Event[], allEvents: Event[]): Event[] {
  const proxyById = new Map(proxyEvents.map((event) => [String(event.id), event]))
  const merged = allEvents.map((event) => {
    const proxyEvent = proxyById.get(String(event.id))
    return proxyEvent ? { ...proxyEvent, ...event, pricing: event.pricing ?? proxyEvent.pricing } : event
  })

  // Apps Script-listan (all_events) kan sakna nyligen skapade events som redan
  // finns i CogWork-proxyns cache. Lägg till dem så de inte tappas helt.
  const allEventIds = new Set(allEvents.map((event) => String(event.id)))
  const onlyInProxy = proxyEvents.filter((event) => !allEventIds.has(String(event.id)))

  return [...merged, ...onlyInProxy]
}
