#!/usr/bin/env node
/**
 * Publicerar workers/sodss-signage/worker.js till sodss-signage.
 * Bindings, secrets och cron rörs inte.
 *
 * Admin-rutter kräver en Supabase-JWT med rollen admin och failar stängt
 * om SUPABASE_URL eller SUPABASE_ANON_KEY saknas. Pi-agenterna fortsätter
 * med CORE_AGENT_TOKEN / SCREEN_AGENT_TOKENS.
 *
 *   node scripts/secure-signage-worker.mjs --self-check
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-signage-worker.mjs --pull live-signage.js
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-signage-worker.mjs --check
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-signage-worker.mjs --deploy
 *
 * Uppladdning sker bara om den publicerade workern är identisk med worker.js
 * vid commiten i workers/sodss-signage/.deployed-ref, alltså den version vi
 * senast vet att vi deployade. Har live ändrats på annat sätt (dashboarden,
 * en annan gren) stoppar skriptet hellre än att skriva över okänd kod.
 * Efter en lyckad --deploy: uppdatera .deployed-ref till den nya commiten och
 * committa den.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindingNames, downloadWorker, sentryModules, sha256, uploadWorker } from './cf-worker.mjs'

const SCRIPT_NAME = 'sodss-signage'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKER_REL = 'workers/sodss-signage/worker.js'
const REPO_PATH = resolve(REPO_ROOT, WORKER_REL)
const DEPLOYED_REF_PATH = resolve(REPO_ROOT, 'workers/sodss-signage/.deployed-ref')
const LIVE_OPEN_MARKER = 'if (!env.ADMIN_SECRET) return true'
const REQUIRED_BINDINGS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY']

export function readRepoWorker() {
  return readFileSync(REPO_PATH, 'utf8')
}

export function assertSignageSource(source) {
  const required = [
    'async function requireAdmin()',
    "role !== 'admin'",
    'admin_auth_not_configured',
    'function isAgentAuthorized',
    'env.CORE_AGENT_TOKEN',
    'env.SCREEN_AGENT_TOKENS',
  ]
  for (const needle of required) {
    if (!source.includes(needle)) throw new Error(`Repots signage-worker saknar ${needle}`)
  }
  if (source.includes(LIVE_OPEN_MARKER) || source.includes('env.ADMIN_SECRET')) {
    throw new Error('Repots signage-worker accepterar fortfarande delad admin-hemlighet')
  }
}

// ── .deployed-ref ───────────────────────────────────────────────────────────

const git = (...args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

export function readDeployedRef() {
  let ref
  try {
    ref = readFileSync(DEPLOYED_REF_PATH, 'utf8').trim()
  } catch {
    throw new Error('workers/sodss-signage/.deployed-ref saknas.')
  }
  if (!/^[0-9a-f]{7,40}$/.test(ref)) throw new Error(`.deployed-ref innehåller inte en commit-hash: "${ref}"`)
  return ref
}

export function readWorkerAtRef(ref) {
  try {
    return git('show', `${ref}:${WORKER_REL}`)
  } catch {
    throw new Error(`Kunde inte läsa ${WORKER_REL} vid ${ref}. Kör git fetch, eller kontrollera .deployed-ref.`)
  }
}

// ── Jämförelse ──────────────────────────────────────────────────────────────

// Byte för byte, bortsett från radslut (CRLF/LF) och blanksteg i slutet av rader
// och filen — sådant som Cloudflare eller en editor kan ändra utan att koden gör det.
export function normalizeSource(source) {
  return source.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/, '')).join('\n').replace(/\s+$/, '')
}

export function sameSource(a, b) {
  return normalizeSource(a) === normalizeSource(b)
}

// Kort sammanfattning av hur två källor skiljer sig: storlek, hash och första
// avvikande rad med några rader från vardera sidan.
export function diffSummary(live, expected, { labelLive = 'live', labelExpected = 'förväntad', context = 3 } = {}) {
  const a = normalizeSource(live).split('\n')
  const b = normalizeSource(expected).split('\n')
  let first = 0
  while (first < a.length && first < b.length && a[first] === b[first]) first++
  const bSet = new Set(b)
  const aSet = new Set(a)
  const onlyLive = a.filter((l) => !bSet.has(l)).length
  const onlyExpected = b.filter((l) => !aSet.has(l)).length
  const clip = (l) => (l.length > 140 ? l.slice(0, 140) + '…' : l)
  const lines = [
    `  ${labelLive}: ${a.length} rader, sha256 ${sha256(live).slice(0, 12)}`,
    `  ${labelExpected}: ${b.length} rader, sha256 ${sha256(expected).slice(0, 12)}`,
    `  Rader bara i ${labelLive}: ${onlyLive}, bara i ${labelExpected}: ${onlyExpected}`,
    `  Första skillnad på rad ${first + 1}:`,
    ...a.slice(first, first + context).map((l) => `    ${labelLive} > ${clip(l)}`),
    ...b.slice(first, first + context).map((l) => `    ${labelExpected} > ${clip(l)}`),
  ]
  return lines.join('\n')
}

// Returnerar { state, repoHash }:
//   'match'        live är redan repots nuvarande fil (inget att ladda upp)
//   'deployed-ref' live är versionen vid .deployed-ref — repot får laddas upp
// Allt annat stoppas.
export function compareToLive(live, repoSource, deployedSource, deployedRef = 'deployed-ref') {
  assertSignageSource(repoSource)
  const repoHash = sha256(repoSource)
  if (sameSource(live, repoSource)) return { state: 'match', repoHash }
  if (sameSource(live, deployedSource)) return { state: 'deployed-ref', repoHash }
  throw new Error(
    `Publicerad signage-worker matchar varken repots worker.js eller den senast deployade versionen (${deployedRef}).\n`
    + 'Någon har ändrat live utanför repot, eller så är .deployed-ref inaktuell. Ingen uppladdning.\n'
    + 'Spara live med --pull och jämför innan du går vidare.\n'
    + diffSummary(live, deployedSource, { labelExpected: deployedRef }),
  )
}

function assertWorkerCommitted() {
  try {
    git('diff', '--quiet', 'HEAD', '--', WORKER_REL)
  } catch {
    throw new Error(`${WORKER_REL} har ändringar som inte är committade. Committa först, så att .deployed-ref kan peka på det som laddas upp.`)
  }
}

// ── Körning ─────────────────────────────────────────────────────────────────

export function selfCheck() {
  assertSignageSource(readRepoWorker())
  const ref = readDeployedRef()
  assertSignageSource(readWorkerAtRef(ref))
  console.log('OK: workers/sodss-signage/worker.js kräver admin-JWT och behåller agent-token.')
  console.log(`OK: .deployed-ref (${ref}) finns i git och är en säker version.`)
}

export async function main(argv = process.argv, env = process.env) {
  if (argv.includes('--self-check')) {
    selfCheck()
    return
  }
  const deploy = argv.includes('--deploy')
  const token = env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error('CLOUDFLARE_API_TOKEN saknas')
  }

  const pullIndex = argv.indexOf('--pull')
  if (pullIndex > 0) {
    const out = argv[pullIndex + 1]
    if (!out || out.startsWith('--')) throw new Error('--pull kräver en filsökväg')
    const live = await downloadWorker(token, SCRIPT_NAME)
    writeFileSync(out, live)
    console.log(`Live-källan sparad i ${out} (${sha256(live)}). Inget laddades upp.`)
    return
  }

  const names = await bindingNames(token, SCRIPT_NAME)
  const missing = REQUIRED_BINDINGS.filter((name) => !names.includes(name))
  const repoSource = readRepoWorker()
  const deployedRef = readDeployedRef()
  const deployedSource = readWorkerAtRef(deployedRef)
  const live = await downloadWorker(token, SCRIPT_NAME)
  const { state, repoHash } = compareToLive(live, repoSource, deployedSource, deployedRef)
  console.log(state === 'match'
    ? `Publicerad signage-worker matchar repot (${repoHash}).`
    : `Publicerad signage-worker är versionen vid ${deployedRef}. Repot (${repoHash}) kan laddas upp.`)
  if (missing.length) {
    throw new Error(`Bindings saknas: ${missing.join(', ')}. Lägg till dem innan --deploy. Admin-rutter failar annars stängt.`)
  }
  if (!deploy) {
    console.log('Ingen uppladdning (--deploy saknas).')
    return
  }
  console.log('Sentry: sätt compatibility_date >= 2024-09-23 och compatibility_flag nodejs_compat på workern. Skriptet ändrar inte de inställningarna. Utan flaggan svarar workern som vanligt, men fel skickas inte till Sentry.')
  if (state === 'match') {
    console.log('Redan publicerad.')
    return
  }
  assertWorkerCommitted()
  const uploaded = await uploadWorker(token, SCRIPT_NAME, repoSource, sentryModules(dirname(REPO_PATH)))
  console.log('Uppladdad', JSON.stringify(uploaded?.result ?? uploaded).slice(0, 400))

  // Kontrollera att det som nu ligger live verkligen är repots fil.
  const after = await downloadWorker(token, SCRIPT_NAME)
  if (!sameSource(after, repoSource)) {
    throw new Error('Efter uppladdningen matchar live inte repots worker.js. Kontrollera i Cloudflare.\n'
      + diffSummary(after, repoSource, { labelExpected: 'repo' }))
  }
  const head = git('rev-parse', '--short', 'HEAD').trim()
  console.log(`Verifierat: live är identisk med repots worker.js (${repoHash}).`)
  console.log(`PÅMINNELSE: uppdatera .deployed-ref och committa:\n  echo ${head} > workers/sodss-signage/.deployed-ref && git add workers/sodss-signage/.deployed-ref && git commit -m "Signage: deployed-ref ${head}"`)
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('secure-signage-worker.mjs')
if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
