/**
 * Extracts the dance style from a CogWork event name.
 * Course names follow the pattern: "Jazz - Nybörjare, 7-9 år"
 * → returns "Jazz"
 */
export function categoryFromEventName(name: string): string {
  const idx = name.indexOf(' - ')
  if (idx > 0) return name.slice(0, idx).trim()
  return name.split(',')[0].trim()
}

/** Build a sorted, unique list of categories from an events array */
export function categoriesFromEvents(
  events: { name: string; primaryEventGroup?: { id: number; name: string } }[],
): { id: string; name: string }[] {
  const seen = new Map<string, string>()

  for (const e of events) {
    // Prefer primaryEventGroup if available
    if (e.primaryEventGroup?.name) {
      const key = `group:${e.primaryEventGroup.id}`
      if (!seen.has(key)) seen.set(key, e.primaryEventGroup.name)
    } else {
      const name = categoryFromEventName(e.name)
      if (name && !seen.has(name)) seen.set(name, name)
    }
  }

  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}
