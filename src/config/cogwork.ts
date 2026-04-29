/**
 * Event-grupp-IDs (primaryEventGroup.id) som exkluderas från
 * "Dubbelanmäld"-varningar. En deltagare räknas inte som dubbelanmäld
 * om deras övriga bokningar alla tillhör dessa grupper.
 */
export const EXCLUDED_DUPLICATE_GROUP_IDS: number[] = [
  18358, // Föreställningar
]

export const EVENT_BLOCK_IDS_BY_CODE: Record<string, string> = {
  VT26: '18402',
  HT26: '19459',
}

export function getDefaultEventBlockId(date = new Date()): string {
  const year = String(date.getFullYear()).slice(2)
  const term = date.getMonth() < 6 ? 'VT' : 'HT'
  return EVENT_BLOCK_IDS_BY_CODE[`${term}${year}`] ?? ''
}
