// node --test tests/signage/
// Signage-workern: validering och ETag för /api/schedules, städning av fjärrkommandon.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_ID, STAFF_ID, MemoryBucket, createMockSupabase, loadWorker, makeEnv } from './mock-env.mjs'

const realFetch = globalThis.fetch
let worker, bucket, env, supabase, adminToken

const req = (path, init) => new Request('https://w.test' + path, init)

async function putSchedules(body, { token = adminToken, ifMatch, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (ifMatch) headers['If-Match'] = ifMatch
  return worker.fetch(req('/api/schedules', { method: 'PUT', headers, body: raw ?? JSON.stringify(body) }), env)
}

const getSchedules = () => worker.fetch(req('/api/schedules'), env)

beforeEach(async () => {
  worker = await loadWorker()
  bucket = new MemoryBucket()
  env = makeEnv(bucket)
  supabase = await createMockSupabase()
  globalThis.fetch = supabase.fetchMock
  adminToken = await supabase.token(ADMIN_ID)
})
afterEach(() => { globalThis.fetch = realFetch })

// ── Validering ──────────────────────────────────────────────────────────────

test('giltig tidsstyrning sparas rensad: okända fält bort, veckodagar sorterade, tomma poster bort', async () => {
  const res = await putSchedules({
    'reception/a.jpg': {
      dateFrom: '2026-10-27', dateTo: '2026-11-02', timeFrom: '08:00', timeTo: '21:00',
      weekdays: [5, 1, 1, 3], priority: 'high', hemligt: 'x',
    },
    'lounge/b.mp4': { timeFrom: '', weekdays: [] },
    'lounge/c.png': { dateTo: null, timeTo: '23:59' },
  })
  assert.equal(res.status, 200)
  const expected = {
    'reception/a.jpg': {
      dateFrom: '2026-10-27', dateTo: '2026-11-02', timeFrom: '08:00', timeTo: '21:00',
      weekdays: [1, 3, 5], priority: 'high',
    },
    'lounge/c.png': { timeTo: '23:59' },
  }
  assert.deepEqual((await res.json()).schedules, expected)
  assert.deepEqual(bucket.readJson('_schedules.json'), expected)
})

test('tom karta är giltig', async () => {
  const res = await putSchedules({})
  assert.equal(res.status, 200)
  assert.deepEqual(bucket.readJson('_schedules.json'), {})
})

const invalidCases = [
  ['null', null, /måste vara ett objekt/],
  ['array', [], /måste vara ett objekt/],
  ['sträng', 'hej', /måste vara ett objekt/],
  ['okänd skärm i nyckel', { 'news/a.jpg': {} }, /Okänd nyckel "news\/a\.jpg"/],
  ['nyckel utan skärmprefix', { 'a.jpg': {} }, /Okänd nyckel/],
  ['bara skärmprefix', { 'reception/': {} }, /Okänd nyckel/],
  ['post som inte är objekt', { 'reception/a.jpg': 'idag' }, /måste vara ett objekt/],
  ['post som är null', { 'reception/a.jpg': null }, /måste vara ett objekt/],
  ['omöjligt datum', { 'reception/a.jpg': { dateFrom: '2026-02-30' } }, /Ogiltigt datum i dateFrom/],
  ['fel datumformat', { 'reception/a.jpg': { dateTo: '27/10/2026' } }, /Ogiltigt datum i dateTo/],
  ['tid 24:00', { 'reception/a.jpg': { timeTo: '24:00' } }, /Ogiltig tid i timeTo/],
  ['tid utan nolla', { 'reception/a.jpg': { timeFrom: '8:00' } }, /Ogiltig tid i timeFrom/],
  ['veckodag 0', { 'reception/a.jpg': { weekdays: [0] } }, /Ogiltiga veckodagar/],
  ['veckodag 8', { 'reception/a.jpg': { weekdays: [8] } }, /Ogiltiga veckodagar/],
  ['veckodag som decimaltal', { 'reception/a.jpg': { weekdays: [1.5] } }, /Ogiltiga veckodagar/],
  ['veckodag som sträng', { 'reception/a.jpg': { weekdays: ['1'] } }, /Ogiltiga veckodagar/],
  ['veckodagar som inte är array', { 'reception/a.jpg': { weekdays: 1 } }, /Ogiltiga veckodagar/],
  ['över midnatt', { 'reception/a.jpg': { timeFrom: '22:00', timeTo: '02:00' } }, /över midnatt stöds inte/],
  ['startdatum efter slutdatum', { 'reception/a.jpg': { dateFrom: '2026-11-02', dateTo: '2026-10-27' } }, /Startdatum är efter slutdatum/],
  ['okänd prioritet', { 'reception/a.jpg': { priority: 'low' } }, /Ogiltig prioritet/],
]

for (const [name, body, message] of invalidCases) {
  test(`ogiltigt avvisas med 400 och svensk text: ${name}`, async () => {
    await bucket.putJson('_schedules.json', { 'reception/orörd.jpg': { timeTo: '12:00' } })
    const res = await putSchedules(body)
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, message)
    assert.deepEqual(bucket.readJson('_schedules.json'), { 'reception/orörd.jpg': { timeTo: '12:00' } }, 'inget får skrivas vid fel')
  })
}

