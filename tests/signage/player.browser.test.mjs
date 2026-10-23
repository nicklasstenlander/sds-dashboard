// node --test tests/signage/player.browser.test.mjs
// Spelaren i riktig Chromium mot den riktiga workern (mockad R2). Hoppar över
// om ingen Chrome finns (sätt CHROME_PATH).
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  PNG_1X1, chromeAvailable, launchChrome, makeTestVideo, longestBlack, sample, shownSequence, startWorkerServer,
} from './harness.mjs'

const skip = chromeAvailable() ? false : 'ingen Chrome/Chromium (sätt CHROME_PATH)'
let server, chrome

afterEach(async () => {
  if (chrome) await chrome.close()
  if (server) await server.close()
  chrome = server = null
})

async function setup(items, files) {
  server = await startWorkerServer()
  for (const [key, bytes] of Object.entries(files)) {
    const contentType = key.endsWith('.mp4') ? 'video/mp4' : 'image/png'
    await server.bucket.put(key, bytes, { httpMetadata: { contentType } })
  }
  await server.bucket.putJson('playlists/reception.json', { version: 2, updated: new Date().toISOString(), items })
  chrome = await launchChrome()
  await chrome.navigate(`${server.origin}/player?screen=reception`)
}

const img = (id, key, duration = 2) => ({ id, type: 'image', key, duration })
const GARBAGE = Buffer.from('det här är ingen bild')

test('trasig bild (oläsbar fil) står inte svart under sin visningstid, spelaren går vidare', { skip, timeout: 60000 }, async () => {
  await setup(
    [img('a', 'reception/a.png'), img('b', 'reception/trasig.png'), img('c', 'reception/c.png')],
    { 'reception/a.png': PNG_1X1, 'reception/trasig.png': GARBAGE, 'reception/c.png': PNG_1X1 },
  )
  const samples = await sample(chrome, 14000)
  const black = longestBlack(samples)
  const seq = shownSequence(samples)
  assert.ok(black < 1200, `längsta svarta period ${black} ms (visningstiden är 2000 ms)`)
  assert.ok(seq.filter((i) => i === 0).length >= 2, `a ska visas flera varv, sekvens ${seq}`)
  assert.ok(seq.filter((i) => i === 2).length >= 2, `c ska visas flera varv, sekvens ${seq}`)
  assert.ok(!seq.includes(1), 'den trasiga bilden ska aldrig räknas som visad')
  // Ett försök förbi cachen per varv, inte en tät loop
  const brokenFetches = server.requests.filter((r) => r.startsWith('/media/reception/trasig.png')).length
  assert.ok(brokenFetches <= 20, `${brokenFetches} hämtningar av den trasiga bilden på 14 s`)
})

test('bild som svarar 500 hoppas över på samma sätt', { skip, timeout: 60000 }, async () => {
  await setup(
    [img('a', 'reception/a.png'), img('b', 'reception/b.png')],
    { 'reception/a.png': PNG_1X1, 'reception/b.png': PNG_1X1 },
  )
  server.setFault((path) => path === '/media/reception/b.png' ? new Response('fel', { status: 500 }) : null)
  const samples = await sample(chrome, 10000)
  assert.ok(longestBlack(samples) < 1200, `längsta svarta period ${longestBlack(samples)} ms`)
  // a ↔ trasig b ↔ a slås ihop till en visning i shownSequence, så mät i stället
  // att skärmen nästan hela tiden visar innehåll och att b provats flera varv.
  const visible = samples.filter((s) => !s.loading && s.ok).length / samples.filter((s) => !s.loading).length
  assert.ok(visible > 0.85, `innehåll synligt ${Math.round(visible * 100)} % av tiden`)
  const tries = server.requests.filter((r) => r.startsWith('/media/reception/b.png')).length
  assert.ok(tries >= 4, `b ska provas igen varje varv, ${tries} försök`)
})

