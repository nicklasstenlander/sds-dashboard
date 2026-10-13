// Kontroller för fliken "Föreställningar" (ordern "Föreställningar-
// statistik från Rideau till CORE" 2026-10-13, Fas 3). Repot har inget
// befintligt testramverk (ingen vitest/jest, inga *.test.*-filer) - det
// här kör den RIKTIGA src/utils/rideauStats.ts direkt via Node:s
// inbyggda TS-stripping (node scripts/check-forestallningar.ts, ingen
// build behövs - type-only-importen mot ../types/rideauStats raderas
// helt vid strippingen, inget modulnamn behöver ens lösas).
//
// Kör: node scripts/check-forestallningar.ts

import {
  describeRideauStatsError,
  filterEvents,
  formatEventDate,
  formatOreAsSek,
  formatUpdatedAt,
  isMarkedStatus,
  shouldShowEvent,
  sortEvents,
  statusLabel,
} from '../src/utils/rideauStats.ts'

// date-fns format() använder processens lokala tidszon - fixera den så
// testet ger samma resultat oavsett vilken maskin det körs på (inte bara
// "råkar funka" på en dator redan satt till svensk tid).
process.env.TZ = 'Europe/Stockholm'

let failures = 0
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} - fick ${JSON.stringify(actual)}, väntade ${JSON.stringify(expected)}`)
  if (!ok) failures++
}
function assertTrue(actual: unknown, label: string) {
  assertEqual(Boolean(actual), true, label)
}

function makeEvent(overrides: Partial<Parameters<typeof shouldShowEvent>[0]> = {}) {
  return {
    event_id: 'e1',
    slug: 'test',
    title: 'Testföreställning',
    starts_at: null,
    status: 'published' as const,
    capacity: 100,
    sold: 0,
    checked_in: 0,
    revenue_ore: 0,
    by_ticket_type: [],
    by_day: [],
    ...overrides,
  }
}

// === 1. formatOreAsSek (öre -> SEK) ===
assertEqual(formatOreAsSek(12345), '123 kr', '12345 öre -> "123 kr" (avrundat)')
assertEqual(formatOreAsSek(0), '0 kr', '0 öre -> "0 kr"')
assertEqual(formatOreAsSek(100000), '1 000 kr', '100000 öre -> "1 000 kr" (svensk tusentalsavgränsning, NBSP)')

// === 2. formatEventDate (null-datum) ===
assertEqual(formatEventDate(null), 'Inget datum satt', 'null starts_at -> "Inget datum satt"')
assertEqual(formatEventDate('inte-ett-datum'), 'Inget datum satt', 'Ogiltigt datum -> "Inget datum satt", kraschar inte')
assertTrue(formatEventDate('2026-12-24T18:00:00+00:00').length > 0, 'Giltigt datum -> en icke-tom sträng')
assertTrue(!formatEventDate('2026-12-24T18:00:00+00:00').includes('1970'), 'Ett giltigt datum tolkas aldrig som epoch (new Date(null)-fällan)')

// === 3. formatUpdatedAt ===
assertEqual(formatUpdatedAt(null), '', 'null cached_at -> tom sträng (inget krasch)')
assertEqual(formatUpdatedAt(undefined), '', 'undefined cached_at -> tom sträng')
assertEqual(formatUpdatedAt('2026-10-13T14:05:00+00:00'), '16:05', 'Giltig ISO-tid -> HH:MM i lokal (svensk, UTC+2 i oktober) tid')

// === 4. Filtrering ===
assertEqual(shouldShowEvent(makeEvent({ status: 'cancelled' }), { showCancelled: false }), false, 'Avbokad utesluts som standard')
assertEqual(shouldShowEvent(makeEvent({ status: 'cancelled' }), { showCancelled: true }), true, 'Avbokad visas när showCancelled=true')
assertEqual(shouldShowEvent(makeEvent({ status: 'draft', sold: 0 }), { showCancelled: false }), false, 'Utkast utan sälj utesluts alltid')
assertEqual(shouldShowEvent(makeEvent({ status: 'draft', sold: 3 }), { showCancelled: false }), true, 'Utkast MED sälj visas (även om showCancelled=false)')
assertEqual(shouldShowEvent(makeEvent({ status: 'published' }), { showCancelled: false }), true, 'Publicerad visas alltid')

const mixedEvents = [
  makeEvent({ event_id: 'cancelled-1', status: 'cancelled' }),
  makeEvent({ event_id: 'draft-empty', status: 'draft', sold: 0 }),
  makeEvent({ event_id: 'draft-with-sales', status: 'draft', sold: 2 }),
  makeEvent({ event_id: 'published-1', status: 'published' }),
]
assertEqual(
  filterEvents(mixedEvents, { showCancelled: false }).map((e) => e.event_id),
  ['draft-with-sales', 'published-1'],
  'filterEvents (showCancelled=false): bara utkast-med-sälj och publicerad kvar',
)
assertEqual(
  filterEvents(mixedEvents, { showCancelled: true }).map((e) => e.event_id),
  ['cancelled-1', 'draft-with-sales', 'published-1'],
  'filterEvents (showCancelled=true): avbokad kvar också',
)

// === 5. Sortering: kommande (stigande) -> passerade (fallande) -> utan datum ===
const now = new Date('2026-10-13T12:00:00+00:00')
const sortInput = [
  makeEvent({ event_id: 'no-date', starts_at: null }),
  makeEvent({ event_id: 'past-older', starts_at: '2026-01-01T12:00:00+00:00' }),
  makeEvent({ event_id: 'future-far', starts_at: '2027-01-01T12:00:00+00:00' }),
  makeEvent({ event_id: 'past-newer', starts_at: '2026-06-01T12:00:00+00:00' }),
  makeEvent({ event_id: 'future-near', starts_at: '2026-10-20T12:00:00+00:00' }),
]
assertEqual(
  sortEvents(sortInput, now).map((e) => e.event_id),
  ['future-near', 'future-far', 'past-newer', 'past-older', 'no-date'],
  'Sortering: kommande stigande, därefter passerade (senaste först), därefter utan datum sist',
)

// === 6. Statusetikett + "märkt tydligt" ===
assertEqual(statusLabel('cancelled'), 'Avbokad', "statusLabel('cancelled')")
assertEqual(statusLabel('draft'), 'Utkast', "statusLabel('draft')")
assertEqual(statusLabel('published'), 'Publicerad', "statusLabel('published')")
assertTrue(isMarkedStatus('cancelled'), 'cancelled ska få den gråa "märkt tydligt"-behandlingen')
assertTrue(isMarkedStatus('draft'), 'draft ska få den gråa "märkt tydligt"-behandlingen')
assertTrue(!isMarkedStatus('published'), 'published ska INTE märkas grått')

// === 7. Felmeddelanden (403 särbehandlas, allt annat generiskt) ===
assertEqual(describeRideauStatsError(403), 'Du saknar behörighet', '403 -> eget, specifikt meddelande')
assertEqual(describeRideauStatsError(502), 'Kunde inte hämta statistik', '502 -> generiskt felmeddelande')
assertEqual(describeRideauStatsError(503), 'Kunde inte hämta statistik', '503 -> generiskt felmeddelande')
assertEqual(describeRideauStatsError(undefined), 'Kunde inte hämta statistik', 'Okänt/nätverksfel -> generiskt felmeddelande')

console.log(`\n${failures === 0 ? 'Alla kontroller gick igenom.' : `${failures} kontroll(er) misslyckades.`}`)
if (failures > 0) process.exit(1)