test('ogiltig JSON avvisas med 400', async () => {
  const res = await putSchedules(null, { raw: '{"reception/a.jpg":' })
  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /inte giltig JSON/)
})

test('för stor body (> 64 kB) avvisas med 400', async () => {
  const big = {}
  for (let i = 0; i < 2000; i++) big[`reception/fil-med-ett-ganska-langt-namn-${i}.jpg`] = { timeFrom: '08:00' }
  const raw = JSON.stringify(big)
  assert.ok(raw.length > 64 * 1024)
  const res = await putSchedules(null, { raw })
  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /för stor/)
  assert.equal(bucket.readJson('_schedules.json'), null)
})

test('PUT kräver admin: utan token 401, personalroll 403, inget skrivs', async () => {
  assert.equal((await putSchedules({}, { token: null })).status, 401)
  const staff = await supabase.token(STAFF_ID)
  assert.equal((await putSchedules({}, { token: staff })).status, 403)
  assert.equal(bucket.readJson('_schedules.json'), null)
})

test('valideringen körs först efter behörighetskontrollen (ingen läcka av valideringsfel)', async () => {
  const res = await putSchedules(null, { token: null })
  assert.equal(res.status, 401)
})

// ── ETag / If-Match ─────────────────────────────────────────────────────────

test('GET ger ETag även när filen saknas, och första sparningen med den ETag:en lyckas', async () => {
  const first = await getSchedules()
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), {})
  const etag = first.headers.get('ETag')
  assert.ok(etag)

  const put = await putSchedules({ 'reception/a.jpg': { timeTo: '12:00' } }, { ifMatch: etag })
  assert.equal(put.status, 200)
  const newEtag = put.headers.get('ETag')
  assert.ok(newEtag && newEtag !== etag)
  assert.equal((await getSchedules()).headers.get('ETag'), newEtag)
})

test('två flikar: den som sparar på en gammal version får 409 och skriver inte över', async () => {
  await bucket.putJson('_schedules.json', {})
  const etag = (await getSchedules()).headers.get('ETag')

  const tabA = await putSchedules({ 'reception/a.jpg': { timeTo: '12:00' } }, { ifMatch: etag })
  assert.equal(tabA.status, 200)

  const tabB = await putSchedules({ 'lounge/b.jpg': { timeTo: '13:00' } }, { ifMatch: etag })
  assert.equal(tabB.status, 409)
  assert.match((await tabB.json()).error, /Någon annan har ändrat tidsstyrningen/)
  assert.deepEqual(bucket.readJson('_schedules.json'), { 'reception/a.jpg': { timeTo: '12:00' } })

  // Efter omhämtning går det bra
  const fresh = (await getSchedules()).headers.get('ETag')
  const retry = await putSchedules({ 'reception/a.jpg': { timeTo: '12:00' }, 'lounge/b.jpg': { timeTo: '13:00' } }, { ifMatch: fresh })
  assert.equal(retry.status, 200)
})

test('If-Match för "saknas" när filen redan finns ger 409', async () => {
  const emptyEtag = (await getSchedules()).headers.get('ETag')
  await bucket.putJson('_schedules.json', { 'reception/a.jpg': { timeTo: '12:00' } })
  assert.equal((await putSchedules({}, { ifMatch: emptyEtag })).status, 409)
})

test('If-Match jämförs utan W/-prefix och citattecken', async () => {
  await bucket.putJson('_schedules.json', {})
  const etag = (await getSchedules()).headers.get('ETag') // "etag-1"
  assert.equal((await putSchedules({}, { ifMatch: 'W/' + etag })).status, 200)
})

test('ändring mellan head() och put() fångas av villkorad skrivning (409)', async () => {
  await bucket.putJson('_schedules.json', {})
  const etag = (await getSchedules()).headers.get('ETag')
  const realHead = bucket.head.bind(bucket)
  bucket.head = async (key) => {
    const meta = await realHead(key)
    await bucket.putJson('_schedules.json', { 'lounge/x.jpg': { timeTo: '10:00' } }) // annan flik hinner före
    return meta
  }
  const res = await putSchedules({ 'reception/a.jpg': { timeTo: '12:00' } }, { ifMatch: etag })
  assert.equal(res.status, 409)
  assert.deepEqual(bucket.readJson('_schedules.json'), { 'lounge/x.jpg': { timeTo: '10:00' } })
})

test('PUT utan If-Match accepteras fortfarande (äldre CORE-flik under övergången)', async () => {
  await bucket.putJson('_schedules.json', { 'reception/a.jpg': { timeTo: '12:00' } })
  assert.equal((await putSchedules({})).status, 200)
})

