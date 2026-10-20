/**
 * Event-grupp-IDs (primaryEventGroup.id) som exkluderas från
 * "Dubbelanmäld"-varningar. En deltagare räknas inte som dubbelanmäld
 * om deras övriga bokningar alla tillhör dessa grupper.
 */
export const EXCLUDED_DUPLICATE_GROUP_IDS: number[] = [
  18358, // Föreställningar
]

// Alla terminer som ska gå att välja i periodfiltret, även efter att CogWork
// slutat lista terminens kurser. Lägg till nya terminer här.
export const EVENT_BLOCK_IDS_BY_CODE: Record<string, string> = {
  HT25: '17665',
  VT26: '18402',
  HT26: '19459',
  VT27: '20430',
}

export function getDefaultEventBlockId(date = new Date()): string {
  const year = String(date.getFullYear()).slice(2)
  const term = date.getMonth() < 6 ? 'VT' : 'HT'
  return EVENT_BLOCK_IDS_BY_CODE[`${term}${year}`] ?? ''
}
