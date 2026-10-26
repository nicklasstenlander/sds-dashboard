import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ACCOUNT_ID = 'e27b389e46c21088b832eac52be91cbd'

export function sha256(source) {
  return createHash('sha256').update(source).digest('hex')
}

// Plockar ut huvudmodulen worker.js ur Cloudflares multipart-svar.
// Extra moduler (Sentry) ignoreras så --check fortfarande jämför worker.js.
export function extractWorker(raw) {
  if (typeof raw !== 'string') throw new Error('Hittade inte worker-modulen i svaret')
  const modules = javascriptModules(raw)
  const main = modules.find((mod) => mod.name === 'worker.js') ?? modules[0]
  if (!main) throw new Error('Hittade inte worker-modulen i svaret')
  return main.source
}

function javascriptModules(raw) {
  if (!raw.startsWith('--')) return []
  const newline = raw.indexOf('\r\n')
  if (newline < 0) return []
  const boundary = raw.slice(0, newline)
  const modules = []
  for (const part of raw.split(boundary).slice(1)) {
    if (part.startsWith('--')) continue
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const headers = part.slice(0, headerEnd)
    if (!/application\/javascript\+module/i.test(headers)) continue
    const name = headers.match(/name="([^"]+)"/)?.[1] ?? ''
    let source = part.slice(headerEnd + 4)
    if (source.endsWith('\r\n')) source = source.slice(0, -2)
    modules.push({ name, source })
  }
  return modules
}

export function sentryModules(workerDir) {
  return ['sentry-loader.js', 'sentry-runtime.js'].map((name) => ({
    name,
    source: readFileSync(join(workerDir, name), 'utf8'),
  }))
}

export async function cf(token, method, path, { body, contentType } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  if (!res.ok || (json && json.success === false)) {
    throw new Error(`Cloudflare ${method} ${path} svarade ${res.status}: ${text.slice(0, 500)}`)
  }
  return json ?? text
}

export async function downloadWorker(token, scriptName) {
  const downloaded = await cf(
    token,
    'GET',
    `/accounts/${ACCOUNT_ID}/workers/scripts/${scriptName}/content/v2`,
  )
  const raw = typeof downloaded === 'string' ? downloaded : JSON.stringify(downloaded)
  return extractWorker(raw)
}

export async function bindingNames(token, scriptName) {
  const settings = await cf(
    token,
    'GET',
    `/accounts/${ACCOUNT_ID}/workers/scripts/${scriptName}/settings`,
  )
  return (settings.result?.bindings ?? []).map((binding) => binding.name)
}

function modulePart(boundary, name, source) {
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${name}"; filename="${name}"`,
    'Content-Type: application/javascript+module',
    '',
    source,
  ].join('\r\n')
}

export async function uploadWorker(token, scriptName, source, extraModules = []) {
  const boundary = `----sds${Date.now()}`
  const metadata = JSON.stringify({ main_module: 'worker.js' })
  const parts = [
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="metadata"',
      'Content-Type: application/json',
      '',
      metadata,
    ].join('\r\n'),
    modulePart(boundary, 'worker.js', source),
    ...extraModules.map((mod) => modulePart(boundary, mod.name, mod.source)),
  ]
  const body = `${parts.join('\r\n')}\r\n--${boundary}--\r\n`
  return cf(
    token,
    'PUT',
    `/accounts/${ACCOUNT_ID}/workers/scripts/${scriptName}/content`,
    { body, contentType: `multipart/form-data; boundary=${boundary}` },
  )
}
