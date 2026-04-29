// TTL för fetch-wrappern — samma som TanStack Query staleTime
const CACHE_TTL_MS = 5 * 60 * 1000

// Äldre bootstrap-data får gärna visas direkt för att undvika kalla proxy-hämtningar
// vid första sidöppningen efter några dagar.
const BOOTSTRAP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * Cache-wrapper för fetch-anrop.
 * Returnerar cachat svar direkt om det finns och är färskt (< 5 min),
 * annars hämtas nytt svar och sparas i localStorage.
 * Cachen överlever sidrefresh, till skillnad från TanStack Querys in-memory-cache.
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const entry = readCacheEntry<T>(cacheKey, CACHE_TTL_MS)
  if (entry) return entry.data

  const data = await fetcher()
  writeCacheEntry(cacheKey, data)
  return data
}

export function readBootstrapCache<T>(cacheKey: string): T | undefined {
  return readCacheEntry<T>(cacheKey, BOOTSTRAP_MAX_AGE_MS)?.data
}

export function readBootstrapTimestamp(cacheKey: string): number | undefined {
  return readCacheEntry<unknown>(cacheKey, BOOTSTRAP_MAX_AGE_MS)?.timestamp
}

export function writeBootstrapCache<T>(cacheKey: string, data: T): void {
  writeCacheEntry(cacheKey, data)
}

function readCacheEntry<T>(cacheKey: string, maxAgeMs: number): CacheEntry<T> | undefined {
  try {
    const raw = localStorage.getItem(cacheKey)
    if (!raw) return undefined
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (!entry?.timestamp || Date.now() - entry.timestamp > maxAgeMs) return undefined
    return entry
  } catch {
    return undefined
  }
}

function writeCacheEntry<T>(cacheKey: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() }
    localStorage.setItem(cacheKey, JSON.stringify(entry))
  } catch {
    // localStorage kan vara fullt eller otillgängligt — ignorera
  }
}

/** Nyckelprefix för att undvika krockar med andra appar på samma origin */
const PREFIX = 'sds_cache_'

export function cacheKey(...parts: (string | number | boolean | undefined)[]): string {
  return PREFIX + parts.filter(Boolean).join('_')
}
