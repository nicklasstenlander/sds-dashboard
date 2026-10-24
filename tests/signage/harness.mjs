// Testmiljö för spelaren i riktig Chromium: den riktiga signage-workern (med
// PLAYER_HTML och sw.js) bakom en lokal HTTP-server med R2 i minnet, och Chrome
// som styrs över DevTools-protokollet. Inga beroenden utöver Node och en Chrome.
//
//   CHROME_PATH=/sökväg/till/chrome   (default: Google Chrome på macOS, annars chromium i PATH)
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryBucket, loadWorker, makeEnv } from './mock-env.mjs'

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const DEFAULT_CHROME = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p))

export function chromeAvailable() {
  return Boolean(DEFAULT_CHROME)
}

// Kort H.264-film från ffmpeg (testsrc), eller null om ffmpeg saknas.
export function makeTestVideo(seconds) {
  const dir = mkdtempSync(join(tmpdir(), 'signage-video-'))
  const out = join(dir, 'v.mp4')
  const r = spawnSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=15', '-t', String(seconds),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
  ])
  if (r.status !== 0 || !existsSync(out)) return null
  const bytes = readFileSync(out)
  rmSync(dir, { recursive: true, force: true })
  return bytes
}

// ── Mockad worker över HTTP ─────────────────────────────────────────────────
// `faults` styr enskilda sökvägar: (pathname, requestCount) => Response | null.
export async function startWorkerServer() {
  const worker = await loadWorker()
  const bucket = new MemoryBucket()
  const env = makeEnv(bucket)
  const requests = []
  const state = { fault: null }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      requests.push(url.pathname + url.search)
      const count = requests.filter((r) => r.split('?')[0] === url.pathname).length
      let response = state.fault ? state.fault(url.pathname, count, url) : null
      if (!response) {
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : req
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method, headers: req.headers, body, duplex: 'half',
        })
        response = await worker.fetch(request, env)
      }
      const headers = {}
      response.headers.forEach((v, k) => { if (v !== '') headers[k] = v })
      res.writeHead(response.status, headers)
      if (response.body && req.method !== 'HEAD') {
        for await (const chunk of response.body) res.write(chunk)
      }
      res.end()
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin, bucket, requests, state,
    setFault(fn) { state.fault = fn },
    close: () => new Promise((r) => server.close(r)),
  }
}

// ── Chrome via DevTools-protokollet ────────────────────────────────────────
export async function launchChrome() {
  if (!DEFAULT_CHROME) throw new Error('Ingen Chrome/Chromium hittades. Sätt CHROME_PATH.')
  const userDataDir = mkdtempSync(join(tmpdir(), 'signage-chrome-'))
  const proc = spawn(DEFAULT_CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank',
  ], { stdio: 'ignore' })

  const portFile = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + 15000
  while (!existsSync(portFile) || readFileSync(portFile, 'utf8').split('\n').length < 2) {
    if (Date.now() > deadline) throw new Error('Chrome startade inte')
    await new Promise((r) => setTimeout(r, 100))
  }
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
  let target
  while (!target) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    target = list.find((t) => t.type === 'page')
    if (!target) await new Promise((r) => setTimeout(r, 100))
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let nextId = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method) {
      for (const l of listeners) l(msg)
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  const consoleLines = []
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(m.params.args.map((a) => a.value).join(' '))
  })

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''))
    return r.result.value
  }

  return {
    send, evaluate, consoleLines,
    navigate: (url) => send('Page.navigate', { url }),
    async close() {
      try { ws.close() } catch {}
      proc.kill('SIGKILL')
      await new Promise((r) => setTimeout(r, 200))
      try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
    },
  }
}

// Ögonblicksbild av vad som syns: vilken slide som är aktiv och om den faktiskt
// visar något. "black" = ingen synlig slide, eller en bild/video utan innehåll.
export const SNAPSHOT_JS = `(() => {
  var loader = document.getElementById('loader');
  var loading = loader && loader.style.opacity !== '0';
  var errorEl = document.getElementById('error');
  var error = errorEl && errorEl.style.display === 'flex';
  var slides = document.getElementsByClassName('slide');
  for (var i = 0; i < slides.length; i++) {
    if (slides[i].style.opacity !== '1') continue;
    var img = slides[i].getElementsByTagName('img')[0];
    var vid = slides[i].getElementsByTagName('video')[0];
    var ok = img ? (img.complete && img.naturalWidth > 0)
           : vid ? (vid.readyState >= 2 && !vid.error)
           : true;
    return { idx: i, ok: ok, loading: loading, error: error };
  }
  return { idx: -1, ok: false, loading: loading, error: error };
})()`

// Samplar skärmen var `everyMs` under `ms` och returnerar sekvensen.
export async function sample(chrome, ms, everyMs = 50) {
  const out = []
  const start = Date.now()
  while (Date.now() - start < ms) {
    const s = await chrome.evaluate(SNAPSHOT_JS)
    out.push({ t: Date.now() - start, ...s })
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return out
}

// Längsta sammanhängande period (ms) där skärmen var svart efter att laddskärmen försvunnit.
export function longestBlack(samples) {
  let longest = 0, startT = null
  for (const s of samples) {
    const black = !s.loading && !s.error && !s.ok
    if (black && startT === null) startT = s.t
    if (!black && startT !== null) { longest = Math.max(longest, s.t - startT); startT = null }
  }
  if (startT !== null) longest = Math.max(longest, samples[samples.length - 1].t - startT)
  return longest
}

// Vilka slide-index som visats med innehåll, i ordning (utan upprepningar i följd).
export function shownSequence(samples) {
  const seq = []
  for (const s of samples) {
    if (!s.ok || s.idx < 0) continue
    if (seq[seq.length - 1] !== s.idx) seq.push(s.idx)
  }
  return seq
}
