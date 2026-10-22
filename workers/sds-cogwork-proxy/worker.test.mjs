// node --test workers/sds-cogwork-proxy/
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TERM_IDS, contractViolations, loadWorker, makeCtx, makeEnv, rawAllForTerm, warmedKv,
} from '../../scripts/public-catalog-contract.mjs'

const WORKER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'worker.js')
const realFetch = globalThis.fetch
let worker
let cogworkCalls

// Mockad CogWork: /events/ svarar med fixturens events för eventBlockId. Allt annat nätverk är fel.
function mockCogwork({ fail = false, delayMs = 0 } = {}) {
  cogworkCalls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.hostname !== 'dans.se') throw new Error('oväntat nätverksanrop: ' + url.hostname)
    cogworkCalls.push(url.pathname + '?eventBlockId=' + url.searchParams.get('eventBlockId'))
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    if (fail) return new Response('fel', { status: 503 })
    const blockId = url.searchParams.get('eventBlockId')
    if (url.pathname === '/api/public/events/') return Response.json(rawAllForTerm(blockId).events)
    return Response.json({ bookings: [] })
  }
}

const get = (path, init) => new Request('https://w.test' + path, init)

beforeEach(async () => {
  worker = await loadWorker(WORKER_PATH)
  mockCogwork()
})
afterEach(() => { globalThis.fetch = realFetch })

test('svarar utan Authorization-header, från cron-värmd KV, utan CogWork-anrop', async () => {
  const env = makeEnv(warmedKv())
  const res = await worker.fetch(get('/public/catalog'), env, makeCtx())
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60')
  const body = await res.json()
  assert.deepEqual(body.terms, [
    { id: '18402', name: 'Vårterminen 2026' },
    { id: '19459', name: 'Höstterminen 2026' },
    { id: '20430', name: 'Vårterminen 2027' },
  ])
  assert.equal(cogworkCalls.length, 0)
})

test('svaret innehåller bara allowlistade fält och inga personuppgifter', async () => {
  const res = await worker.fetch(get('/public/catalog'), makeEnv(warmedKv()), makeCtx())
  const body = await res.json()
  assert.deepEqual(contractViolations(body), [])
  const e = body.events.find((ev) => ev.id === 1001)
  assert.equal(e.termId, '19459')
  assert.equal(e.spotsLeft, 3)
  assert.equal(e.bookingUrl, 'https://dans.se/sollentunadans/shop/new?event=1001')
  assert.equal(e.instructorsName, 'Förnamn Efternamn')
  assert.equal(e.grouping.primaryEventGroup.name, 'Barn')
  assert.equal(e.schedule.start.dayOfWeek, '2')
})

test('bookingUrl byggs av id, aldrig av CogWorks länkar, och pw= läcker inte', async () => {
  const body = await (await worker.fetch(get('/public/catalog'), makeEnv(warmedKv()), makeCtx())).json()
  const text = JSON.stringify(body)
  assert.doesNotMatch(text, /pw=/i)
  assert.doesNotMatch(text, /HEMLIGT-PW|test-key/)
  for (const e of body.events) assert.equal(e.bookingUrl, `https://dans.se/sollentunadans/shop/new?event=${e.id}`)
  const e = body.events.find((ev) => ev.id === 1001)
  assert.equal(e.longdescription, '<p>Klassisk balett. <a href="https://dans.se/sollentunadans/shop/new?event=1001&">Boka</a></p>')
})

test('dolda kurser (showing:false eller hidden:true) exkluderas', async () => {
  const body = await (await worker.fetch(get('/public/catalog'), makeEnv(warmedKv()), makeCtx())).json()
  const ids = body.events.map((e) => e.id).sort()
  assert.deepEqual(ids, [1001, 1004, 2001, 2004, 3001, 3004])
})

test('fullt event blir 0 lediga platser, aldrig negativt', async () => {
  const kv = warmedKv()
  const all = rawAllForTerm('19459')
  all.events.events[0].statistics.accepted = 99
  kv.all_19459 = JSON.stringify(all)
  const body = await (await worker.fetch(get('/public/catalog'), makeEnv(kv), makeCtx())).json()
  assert.equal(body.events.find((e) => e.id === 1001).spotsLeft, 0)
})

test('POST, PUT, DELETE och PATCH ger 405', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await worker.fetch(get('/public/catalog', { method }), makeEnv(warmedKv()), makeCtx())
    assert.equal(res.status, 405, method)
    assert.equal(res.headers.get('Allow'), 'GET, OPTIONS')
    assert.match((await res.json()).error, /Metoden stöds inte/)
  }
})

test('andra anropet läser cachen: inga fler KV-läsningar av all_* och inga CogWork-anrop', async () => {
  const env = makeEnv({}) // tom KV: första anropet måste hämta
  await worker.fetch(get('/public/catalog'), env, makeCtx())
  assert.equal(cogworkCalls.length, TERM_IDS.length)
  const readsAfterFirst = env.COGWORK_CACHE.reads
  const res = await worker.fetch(get('/public/catalog'), env, makeCtx())
  assert.equal(res.status, 200)
  assert.equal(cogworkCalls.length, TERM_IDS.length, 'inget nytt CogWork-anrop')
  assert.equal(env.COGWORK_CACHE.reads - readsAfterFirst, 1, 'bara katalognyckeln läses')
})

