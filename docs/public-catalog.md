# Publik kurskatalog: `GET /public/catalog`

Token-fri, skrivskyddad endpoint på `sds-cogwork-proxy` för utloggade besökare
(iOS `CourseCatalogView` i `.public`-läge, webben). Källa:
`workers/sds-cogwork-proxy/worker.js` (`handlePublicCatalogRoute`, `publicCatalogEvent`).

```
GET https://sds-cogwork-proxy.nicklas-stenlander.workers.dev/public/catalog
```

## Beteende

| | |
|---|---|
| Autentisering | Ingen. Rutten skickas vidare före `requireStaff`, oavsett `AUTH_MODE`. En `Authorization`-header ignoreras. |
| Metoder | `GET`. `OPTIONS` (CORS-preflight) ger 204. Allt annat ger 405 och `Allow: GET, OPTIONS`. |
| Källa | CogWork `/events/` för `TERM_IDS`, läst ur `all_<termin>` som cron (`*/9`) redan värmer. |
| Synlighet | Bara kurser med `registration.showing !== false` och `registration.hidden !== true`. |
| Cache | KV `public:catalog:v1`, färsk i `CACHE_TTL` (600 s) och sparad i 7 dagar som reserv. Cron bygger om den var 9:e minut. `Cache-Control: public, max-age=60`. |
| Cachemiss | En hämtning per isolate (samtidiga anrop delar på samma löfte). CogWork anropas bara för en termin som saknas i KV. |
| Fel | CogWork-fel med äldre cache: 200 med `"stale": true`. Utan cache: 502, `{"error": "Kurskatalogen kunde inte hämtas just nu. Försök igen senare."}`. |
| Rate limit | 120 anrop per minut per IP (`CF-Connecting-IP`) och isolate, därefter 429 och `Retry-After: 60`. Ett globalt tak kräver en WAF-regel i Cloudflare. |
| CORS | `Access-Control-Allow-Origin` speglas för `core.sollentunadansochscenskola.se`, `sollentunadansochscenskola.se`, `www.sollentunadansochscenskola.se`, `localhost:5173`, `127.0.0.1:5173`. Native iOS skickar ingen Origin och påverkas inte. |

## Svar (200)

Händelserna har samma nästlade form som iOS-modellen `Event` (`CORE/Models.swift`),
så `PublicCatalogResponse` avkodar svaret utan ändringar. Alla fält utom `id`,
`termId` och `bookingUrl` kan vara `null`.

```json
{
  "generatedAt": "2026-10-22T18:00:00.000Z",
  "stale": false,
  "terms": [
    { "id": "18402", "name": "Vårterminen 2026" },
    { "id": "19459", "name": "Höstterminen 2026" }
  ],
  "events": [
    {
      "id": 279967,
      "termId": "19459",
      "name": "Balett 7-9 år",
      "code": "HT26-BA79",
      "longdescription": "<p>…</p>",
      "category": { "id": 1, "name": "" },
      "place": "Sal 1",
      "instructorsName": "Förnamn Efternamn",
      "pricing": { "currency": "SEK", "basePriceInclVat": 1795 },
      "registration": { "status": "DIRECT", "statusName": "Direct", "statusText": "Direct registration", "showing": true, "open": true },
      "schedule": {
        "dayAndTimeInfo": "Tisdag 16:00",
        "start": { "date": "2026-08-31", "time": "16:00:00", "dayOfWeek": "2" },
        "end": { "date": "2026-12-15", "time": "17:00:00", "dayOfWeek": "2" },
        "numberOfPlannedOccasions": 15,
        "numberOfScheduledOccasions": 0
      },
      "statistics": { "accepted": 12 },
      "requirements": { "minAge": 7, "maxAge": 9, "maxParticipants": 15 },
      "grouping": {
        "eventBlock": { "id": 19459, "name": "Höstterminen 2026" },
        "primaryEventGroup": { "id": 17844, "name": "Barn" },
        "additionalEventGroups": [{ "id": "19899", "name": "Dansprogram - kurser HT26" }]
      },
      "spotsLeft": 3,
      "bookingUrl": "https://dans.se/sollentunadans/shop/new?event=279967"
    }
  ]
}
```

| Fält | Typ | Kommentar |
|---|---|---|
| `generatedAt` | string (ISO 8601) | När katalogen byggdes. |
| `stale` | bool | `true` om svaret är äldre än 10 min (CogWork svarar inte). |
| `terms[].id` / `.name` | string / string | Terminer i katalogen (`TERM_IDS`). |
| `events[].id` | int | CogWork event-id. |
| `events[].termId` | string | Terminens eventBlockId. |
| `name`, `code`, `longdescription`, `place`, `instructorsName` | string? | `longdescription` är HTML från CogWork. `instructorsName` är lärarnas namn (publikt på dans.se). |
| `category` | `{ id: int?, name: string? }` | |
| `pricing` | `{ currency: string?, basePriceInclVat: number? }` | |
| `registration` | `{ status, statusName, statusText: string?, showing, open: bool? }` | |
| `schedule` | `{ dayAndTimeInfo: string?, start/end: { date, time, dayOfWeek: string? }, numberOfPlannedOccasions, numberOfScheduledOccasions: int? }` | `dayOfWeek` är en sträng, "1" = måndag. |
| `statistics.accepted` | int? | Antal antagna (aggregat, inga namn). |
| `requirements` | `{ minAge, maxAge, maxParticipants: int? }` | |
| `grouping` | `{ eventBlock, primaryEventGroup: { id: int\|string, name: string? }?, additionalEventGroups: [{ id, name }] }` | `id` är int eller sträng (iOS `FlexibleID`). |
| `spotsLeft` | int? | `max(0, maxParticipants - accepted)`, `null` om något saknas. |
| `bookingUrl` | string | `https://dans.se/sollentunadans/shop/new?event=<id>` |

## Aldrig i svaret

Svaret byggs fält för fält. Allt som inte står ovan tappas, bland annat deltagare,
bokningar, `contactEmail`, `creator`, `hiddenStaff`, `publicInstructors`, nycklar
(`key`, `uid`), telefon, personnummer, födelsedatum, betalningsdata och interna anteckningar.
Detta testas mot en fixtur med planterade personuppgifter:

```
npm run test:worker
node scripts/secure-cogwork-proxy.mjs --self-check
```
