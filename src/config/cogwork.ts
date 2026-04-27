/**
 * Event-grupp-IDs (primaryEventGroup.id) som exkluderas från
 * "Dubbelanmäld"-varningar. En deltagare räknas inte som dubbelanmäld
 * om deras övriga bokningar alla tillhör dessa grupper.
 */
export const EXCLUDED_DUPLICATE_GROUP_IDS: number[] = [
  18358, // Föreställningar
]
