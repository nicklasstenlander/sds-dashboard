/**
 * Kontraktet för GET /public/catalog på sds-cogwork-proxy.
 *
 * Används av workers/sds-cogwork-proxy/worker.test.mjs och av
 * `node scripts/secure-cogwork-proxy.mjs --self-check`. All data här är påhittad.
 */

import { pathToFileURL } from 'node:url'

// Samma som TERM_IDS i workern (TERMS med aggregate:true).
export const TERM_IDS = ['18402', '19459', '20430']
const TERM_BASE = { 19459: 1000, 18402: 2000, 20430: 3000 }
const TERM_PREFIX = { 19459: 'HT26-', 18402: 'VT26-', 20430: 'VT27-' }
const TERM_NAME = { 19459: 'Höstterminen 2026', 18402: 'Vårterminen 2026', 20430: 'Vårterminen 2027' }

// Nycklar som aldrig får förekomma någonstans i svaret, på någon nivå.
export const FORBIDDEN_KEYS = [
  'participants', 'participant', 'bookings', 'booking', 'duplicates',
  'email', 'emails', 'contactEmail', 'phone', 'phones', 'mobile',
  'personalNumber', 'personnummer', 'ssn', 'dateOfBirth', 'birthDate',
  'address', 'addresses', 'payment', 'payments', 'invoice',
  'creator', 'hiddenStaff', 'publicInstructors', 'staff', 'instructors',
  'note', 'notes', 'internalNote', 'comment', 'person', 'user', 'users', 'key', 'uid',
]

// Exakt de nycklar som får finnas. Allt annat är ett kontraktsbrott.
export const ALLOWED_TOP = ['generatedAt', 'stale', 'terms', 'events']
export const ALLOWED_TERM = ['id', 'name']
export const ALLOWED_EVENT = {
  id: null, termId: null, name: null, code: null, longdescription: null,
  category: { id: null, name: null },
  place: null, instructorsName: null,
  pricing: { currency: null, basePriceInclVat: null },
  registration: { status: null, statusName: null, statusText: null, showing: null, open: null },
  schedule: {
    dayAndTimeInfo: null,
    start: { date: null, time: null, dayOfWeek: null },
    end: { date: null, time: null, dayOfWeek: null },
    numberOfPlannedOccasions: null,
    numberOfScheduledOccasions: null,
  },
  statistics: { accepted: null },
  requirements: { minAge: null, maxAge: null, maxParticipants: null },
  grouping: {
    eventBlock: { id: null, name: null },
    primaryEventGroup: { id: null, name: null },
    additionalEventGroups: [{ id: null, name: null }],
  },
  spotsLeft: null,
  bookingUrl: null,
}

// Påhittade personuppgifter som fixturen planterar. Ingen av strängarna får läcka ut.
export const PLANTED_PII = [
  'lärare.privat@example.com',
  'skapare@example.com',
  '070-000 00 00',
  '19990101-0000',
  'Dold Personal',
  'Skapare Skaparsson',
  'Deltagare Deltagarsson',
  'INTERN-ANTECKNING',
  'HEMLIGT-PW',
  'test-key', // env.COGWORK_API_KEY i makeEnv()
]

