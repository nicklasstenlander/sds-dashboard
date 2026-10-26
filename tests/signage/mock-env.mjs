// Mockad miljö för signage-workern: R2 i minnet och en Supabase som utfärdar riktiga
// ES256-signerade JWT:er, så att requireAdmin() körs på riktigt i testerna.
import { pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WORKER_PATH = process.env.SIGNAGE_WORKER_PATH || resolve(dirname(fileURLToPath(import.meta.url)), '../../workers/sodss-signage/worker.js')
export const SUPABASE_URL = 'https://mock.supabase.co'
export const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
export const STAFF_ID = '22222222-2222-4222-8222-222222222222'

export async function loadWorker() {
  // Ny modulinstans per anrop, så isolate-state (JWKS-cache) inte delas mellan tester.
  const mod = await import(pathToFileURL(WORKER_PATH).href + '?t=' + Date.now() + Math.random())
  return mod.default
}

// ── R2 i minnet ─────────────────────────────────────────────────────────────
// Täcker det workern använder: get (med range), head, put (med onlyIf.etagMatches),
// delete och list (prefix).
export class MemoryBucket {
  constructor() {
    this.objects = new Map()
    this.counter = 0
    this.ops = []
  }

  #meta(key, entry) {
    return {
      key,
      size: entry.bytes.length,
      etag: entry.etag,
      httpEtag: `"${entry.etag}"`,
      uploaded: entry.uploaded,
      httpMetadata: entry.httpMetadata,
    }
  }

  async put(key, value, options = {}) {
    this.ops.push(['put', key])
    const existing = this.objects.get(key)
    if (options.onlyIf?.etagMatches && (!existing || existing.etag !== options.onlyIf.etagMatches)) return null
    let bytes
    if (typeof value === 'string') bytes = new TextEncoder().encode(value)
    else if (value instanceof Uint8Array) bytes = value
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
    else bytes = new Uint8Array(await new Response(value).arrayBuffer())
    const entry = {
      bytes,
      etag: `etag-${++this.counter}`,
      uploaded: new Date(),
      httpMetadata: options.httpMetadata ?? {},
    }
    this.objects.set(key, entry)
    return this.#meta(key, entry)
  }

  async get(key, options = {}) {
    this.ops.push(['get', key])
    const entry = this.objects.get(key)
    if (!entry) return null
    let bytes = entry.bytes
    if (options.range) bytes = bytes.slice(options.range.offset, options.range.offset + options.range.length)
    return {
      ...this.#meta(key, entry),
      body: new Response(bytes).body,
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }
  }

  async head(key) {
    this.ops.push(['head', key])
    const entry = this.objects.get(key)
    return entry ? this.#meta(key, entry) : null
  }

  async delete(key) {
    this.ops.push(['delete', key])
    this.objects.delete(key)
  }

  async list({ prefix = '' } = {}) {
    this.ops.push(['list', prefix])
    const objects = [...this.objects.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, e]) => this.#meta(k, e))
    return { objects, truncated: false }
  }

  // Hjälpare för testerna
  putJson(key, data) { return this.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } }) }
  readJson(key) {
    const e = this.objects.get(key)
    return e ? JSON.parse(new TextDecoder().decode(e.bytes)) : null
  }
  keys(prefix = '') { return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort() }
  clearOps() { this.ops = [] }
}

// ── Mockad Supabase (JWKS + user_profiles) ─────────────────────────────────
function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function createMockSupabase(roles = { [ADMIN_ID]: 'admin', [STAFF_ID]: 'staff' }) {
  const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'test-kid', alg: 'ES256', use: 'sig' }

  async function token(sub, { expSeconds = 3600 } = {}) {
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: 'test-kid', typ: 'JWT' })))
    const payload = b64url(new TextEncoder().encode(JSON.stringify({
      sub, iss: `${SUPABASE_URL}/auth/v1`, exp: Math.floor(Date.now() / 1000) + expSeconds,
    })))
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(`${header}.${payload}`))
    return `${header}.${payload}.${b64url(new Uint8Array(sig))}`
  }

  async function fetchMock(input) {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.origin !== SUPABASE_URL) throw new Error('oväntat nätverksanrop: ' + url.href)
    if (url.pathname === '/auth/v1/.well-known/jwks.json') return Response.json({ keys: [jwk] })
    if (url.pathname === '/rest/v1/user_profiles') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '')
      return Response.json(roles[id] ? [{ role: roles[id] }] : [])
    }
    return new Response('not found', { status: 404 })
  }

  return { token, fetchMock }
}

export function makeEnv(bucket, extra = {}) {
  return {
    BUCKET: bucket,
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon-test',
    CORE_AGENT_TOKEN: 'agent-test',
    // Tom sträng: Sentry-wrappern hoppar över SDK:t så tester inte ringer hem.
    SENTRY_DSN: '',
    ...extra,
  }
}
