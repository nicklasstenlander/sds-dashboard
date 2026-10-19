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
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-signage-worker.mjs --check
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-signage-worker.mjs --deploy
 *
 * Kör --deploy först när CORE-webben som skickar sessionen är live, och
 * först efter att Supabase-bindningarna finns på workern.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindingNames, downloadWorker, sha256, uploadWorker } from './cf-worker.mjs'

const SCRIPT_NAME = 'sodss-signage'
const REPO_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../workers/sodss-signage/worker.js')
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

export function compareToLive(live, repoSource = readRepoWorker()) {
  assertSignageSource(repoSource)
  const repoHash = sha256(repoSource)
  if (sha256(live) === repoHash) return { state: 'match', repoHash }
  if (!live.includes(LIVE_OPEN_MARKER)) {
    throw new Error('Publicerad signage-worker matchar inte repot och är inte den kända öppna versionen.')
  }
  if (!live.includes('function isAgentAuthorized') || !live.includes('CORE_AGENT_TOKEN')) {
    throw new Error('Publicerad signage-worker saknar agent-auth. Ingen uppladdning.')
  }
  return { state: 'open-live', repoHash }
}

async function main() {
  if (process.argv.includes('--self-check')) {
    assertSignageSource(readRepoWorker())
    console.log('OK: workers/sodss-signage/worker.js kräver admin-JWT och behåller agent-token.')
    return
  }
  const deploy = process.argv.includes('--deploy')
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    console.error('CLOUDFLARE_API_TOKEN saknas')
    process.exit(1)
  }
  const names = await bindingNames(token, SCRIPT_NAME)
  const missing = REQUIRED_BINDINGS.filter((name) => !names.includes(name))
  const repoSource = readRepoWorker()
  const live = await downloadWorker(token, SCRIPT_NAME)
  const { state, repoHash } = compareToLive(live, repoSource)
  console.log(state === 'match'
    ? `Publicerad signage-worker matchar repot (${repoHash}).`
    : `Publicerad signage-worker är fortfarande öppen. Repot är ersättningen (${repoHash}).`)
  if (missing.length) {
    throw new Error(`Bindings saknas: ${missing.join(', ')}. Lägg till dem innan --deploy. Admin-rutter failar annars stängt.`)
  }
  if (!deploy) {
    console.log('Ingen uppladdning (--deploy saknas).')
    return
  }
  if (state === 'match') {
    console.log('Redan publicerad.')
    return
  }
  const uploaded = await uploadWorker(token, SCRIPT_NAME, repoSource)
  console.log('Uppladdad', JSON.stringify(uploaded?.result ?? uploaded).slice(0, 400))
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('secure-signage-worker.mjs')
if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
