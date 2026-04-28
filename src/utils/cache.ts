// TTL för sessionStorage-cachen — samma som TanStack Query staleTime
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * Stale-while-revalidate-wrapper för fetch-anrop.
 * Returnerar cachat svar direkt om det finns och är färskt (< 5 min),
 * annars hämtas nytt svar och sparas i sessionStorage.
 * Cachen överlever sidrefresh, till skillnad från TanStack Querys in-memory-cache.
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const raw = sessionStorage.getItem(cacheKey)
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry<T>
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.data
      }
    }
  } catch {
    // Om sessionStorage är otillgängligt eller JSON är korrupt — fortsätt med fetch
  }

  const data = await fetcher()

  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    sessionStorage.setItem(cacheKey, JSON.stringify(entry))
  } catch {
    // sessionStorage kan vara fullt — ignorera
  }

  return data
}

/** Nyckelprefix för att undvika krockar med andra appar på samma origin */
const PREFIX = 'sds_cache_'

export function cacheKey(...parts: (string | number | boolean | undefined)[]): string {
  return PREFIX + parts.filter(Boolean).join('_')
}