function rawEvent(id, termId, overrides = {}) {
  return {
    id,
    key: 'eventkey' + id,
    created: '2026-04-15 10:11:55',
    creator: { id: 77, key: 'k', name: 'Skapare Skaparsson', email: 'skapare@example.com' },
    code: TERM_PREFIX[termId] + id,
    uid: id + '.event@cogwork.se',
    source: 'https://dans.se/event/' + id + '?org=sollentunadans&pw=HEMLIGT-PW',
    name: 'Balett ' + id,
    category: { id: 1, name: '' },
    place: 'Sal 1',
    contactEmail: 'lärare.privat@example.com',
    pricing: { currency: 'SEK', basePriceInclVat: 1795, internalNote: 'INTERN-ANTECKNING' },
    registration: {
      hidden: false, status: 'DIRECT', showing: true, open: true,
      url: 'https://dans.se/sollentunadans/shop/new?event=' + id + '&pw=HEMLIGT-PW',
      statusName: 'Direct', statusText: 'Direct registration',
      periods: { startShowing: '2026-04-20 00:00:00' },
    },
    schedule: {
      dayAndTimeInfo: 'Tisdag 16:00',
      start: { date: '2026-08-31', time: '16:00:00', dayOfWeek: '2' },
      end: { date: '2026-12-15', time: '17:00:00', dayOfWeek: '2' },
      numberOfPlannedOccasions: 15,
      numberOfScheduledOccasions: 0,
      occasions: [{ startDateTime: '2026-08-31 16:00', note: 'INTERN-ANTECKNING' }],
    },
    statistics: { accepted: 12, participants: [{ name: 'Deltagare Deltagarsson' }] },
    grouping: {
      eventBlock: { key: 'b', id: Number(termId), name: TERM_NAME[termId] },
      primaryEventGroup: { key: 'g', id: 17844, name: 'Barn' },
      additionalEventGroups: [{ key: 'a', id: '19899', name: 'Dansprogram - kurser HT26', phone: '070-000 00 00' }],
    },
    requirements: { minAge: 7, maxAge: 9, maxParticipants: 15 },
    longdescription: '<p>Klassisk balett. <a href="https://dans.se/sollentunadans/shop/new?event=' + id + '&pw=HEMLIGT-PW">Boka</a></p>',
    instructorsName: 'Förnamn Efternamn',
    publicInstructors: [{ title: 'Lärare', person: { id: 1, key: 'p', name: 'Förnamn Efternamn', email: 'lärare.privat@example.com' } }],
    hiddenStaff: [{ name: 'Dold Personal', personalNumber: '19990101-0000' }],
    participants: [{ name: 'Deltagare Deltagarsson', dateOfBirth: '2018-01-01' }],
    ...overrides,
  }
}

// all_<termin> som cron lägger i KV: events + bokningar med personuppgifter.
export function rawAllForTerm(termId) {
  const base = TERM_BASE[termId]
  return {
    bookings: { bookings: [{ id: 1, participant: { name: 'Deltagare Deltagarsson', dateOfBirth: '2018-01-01', email: 'skapare@example.com' } }] },
    events: {
      events: [
        rawEvent(base + 1, termId),
        rawEvent(base + 2, termId, { registration: { showing: false, hidden: false, status: 'DIRECT' }, name: 'DOLD-KURS-showing' }),
        rawEvent(base + 3, termId, { registration: { showing: true, hidden: true, status: 'DIRECT' }, name: 'DOLD-KURS-hidden' }),
        rawEvent(base + 4, termId, { statistics: { accepted: 20 }, requirements: { minAge: 15, maxParticipants: 18 } }),
      ],
    },
    duplicates: { bookings: [] },
    cachedAt: new Date().toISOString(),
  }
}

export const HIDDEN_EVENT_NAMES = ['DOLD-KURS-showing', 'DOLD-KURS-hidden']

export function makeKv(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    store,
    reads: 0,
    async get(key) { this.reads++; return store.has(key) ? store.get(key) : null },
    async put(key, value) { store.set(key, value) },
    async delete(key) { store.delete(key) },
    async list() { return { keys: [...store.keys()].map((name) => ({ name })) } },
  }
}

export function makeEnv(kvInitial = {}) {
  return {
    COGWORK_API_KEY: 'test-key',
    COGWORK_CACHE: makeKv(kvInitial),
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon',
    DB: {
      prepare() {
        throw new Error('DB ska inte användas av /public/catalog')
      },
    },
  }
}

export function warmedKv() {
  return Object.fromEntries(TERM_IDS.map((id) => ['all_' + id, JSON.stringify(rawAllForTerm(id))]))
}

