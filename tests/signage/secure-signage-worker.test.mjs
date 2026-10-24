// node --test tests/signage/
// Deployskriptet för signage-workern mot ett mockat Cloudflare-API.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compareToLive, diffSummary, main, normalizeSource, readDeployedRef, readRepoWorker,
  readWorkerAtRef, sameSource, selfCheck,
} from '../../scripts/secure-signage-worker.mjs'

const realFetch = globalThis.fetch
const realLog = console.log
let cf, logs

// Mockat Cloudflare: live-källan i minnet, bindings och uppladdning.
function mockCloudflare({ live, bindings = ['BUCKET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'], tamperOnUpload = null }) {
  const state = { live, uploads: [] }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    if (url.pathname.endsWith('/workers/scripts/sodss-signage/content/v2') && method === 'GET') {
      const raw = `--b\r\nContent-Disposition: form-data; name="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n${state.live}\r\n--b--\r\n`
      return new Response(raw)
    }
    if (url.pathname.endsWith('/workers/scripts/sodss-signage/settings') && method === 'GET') {
      return Response.json({ success: true, result: { bindings: bindings.map((name) => ({ name })) } })
    }
    if (url.pathname.endsWith('/workers/scripts/sodss-signage/content') && method === 'PUT') {
      const marker = 'Content-Type: application/javascript+module\r\n\r\n'
      const body = String(init.body)
      const start = body.indexOf(marker) + marker.length
      const source = body.slice(start, body.lastIndexOf('\r\n--'))
      state.uploads.push(source)
      state.live = tamperOnUpload ? tamperOnUpload(source) : source
      return Response.json({ success: true, result: { id: 'sodss-signage' } })
    }
    throw new Error(`oväntat anrop ${method} ${url.pathname}`)
  }
  return state
}

const run = (...args) => main(['node', 'secure-signage-worker.mjs', ...args], { CLOUDFLARE_API_TOKEN: 'test' })
const deployedSource = () => readWorkerAtRef(readDeployedRef())

beforeEach(() => {
  logs = []
  console.log = (...a) => logs.push(a.join(' '))
})
afterEach(() => {
  globalThis.fetch = realFetch
  console.log = realLog
})

// ── Rena funktioner ─────────────────────────────────────────────────────────

test('normalisering: CRLF och avslutande blanksteg spelar ingen roll, innehåll gör det', () => {
  assert.ok(sameSource('a\nb  \nc\n', 'a\r\nb\r\nc'))
  assert.ok(sameSource('a\n', 'a\n\n\n  '))
  assert.ok(!sameSource('a\nb', 'a\nb2'))
  assert.ok(!sameSource('a b', 'a  b'), 'blanksteg inne i raden räknas')
  assert.equal(normalizeSource('x \r\ny\t\r\n'), 'x\ny')
})

test('diffSummary visar första avvikande rad och antal rader', () => {
  const s = diffSummary('a\nb\nX\nd', 'a\nb\nc\nd')
  assert.match(s, /Första skillnad på rad 3/)
  assert.match(s, /live > X/)
  assert.match(s, /förväntad > c/)
  assert.match(s, /Rader bara i live: 1, bara i förväntad: 1/)
})

test('compareToLive: match, deployed-ref, och stopp för allt annat', () => {
  const repo = readRepoWorker()
  const deployed = deployedSource()
  assert.equal(compareToLive(repo, repo, deployed).state, 'match')
  assert.equal(compareToLive(repo.replace(/\n/g, '\r\n'), repo, deployed).state, 'match')
  assert.equal(compareToLive(deployed, repo, deployed).state, 'deployed-ref')
  assert.throws(
    () => compareToLive(deployed + '\n// ändrad i dashboarden\n', repo, deployed, '346e8b2'),
    (e) => /matchar varken repots worker.js eller den senast deployade versionen \(346e8b2\)/.test(e.message)
      && /Första skillnad på rad/.test(e.message) && /Ingen uppladdning/.test(e.message),
  )
})

test('compareToLive: den gamla öppna versionen godtas inte längre', () => {
  const open = 'async function isAdmin(env){ if (!env.ADMIN_SECRET) return true }\nfunction isAgentAuthorized(){} CORE_AGENT_TOKEN'
  assert.throws(() => compareToLive(open, readRepoWorker(), deployedSource()), /matchar varken/)
})

test('compareToLive: repo utan admin-JWT stoppas oavsett live', () => {
  assert.throws(() => compareToLive('x', 'export default {}', 'x'), /saknar async function requireAdmin/)
})

