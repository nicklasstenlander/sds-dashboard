import { createHash } from 'node:crypto'

export const ACCOUNT_ID = 'e27b389e46c21088b832eac52be91cbd'

export function sha256(source) {
  return createHash('sha256').update(source).digest('hex')
}

export function extractWorker(raw) {
  const marker = 'Content-Type: application/javascript+module\r\n\r\n'
  const start = raw.indexOf(marker)
  if (start < 0) throw new Error('Hittade inte worker-modulen i svaret')
  let body = raw.slice(start + marker.length)
  const boundary = raw.startsWith('--') ? raw.slice(0, raw.indexOf('\r\n')) : null
  if (boundary) {
    const end = body.lastIndexOf('\r\n' + boundary)
    if (end > 0) body = body.slice(0, end)
  }
  return body
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

export async function uploadWorker(token, scriptName, source) {
  const boundary = `----sds${Date.now()}`
  const metadata = JSON.stringify({ main_module: 'worker.js' })
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"',
    'Content-Type: application/json',
    '',
    metadata,
    `--${boundary}`,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    'Content-Type: application/javascript+module',
    '',
    source,
    `--${boundary}--`,
    '',
  ].join('\r\n')
  return cf(
    token,
    'PUT',
    `/accounts/${ACCOUNT_ID}/workers/scripts/${scriptName}/content`,
    { body, contentType: `multipart/form-data; boundary=${boundary}` },
  )
}