export function makeCtx() {
  const pending = []
  return { pending, waitUntil(p) { pending.push(p) }, async settle() { await Promise.allSettled(pending) } }
}

/** Alla nyckelvägar i ett JSON-värde, t.ex. "events[].pricing.currency". */
export function keyPaths(value, prefix = '') {
  if (Array.isArray(value)) return value.flatMap((v) => keyPaths(v, prefix + '[]'))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => {
      const p = prefix ? `${prefix}.${k}` : k
      return [p, ...keyPaths(v, p)]
    })
  }
  return []
}

function allowedPaths() {
  return new Set(keyPaths({
    generatedAt: '', stale: false,
    terms: [Object.fromEntries(ALLOWED_TERM.map((k) => [k, null]))],
    events: [ALLOWED_EVENT],
  }))
}

/** Returnerar en lista med kontraktsbrott (tom lista = OK). */
export function contractViolations(body) {
  const problems = []
  const allowed = allowedPaths()
  for (const path of new Set(keyPaths(body))) {
    if (!allowed.has(path)) problems.push(`otillåten nyckel: ${path}`)
    const leaf = path.split('.').pop().replace('[]', '')
    if (FORBIDDEN_KEYS.includes(leaf)) problems.push(`förbjuden nyckel: ${path}`)
  }
  const text = JSON.stringify(body)
  for (const pii of PLANTED_PII) if (text.includes(pii)) problems.push(`personuppgift läckte: ${pii}`)
  if (/[?&]pw=/i.test(text)) problems.push('pw-parameter i svaret')
  for (const e of body.events ?? []) {
    if (e.bookingUrl !== `https://dans.se/sollentunadans/shop/new?event=${e.id}`) problems.push(`oväntad bookingUrl: ${e.bookingUrl}`)
  }
  for (const hidden of HIDDEN_EVENT_NAMES) if (text.includes(hidden)) problems.push(`dold kurs läckte: ${hidden}`)
  return problems
}

export async function loadWorker(workerPath) {
  // Ny modulinstans per anrop, så isolate-state (cache-löften, rate limit) inte delas.
  const mod = await import(pathToFileURL(workerPath).href + '?t=' + Date.now() + Math.random())
  return mod.default
}

/** Självtest utan nätverk. Kastar vid fel. */
export async function selfCheckPublicCatalog(workerPath) {
  const worker = await loadWorker(workerPath)
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    throw new Error('Oväntat nätverksanrop i självtest: ' + String(url).replace(/pw=[^&]+/, 'pw=***'))
  }
  try {
    const env = makeEnv(warmedKv())
    const res = await worker.fetch(new Request('https://w.test/public/catalog'), env, makeCtx())
    if (res.status !== 200) throw new Error(`/public/catalog utan token gav ${res.status}, väntade 200`)
    const body = await res.json()
    const problems = contractViolations(body)
    if (problems.length) throw new Error('Kontraktsbrott:\n  ' + problems.join('\n  '))
    if (body.events.length !== 2 * TERM_IDS.length) throw new Error(`väntade ${2 * TERM_IDS.length} synliga kurser, fick ${body.events.length}`)

    const post = await worker.fetch(new Request('https://w.test/public/catalog', { method: 'POST' }), env, makeCtx())
    if (post.status !== 405) throw new Error(`POST /public/catalog gav ${post.status}, väntade 405`)

    for (const path of ['/?type=bookings', '/?type=duplicates', '/cogwork/bookings?eventId=1', '/cogwork/users?name=a', '/goals', '/public/catalog/']) {
      const r = await worker.fetch(new Request('https://w.test' + path), makeEnv(warmedKv()), makeCtx())
      if (r.status !== 401) throw new Error(`${path} utan token gav ${r.status}, väntade 401`)
    }
  } finally {
    globalThis.fetch = realFetch
  }
}