test('CORS släpper igenom If-Match och exponerar ETag', async () => {
  const pre = await worker.fetch(req('/api/schedules', { method: 'OPTIONS' }), env)
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /If-Match/)
  const get = await getSchedules()
  assert.match(get.headers.get('Access-Control-Expose-Headers'), /ETag/)
})

// ── Fjärrkommandon ──────────────────────────────────────────────────────────

const agent = { Authorization: 'Bearer agent-test', 'Content-Type': 'application/json' }

async function createCommand(type, screen = 'reception') {
  const res = await worker.fetch(req(`/api/screens/${screen}/commands`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  }), env)
  assert.equal(res.status, 200)
  return (await res.json()).commandId
}
const pollNext = async (screen = 'reception') =>
  (await worker.fetch(req(`/api/screens/${screen}/commands/next`, { headers: agent }), env)).json()
const report = (id, status, error, screen = 'reception') =>
  worker.fetch(req(`/api/screens/${screen}/commands/${id}/result`, {
    method: 'POST', headers: agent, body: JSON.stringify({ status, error }),
  }), env)
const lastCommandOf = async (screen = 'reception') => {
  const list = await (await worker.fetch(req('/api/screens'), env)).json()
  return list.find((s) => s.id === screen).lastCommand
}

test('kommando: skapa → hämta → kvittera; kvitterat raderas men syns som lastCommand', async () => {
  const id = await createCommand('screenshot_now')
  assert.deepEqual(await lastCommandOf(), { type: 'screenshot_now', status: 'pending', error: null })

  assert.deepEqual(await pollNext(), { commandId: id, type: 'screenshot_now' })
  assert.equal((await lastCommandOf()).status, 'running')
  assert.deepEqual(await pollNext(), {}, 'ett running-kommando lämnas inte ut igen')

  const res = await report(id, 'failed', 'grim saknas')
  assert.equal(res.status, 200)
  assert.deepEqual(bucket.keys('screens/reception/commands/'), [], 'kvitterat kommando ska vara raderat')
  assert.deepEqual(await lastCommandOf(), { type: 'screenshot_now', status: 'failed', error: 'grim saknas' })
})

test('kvittens för okänt eller redan städat kommando ger 404', async () => {
  const id = await createCommand('reload_browser')
  await pollNext()
  assert.equal((await report(id, 'done')).status, 200)
  assert.equal((await report(id, 'done')).status, 404)
})

test('äldre data: utförda kommandon städas vid poll, indexet seedas och väntande lämnas ut', async () => {
  const base = Date.parse('2026-10-23T08:00:00Z')
  const iso = (m) => new Date(base + m * 60000).toISOString()
  for (let i = 0; i < 40; i++) {
    await bucket.putJson(`screens/reception/commands/old${i}.json`, {
      id: `old${i}`, type: 'screenshot_now', status: i % 2 ? 'done' : 'failed', createdAt: iso(i), updatedAt: iso(i),
    })
  }
  const pendingCreated = new Date(Date.now() - 60000).toISOString()
  await bucket.putJson('screens/reception/commands/p1.json', {
    id: 'p1', type: 'reload_browser', status: 'pending', createdAt: pendingCreated, updatedAt: pendingCreated,
  })
  // Före första poll: /api/screens fungerar via genomsökning (inget index ännu)
  assert.equal((await lastCommandOf()).type, 'reload_browser')

  assert.deepEqual(await pollNext(), { commandId: 'p1', type: 'reload_browser' })
  assert.deepEqual(bucket.keys('screens/reception/commands/'), ['screens/reception/commands/p1.json'])
  assert.equal((await lastCommandOf()).status, 'running')

  // Nästa poll läser bara det som är aktivt
  bucket.clearOps()
  await pollNext()
  const reads = bucket.ops.filter(([op, key]) => op === 'get' && key.includes('/commands/'))
  assert.equal(reads.length, 1)
})

test('kommandon äldre än 24 h städas bort och lämnas inte ut; lastCommand blir failed', async () => {
  const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString()
  await bucket.putJson('screens/reception/commands/r1.json', {
    id: 'r1', type: 'reboot_pi', status: 'running', createdAt: old, updatedAt: old,
  })
  await bucket.putJson('screens/reception/commands/p2.json', {
    id: 'p2', type: 'reboot_pi', status: 'pending', createdAt: old, updatedAt: old,
  })
  assert.deepEqual(await pollNext(), {})
  assert.deepEqual(bucket.keys('screens/reception/commands/'), [])
  const last = await lastCommandOf()
  assert.equal(last.status, 'failed')
  assert.equal(last.error, 'Ingen kvittens inom 24 timmar')
})

test('skärmarna städas var för sig', async () => {
  await createCommand('screenshot_now', 'lounge')
  const id = await createCommand('screenshot_now', 'reception')
  await pollNext('reception')
  await report(id, 'done')
  assert.equal(bucket.keys('screens/lounge/commands/').length, 1)
  assert.deepEqual(await pollNext('lounge'), { commandId: bucket.readJson(bucket.keys('screens/lounge/commands/')[0]).id, type: 'screenshot_now' })
})
