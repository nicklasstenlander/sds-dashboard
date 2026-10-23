// node --test tests/signage/
// Klientlogiken bakom tidsstyrningsdialogen i Signage.tsx (src/lib/signageSchedules.ts).
// Node strippar TypeScript-typerna själv, så modulen importeras direkt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHEDULE_MESSAGES, applyScheduleDraft, fetchSchedules, putSchedules, scheduleDraftProblem,
} from '../../src/lib/signageSchedules.ts'

const auth = async () => ({ Authorization: 'Bearer t' })

function fakeFetch(status, body, headers = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
  }
  return { impl, calls }
}

const save = (fetchImpl, extra = {}) => putSchedules({
  workerUrl: 'https://w.test', schedules: { 'reception/a.jpg': { timeTo: '12:00' } },
  etag: '"etag-1"', getAuthHeaders: auth, fetchImpl, ...extra,
})

test('403 ger ok:false (dialogen stängs inte) och ber om ny inloggning', async () => {
  const r = await save(fakeFetch(403, { error: 'Ej behörig roll' }).impl)
  assert.deepEqual(r, { ok: false, kind: 'auth', message: SCHEDULE_MESSAGES.auth })
  assert.match(r.message, /Logga in igen/)
})

test('401 behandlas som utgången inloggning', async () => {
  assert.equal((await save(fakeFetch(401, { error: 'Ej behörig' }).impl)).kind, 'auth')
})

test('saknad CORE-session (auth-headern kastar) ger auth-fel i stället för ett okontrollerat undantag', async () => {
  const r = await save(fakeFetch(200, {}).impl, { getAuthHeaders: async () => { throw new Error('Ingen CORE-session. Logga in igen.') } })
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'auth')
})

test('409 ger konflikt', async () => {
  const r = await save(fakeFetch(409, { error: 'x' }).impl)
  assert.deepEqual(r, { ok: false, kind: 'conflict', message: SCHEDULE_MESSAGES.conflict })
})

test('400 visar workerns svenska felmeddelande', async () => {
  const r = await save(fakeFetch(400, { error: 'Ogiltig tid i timeTo för "reception/a.jpg". Använd TT:MM.' }).impl)
  assert.equal(r.kind, 'invalid')
  assert.equal(r.message, 'Kunde inte spara tidsstyrningen: Ogiltig tid i timeTo för "reception/a.jpg". Använd TT:MM.')
})

test('500 och nätverksfel ger den allmänna texten', async () => {
  assert.equal((await save(fakeFetch(500, undefined).impl)).message, 'Kunde inte spara tidsstyrningen. Försök igen.')
  const r = await save(async () => { throw new TypeError('Failed to fetch') })
  assert.deepEqual(r, { ok: false, kind: 'error', message: SCHEDULE_MESSAGES.error })
})

test('lyckad sparning skickar If-Match och auth, och returnerar workerns rensade karta och ny ETag', async () => {
  const { impl, calls } = fakeFetch(200, { ok: true, schedules: { 'reception/a.jpg': { timeTo: '12:00' } } }, { ETag: '"etag-2"' })
  const r = await save(impl)
  assert.deepEqual(r, { ok: true, schedules: { 'reception/a.jpg': { timeTo: '12:00' } }, etag: '"etag-2"' })
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].init.headers['If-Match'], '"etag-1"')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t')
})

test('utan känd ETag skickas inget If-Match', async () => {
  const { impl, calls } = fakeFetch(200, { ok: true })
  await save(impl, { etag: null })
  assert.equal('If-Match' in calls[0].init.headers, false)
})

test('fetchSchedules läser ETag och tål ett svar som inte är ett objekt', async () => {
  const r = await fetchSchedules('https://w.test', fakeFetch(200, null, { ETag: '"tom"' }).impl)
  assert.deepEqual(r, { schedules: {}, etag: '"tom"' })
})

test('applyScheduleDraft rensar tomma fält och tar bort posten när utkastet är tomt', () => {
  const base = { 'reception/a.jpg': { timeTo: '12:00' }, 'lounge/b.jpg': { timeFrom: '08:00' } }
  assert.deepEqual(applyScheduleDraft(base, 'reception/a.jpg', { timeTo: '', weekdays: [] }), { 'lounge/b.jpg': { timeFrom: '08:00' } })
  assert.deepEqual(applyScheduleDraft(base, 'lounge/c.jpg', { dateTo: '2026-11-01', timeFrom: undefined }), {
    ...base, 'lounge/c.jpg': { dateTo: '2026-11-01' },
  })
  assert.deepEqual(base['reception/a.jpg'], { timeTo: '12:00' }, 'originalet muteras inte')
})

test('scheduleDraftProblem stoppar över midnatt och omvända datum', () => {
  assert.match(scheduleDraftProblem({ timeFrom: '22:00', timeTo: '02:00' }), /över midnatt/)
  assert.match(scheduleDraftProblem({ dateFrom: '2026-11-02', dateTo: '2026-10-27' }), /Startdatum är efter slutdatum/)
  assert.equal(scheduleDraftProblem({ timeFrom: '08:00', timeTo: '08:00' }), null)
  assert.equal(scheduleDraftProblem({}), null)
})