test('samtidiga cachemissar delar på en enda hämtning', async () => {
  mockCogwork({ delayMs: 20 })
  const env = makeEnv({})
  const results = await Promise.all(
    Array.from({ length: 10 }, () => worker.fetch(get('/public/catalog'), env, makeCtx())),
  )
  assert.ok(results.every((r) => r.status === 200))
  assert.equal(cogworkCalls.length, TERM_IDS.length, 'en hämtning per termin, inte per request')
})

test('CogWork-fel med gammal cache: svarar 200 med stale:true', async () => {
  const env = makeEnv({})
  await worker.fetch(get('/public/catalog'), env, makeCtx())
  const stored = JSON.parse(env.COGWORK_CACHE.store.get('public:catalog:v1'))
  stored.generatedAt = new Date(Date.now() - 3600e3).toISOString()
  env.COGWORK_CACHE.store.set('public:catalog:v1', JSON.stringify(stored))
  for (const id of TERM_IDS) env.COGWORK_CACHE.store.delete('all_' + id)
  mockCogwork({ fail: true })
  const ctx = makeCtx()
  const res = await worker.fetch(get('/public/catalog'), env, ctx)
  await ctx.settle()
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.stale, true)
  assert.equal(body.events.length, 2 * TERM_IDS.length)
})

test('termin där CogWork utelämnar events-nyckeln ger tom lista, inte fel', async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    cogworkCalls.push(url.pathname)
    const blockId = url.searchParams.get('eventBlockId')
    return Response.json(blockId === '20430' ? { search: { numRowsFound: 0 } } : rawAllForTerm(blockId).events)
  }
  const res = await worker.fetch(get('/public/catalog'), makeEnv({}), makeCtx())
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.events.filter((e) => e.termId === '20430').length, 0)
  assert.equal(body.events.length, 4)
})

test('/terms (live strict6) finns kvar och är öppen', async () => {
  const res = await worker.fetch(get('/terms'), makeEnv({}), makeCtx())
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).terms.map((t) => t.code), ['VT27', 'HT26', 'VT26', 'HT25'])
})

test('CogWork-fel utan cache: 502 med svenskt felmeddelande', async () => {
  mockCogwork({ fail: true })
  const res = await worker.fetch(get('/public/catalog'), makeEnv({}), makeCtx())
  assert.equal(res.status, 502)
  assert.equal((await res.json()).error, 'Kurskatalogen kunde inte hämtas just nu. Försök igen senare.')
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
})

test('rate limit per IP: 429 efter 120 anrop per minut, annan IP påverkas inte', async () => {
  const env = makeEnv(warmedKv())
  const from = (ip) => get('/public/catalog', { headers: { 'CF-Connecting-IP': ip } })
  for (let i = 0; i < 120; i++) assert.equal((await worker.fetch(from('203.0.113.1'), env, makeCtx())).status, 200)
  const blocked = await worker.fetch(from('203.0.113.1'), env, makeCtx())
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers.get('Retry-After'), '60')
  assert.match((await blocked.json()).error, /För många förfrågningar/)
  assert.equal((await worker.fetch(from('203.0.113.2'), env, makeCtx())).status, 200)
})

test('CORS: kända origins speglas, okända får ingen Allow-Origin', async () => {
  const env = makeEnv(warmedKv())
  for (const origin of ['https://sollentunadansochscenskola.se', 'https://www.sollentunadansochscenskola.se', 'https://core.sollentunadansochscenskola.se', 'http://localhost:5173']) {
    const res = await worker.fetch(get('/public/catalog', { headers: { Origin: origin } }), env, makeCtx())
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin)
  }
  const evil = await worker.fetch(get('/public/catalog', { headers: { Origin: 'https://evil.example' } }), env, makeCtx())
  assert.equal(evil.status, 200)
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null)
  const preflight = await worker.fetch(get('/public/catalog', { method: 'OPTIONS', headers: { Origin: 'https://sollentunadansochscenskola.se' } }), env, makeCtx())
  assert.equal(preflight.status, 204)
})

test('en (ogiltig) Authorization-header ändrar inget: samma publika svar', async () => {
  const res = await worker.fetch(get('/public/catalog', { headers: { Authorization: 'Bearer skräp' } }), makeEnv(warmedKv()), makeCtx())
  assert.equal(res.status, 200)
  assert.deepEqual(contractViolations(await res.json()), [])
})

test('övriga rutter kräver fortfarande personalroll (401 utan token)', async () => {
  for (const path of ['/?type=bookings', '/?type=duplicates', '/cogwork/bookings?eventId=1', '/cogwork/users?name=a', '/goals', '/purge', '/telavox/calls', '/public/catalog/', '/public']) {
    const res = await worker.fetch(get(path), makeEnv(warmedKv()), makeCtx())
    assert.equal(res.status, 401, path)
  }
  assert.equal(cogworkCalls.length, 0)
})

test('cron (*/9) värmer den publika katalogen', async () => {
  const env = makeEnv({})
  await worker.scheduled({ cron: '*/9 * * * *' }, env, makeCtx())
  const stored = JSON.parse(env.COGWORK_CACHE.store.get('public:catalog:v1'))
  assert.equal(stored.events.length, 2 * TERM_IDS.length)
  assert.deepEqual(contractViolations({ ...stored, stale: false }), [])
})