test('bild som fallerat ett varv laddas om och visas när den fungerar igen', { skip, timeout: 60000 }, async () => {
  await setup(
    [img('a', 'reception/a.png'), img('b', 'reception/b.png')],
    { 'reception/a.png': PNG_1X1, 'reception/b.png': PNG_1X1 },
  )
  let broken = true
  server.setFault((path) => broken && path === '/media/reception/b.png' ? new Response('fel', { status: 503 }) : null)
  const first = await sample(chrome, 5000)
  assert.ok(!shownSequence(first).includes(1), 'b ska inte visas medan den är trasig')
  broken = false
  const after = await sample(chrome, 9000)
  assert.ok(shownSequence(after).includes(1), `b ska visas igen när servern svarar, sekvens ${shownSequence(after)}`)
  assert.ok(longestBlack(after) < 1200, `längsta svarta period ${longestBlack(after)} ms`)
})

test('enda objektet är en trasig bild: backoff i stället för tät loop', { skip, timeout: 60000 }, async () => {
  await setup([img('b', 'reception/trasig.png')], { 'reception/trasig.png': GARBAGE })
  await sample(chrome, 10000, 200)
  const fetches = server.requests.filter((r) => r.startsWith('/media/reception/trasig.png')).length
  // Backoff 1, 2, 4, 8 s … ger en handfull försök på 10 s; en tät loop ger hundratals.
  assert.ok(fetches <= 15, `${fetches} hämtningar på 10 s`)
})

test('fungerande bilder roterar som vanligt med rätt visningstid', { skip, timeout: 60000 }, async () => {
  await setup(
    [img('a', 'reception/a.png', 1), img('b', 'reception/b.png', 1)],
    { 'reception/a.png': PNG_1X1, 'reception/b.png': PNG_1X1 },
  )
  const samples = await sample(chrome, 7000)
  const seq = shownSequence(samples)
  assert.ok(seq.length >= 5, `förväntade minst 5 byten på 7 s med 1 s per bild, fick ${seq}`)
  assert.ok(longestBlack(samples) < 300, `längsta svarta period ${longestBlack(samples)} ms`)
})

const VIDEO = chromeAvailable() ? makeTestVideo(2) : null
const vid = (id, key) => ({ id, type: 'video', key })

test('regression video: två filmer och en bild, minst 6 fulla varv utan svart skärm', { skip: skip || (!VIDEO && 'ffmpeg saknas'), timeout: 90000 }, async () => {
  await setup(
    [vid('v1', 'reception/v1.mp4'), vid('v2', 'reception/v2.mp4'), img('a', 'reception/a.png', 1)],
    { 'reception/v1.mp4': VIDEO, 'reception/v2.mp4': VIDEO, 'reception/a.png': PNG_1X1 },
  )
  const samples = await sample(chrome, 40000, 100)
  const seq = shownSequence(samples)
  const rounds = Math.min(...[0, 1, 2].map((i) => seq.filter((x) => x === i).length))
  assert.ok(rounds >= 6, `minst 6 varv, fick ${rounds} (sekvens ${seq.join('')})`)
  assert.ok(longestBlack(samples) < 1500, `längsta svarta period ${longestBlack(samples)} ms`)
})

test('regression video: trasig film hoppas över, övrigt spelar vidare', { skip: skip || (!VIDEO && 'ffmpeg saknas'), timeout: 90000 }, async () => {
  await setup(
    [vid('v1', 'reception/v1.mp4'), vid('v2', 'reception/trasig.mp4'), img('a', 'reception/a.png', 1)],
    { 'reception/v1.mp4': VIDEO, 'reception/trasig.mp4': GARBAGE, 'reception/a.png': PNG_1X1 },
  )
  const samples = await sample(chrome, 15000, 100)
  const seq = shownSequence(samples)
  assert.ok(seq.filter((x) => x === 0).length >= 3, `v1 ska spela flera varv, sekvens ${seq.join('')}`)
  assert.ok(!seq.includes(1))
  assert.ok(longestBlack(samples) < 1500, `längsta svarta period ${longestBlack(samples)} ms`)
})