test('.deployed-ref pekar på 346e8b2 och worker.js där är den säkra versionen', () => {
  assert.equal(readDeployedRef(), '346e8b2')
  const src = deployedSource()
  assert.match(src, /async function requireAdmin\(\)/)
  assert.doesNotMatch(src, /env\.ADMIN_SECRET/)
})

test('--self-check kontrollerar både repot och .deployed-ref', () => {
  selfCheck()
  assert.ok(logs.some((l) => /\.deployed-ref \(346e8b2\)/.test(l)))
})

// ── main() mot mockat Cloudflare ────────────────────────────────────────────

test('--check: live är versionen vid .deployed-ref → kan laddas upp, inget laddas upp', async () => {
  cf = mockCloudflare({ live: deployedSource() })
  await run('--check')
  assert.equal(cf.uploads.length, 0)
  assert.ok(logs.some((l) => /är versionen vid 346e8b2/.test(l)))
  assert.ok(logs.some((l) => /Ingen uppladdning/.test(l)))
})

test('--check: live har ändrats utanför repot → stopp med diff, inget laddas upp', async () => {
  cf = mockCloudflare({ live: deployedSource().replace('const SCREENS = [', 'const SCREENS = [ // hotfix') })
  await assert.rejects(run('--check'), /matchar varken[\s\S]*Första skillnad på rad/)
  assert.equal(cf.uploads.length, 0)
})

test('--deploy: från .deployed-ref → laddar upp, verifierar live och påminner om .deployed-ref', async () => {
  cf = mockCloudflare({ live: deployedSource() })
  await run('--deploy')
  assert.equal(cf.uploads.length, 1)
  assert.ok(sameSource(cf.uploads[0], readRepoWorker()))
  assert.ok(logs.some((l) => /Verifierat: live är identisk med repots worker.js/.test(l)))
  assert.ok(logs.some((l) => /PÅMINNELSE: uppdatera \.deployed-ref/.test(l) && /git commit/.test(l)))
})

test('--deploy: live med CRLF och avslutande blanksteg räknas som samma version', async () => {
  cf = mockCloudflare({ live: deployedSource().replace(/\n/g, ' \r\n') })
  await run('--deploy')
  assert.equal(cf.uploads.length, 1)
})

test('--deploy: om live efter uppladdningen inte är repots fil → fel', async () => {
  cf = mockCloudflare({ live: deployedSource(), tamperOnUpload: (s) => s + '\n// något annat\n' })
  await assert.rejects(run('--deploy'), /Efter uppladdningen matchar live inte repots worker.js/)
})

test('--deploy: live är redan repot → Redan publicerad, ingen uppladdning', async () => {
  cf = mockCloudflare({ live: readRepoWorker() })
  await run('--deploy')
  assert.equal(cf.uploads.length, 0)
  assert.ok(logs.some((l) => /Redan publicerad/.test(l)))
})

test('--deploy: okänd live → ingen uppladdning', async () => {
  cf = mockCloudflare({ live: 'export default { fetch() { return new Response("annan") } }' })
  await assert.rejects(run('--deploy'), /Ingen uppladdning/)
  assert.equal(cf.uploads.length, 0)
})

test('--deploy: saknade Supabase-bindings stoppar före uppladdning', async () => {
  cf = mockCloudflare({ live: deployedSource(), bindings: ['BUCKET'] })
  await assert.rejects(run('--deploy'), /Bindings saknas: SUPABASE_URL, SUPABASE_ANON_KEY/)
  assert.equal(cf.uploads.length, 0)
})

test('--pull sparar live-källan och laddar inte upp', async () => {
  cf = mockCloudflare({ live: 'live-källa\n' })
  const dir = mkdtempSync(join(tmpdir(), 'signage-pull-'))
  const out = join(dir, 'live.js')
  await run('--pull', out)
  assert.ok(existsSync(out))
  assert.equal(readFileSync(out, 'utf8'), 'live-källa\n')
  assert.equal(cf.uploads.length, 0)
  rmSync(dir, { recursive: true, force: true })
  await assert.rejects(run('--pull'), /--pull kräver en filsökväg/)
})

test('utan CLOUDFLARE_API_TOKEN avbryts allt utom --self-check', async () => {
  await assert.rejects(main(['node', 'x', '--check'], {}), /CLOUDFLARE_API_TOKEN saknas/)
})
