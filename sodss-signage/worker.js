const PLAYER_HTML = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SODSS Skyltning</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #000; overflow: hidden; width: 100vw; height: 100vh; }
    #player { position: relative; width: 100vw; height: 100vh; background: #000; }
    .slide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.7s ease; pointer-events: none; }
    .slide.active { opacity: 1; pointer-events: auto; }
    .slide img, .slide video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    #progress { position: fixed; bottom: 0; left: 0; height: 3px; width: 0%; background: #dd5c86; opacity: 0.75; z-index: 50; transition: width linear; }
    #loader { position: fixed; inset: 0; background: #1e4025; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; z-index: 100; transition: opacity 0.6s ease; }
    #loader.hidden { opacity: 0; pointer-events: none; }
    #loader .spinner { width: 42px; height: 42px; border: 3px solid rgba(205,220,209,0.3); border-top-color: #CDDCD1; border-radius: 50%; animation: spin 1.1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loader p { color: #CDDCD1; font-size: 13px; font-family: monospace; letter-spacing: 0.1em; }
    #loader .logo { font-family: monospace; font-size: 11px; letter-spacing: 0.2em; color: rgba(205,220,209,0.4); text-transform: uppercase; margin-bottom: 8px; }
    #error { position: fixed; inset: 0; background: #1e4025; color: #CDDCD1; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font-family: monospace; text-align: center; padding: 48px; }
    #error.visible { display: flex; }
    #error .icon { font-size: 40px; }
    #error strong { font-size: 16px; }
    #error span { font-size: 13px; opacity: 0.6; }
    #error small { font-size: 11px; opacity: 0.35; margin-top: 8px; }
    #clock { position: fixed; bottom: 20px; right: 24px; color: rgba(255,255,255,0.25); font-family: monospace; font-size: 12px; letter-spacing: 0.06em; z-index: 40; }
    #counter { position: fixed; bottom: 20px; left: 24px; color: rgba(255,255,255,0.2); font-family: monospace; font-size: 11px; letter-spacing: 0.08em; z-index: 40; }
  </style>
</head>
<body>
<div id="loader"><div class="logo">SODSS · Skyltning</div><div class="spinner"></div><p id="loader-msg">Hämtar spellista…</p></div>
<div id="error"><div class="icon">⚠</div><strong>Kunde inte ladda spellista</strong><span id="error-msg"></span><small id="error-detail"></small></div>
<div id="player"></div>
<div id="progress"></div>
<div id="clock"></div>
<div id="counter"></div>
<script>
var p          = new URLSearchParams(location.search);
var WORKER_URL = p.get('worker') || (location.protocol + '//' + location.host);
var SCREEN_ID  = p.get('screen') || 'default';
var RELOAD_MIN = parseInt(p.get('reload') || '30');
var SHOW_CLOCK = p.get('clock') === '1';
var SHOW_COUNT = p.get('counter') === '1';

var playerEl  = document.getElementById('player');
var loaderEl  = document.getElementById('loader');
var loaderMsg = document.getElementById('loader-msg');
var errorEl   = document.getElementById('error');
var errorMsg  = document.getElementById('error-msg');
var errorDet  = document.getElementById('error-detail');
var progressEl= document.getElementById('progress');
var clockEl   = document.getElementById('clock');
var counterEl = document.getElementById('counter');

var playlist = [];
var current  = -1;
var advTimer = null;

function showError(msg, detail) {
  loaderEl.style.opacity = '0'; loaderEl.style.pointerEvents = 'none';
  errorEl.style.display = 'flex';
  errorMsg.innerHTML = msg; errorDet.innerHTML = detail || '';
}
function hideLoader() { loaderEl.style.opacity = '0'; loaderEl.style.pointerEvents = 'none'; }

clockEl.style.display = SHOW_CLOCK ? 'block' : 'none';
counterEl.style.display = SHOW_COUNT ? 'block' : 'none';
function updateClock() { if (SHOW_CLOCK) clockEl.innerHTML = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }
setInterval(updateClock, 15000);
updateClock();

function fetchPlaylist() {
  loaderMsg.innerHTML = 'Hämtar spellista…';
  return fetch(WORKER_URL + '/api/files')
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(data) {
      var files = (data.files || []).filter(function(f) { return f.type === 'image' || f.type === 'video'; });
      if (files.length === 0) { showError('Inga filer', 'Worker svarade men returnerade tom lista'); return false; }
      playlist = files.map(function(f) { return { key: f.key, name: f.name, type: f.type, url: f.url, duration: f.duration || 8 }; });
      return true;
    })
    .catch(function(err) { showError('Fetch-fel: ' + err.message + ' | URL: ' + WORKER_URL); return false; });
}

function buildSlides() {
  playerEl.innerHTML = '';
  for (var i = 0; i < playlist.length; i++) {
    var item = playlist[i];
    var slide = document.createElement('div');
    slide.className = 'slide';
    slide.setAttribute('data-index', i);
    if (item.type === 'image') {
      var img = new Image(); img.src = item.url; img.alt = item.name; slide.appendChild(img);
    } else {
      var vid = document.createElement('video');
      vid.src = item.url; vid.muted = true; vid.autoplay = false; vid.preload = 'auto'; vid.loop = false;
      vid.addEventListener('ended', function() { if (parseInt(slide.getAttribute('data-index')) === current) nextSlide(); });
      vid.addEventListener('error', function() { if (parseInt(slide.getAttribute('data-index')) === current) nextSlide(); });
      slide.appendChild(vid);
    }
    playerEl.appendChild(slide);
  }
}

function showSlide(idx) {
  clearTimeout(advTimer);
  var allSlides = playerEl.getElementsByClassName('slide');
  for (var si = 0; si < allSlides.length; si++) {
    var s = allSlides[si];
    var isActive = si === idx;
    s.style.opacity = isActive ? '1' : '0';
    s.style.pointerEvents = isActive ? 'auto' : 'none';
    var svid = s.getElementsByTagName('video')[0];
    if (svid && !isActive) { svid.pause(); svid.currentTime = 0; }
  }
  if (SHOW_COUNT) counterEl.innerHTML = (idx + 1) + ' / ' + playlist.length;
  var item = playlist[idx];
  if (!item) return;
  progressEl.style.transition = 'none';
  progressEl.style.width = '0%';
  if (item.type === 'image') {
    var dur = (item.duration || 8) * 1000;
    requestAnimationFrame(function() { progressEl.style.transition = 'width ' + dur + 'ms linear'; progressEl.style.width = '100%'; });
    advTimer = setTimeout(nextSlide, dur);
  } else {
    var activeSlide = allSlides[idx];
    var vid = activeSlide ? activeSlide.getElementsByTagName('video')[0] : null;
    if (vid) {
      vid.currentTime = 0;
      var pp = vid.play();
      if (pp && pp.catch) { pp.catch(function() { advTimer = setTimeout(nextSlide, 60000); }); }
      vid.addEventListener('loadedmetadata', function() {
        var dur = vid.duration * 1000;
        progressEl.style.transition = 'width ' + dur + 'ms linear';
        requestAnimationFrame(function() { progressEl.style.width = '100%'; });
        advTimer = setTimeout(nextSlide, dur + 3000);
      });
    }
  }
}

function nextSlide() { if (playlist.length === 0) return; current = (current + 1) % playlist.length; showSlide(current); }

function init() {
  fetchPlaylist().then(function(ok) {
    if (!ok) return;
    buildSlides();
    hideLoader();
    current = 0;
    showSlide(0);
  });
}

setInterval(function() { fetchPlaylist().then(function(ok) { if (ok) buildSlides(); }); }, RELOAD_MIN * 60 * 1000);

document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowRight') nextSlide();
  if (e.key === 'ArrowLeft') { current = (current - 2 + playlist.length) % playlist.length; nextSlide(); }
  if (e.key === 'f' || e.key === 'F') { if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); } }
});

init();
</script>
</body>
</html>`;

/**
 * SODSS Signage — Cloudflare Worker
 *
 * Hanterar:
 *   GET  /api/files          → lista alla filer i R2-bucketen
 *   POST /api/upload         → ladda upp fil till R2
 *   DELETE /api/files/:name  → ta bort fil från R2
 *
 * Miljövariabler (Cloudflare Dashboard → Worker → Settings → Variables):
 *   BUCKET        — R2 Bucket binding (se wrangler.toml)
 *   ADMIN_SECRET  — En hemlig sträng, t.ex. ett långt lösenord
 *   CORS_ORIGIN   — URL till din Core-dashboard, t.ex. https://core.sollentunadansochscenskola.se
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS ────────────────────────────────────────────────────────────────
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.CORS_ORIGIN ?? "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Auth (för POST och DELETE) ───────────────────────────────────────────
    function isAuthorized() {
      const auth = request.headers.get("Authorization") ?? "";
      return auth === `Bearer ${env.ADMIN_SECRET}`;
    }

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    function err(msg, status = 400) {
      return json({ error: msg }, status);
    }

    // ── GET / eller /player — serverar player.html direkt från Worker ────────
    if ((path === '/' || path === '/player') && request.method === 'GET') {
      return new Response(PLAYER_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Frame-Options': '',
        },
      });
    }

    // ── GET /debug — diagnostiksida ──────────────────────────────────────────
    if (path === '/player-mini') {
      return new Response(`<!DOCTYPE html>
<html><body style="background:#000;color:#fff;font-family:monospace;padding:40px">
<div id="s1" style="margin:8px 0">1: vantar...</div>
<div id="s2" style="margin:8px 0">2: vantar...</div>
<div id="s3" style="margin:8px 0">3: vantar...</div>
<div id="s4" style="margin:8px 0">4: vantar...</div>
<script>
function set(id, txt) {
  var el = document.getElementById(id);
  if (el) { el.innerHTML = txt; }
}

set('s1', '1: JS kör, sätter WORKER');
var WORKER = location.protocol + '//' + location.host;
set('s2', '2: WORKER=' + WORKER + ' — hämtar...');

fetch(WORKER + '/api/files')
  .then(function(r) { return r.json(); })
  .then(function(d) {
    set('s3', '3: ' + d.files.length + ' filer');
    if (d.files.length > 0) {
      set('s4', '4: url=' + d.files[0].url);
    }
  })
  .catch(function(e) {
    set('s3', 'FEL: ' + e.message);
  });
</script>
</body></html>`, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (path === '/debug') {
      return new Response(`<!DOCTYPE html>
<html><body style="background:#1e4025;color:#CDDCD1;font-family:monospace;padding:40px">
<h1>Debug</h1>
<div id="out">Testar fetch...</div>
<script>
fetch('/api/files')
  .then(r => r.json())
  .then(d => document.getElementById('out').textContent = 'OK: ' + d.files.length + ' filer')
  .catch(e => document.getElementById('out').textContent = 'FEL: ' + e.message)
</script>
</body></html>`, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // ── GET /api/url/:screen — hämta URL för skärm ──────────────────────────
    if (path.startsWith('/api/url/') && request.method === 'GET') {
      const screen = path.replace('/api/url/', '');
      const obj = await env.BUCKET.get(`urls/${screen}.txt`);
      const url2 = obj ? await obj.text() : 'https://nicklasstenlander.github.io/sds-schema/';
      return json({ screen, url: url2 });
    }

    // ── PUT /api/url/:screen — spara URL för skärm ──────────────────────────
    if (path.startsWith('/api/url/') && request.method === 'PUT') {
      if (!isAuthorized()) return err('Ej behörig', 401);
      const screen = path.replace('/api/url/', '');
      const body = await request.json();
      await env.BUCKET.put(`urls/${screen}.txt`, body.url);
      return json({ ok: true, screen, url: body.url });
    }

    // ── GET /api/files ───────────────────────────────────────────────────────
    if (path === "/api/files" && request.method === "GET") {
      const listed = await env.BUCKET.list();
      const files = listed.objects.map((obj) => ({
        key: obj.key,
        name: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        type: guessType(obj.key),
        url: `${url.origin}/media/${obj.key}`,
      }));
      // Sort by name
      files.sort((a, b) => a.name.localeCompare(b.name));
      return json({ files });
    }

    // ── GET /media/:key  — publik filservering ───────────────────────────────
    if (path.startsWith('/media/')) {
      const key = decodeURIComponent(path.replace('/media/', ''));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders });

      const contentType = obj.httpMetadata?.contentType ?? guessMime(key);
      const isVideo = contentType.startsWith('video/');
      const size = obj.size;

      const baseHeaders = {
        ...corsHeaders,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': isVideo ? 'public, max-age=3600' : 'public, max-age=86400',
        // Ta bort x-frame-options så video kan spelas i iframe/player
        'X-Frame-Options': '',
      };

      // Range request (krävs för video i Firefox och LG webOS)
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader && isVideo) {
        const [start, end] = parseRange(rangeHeader, size);
        const length = end - start + 1;

        // Hämta objektet igen med range (R2 stödjer range reads)
        const rangedObj = await env.BUCKET.get(key, {
          range: { offset: start, length },
        });

        if (!rangedObj) return new Response('Range Not Satisfiable', { status: 416 });

        return new Response(rangedObj.body, {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(length),
          },
        });
      }

      return new Response(obj.body, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Length': String(size),
        },
      });
    }

    // ── POST /api/upload ─────────────────────────────────────────────────────
    if (path === "/api/upload" && request.method === "POST") {
      if (!isAuthorized()) return err("Ej behörig", 401);

      const contentType = request.headers.get("Content-Type") ?? "";

      if (!contentType.includes("multipart/form-data")) {
        return err("Förväntar multipart/form-data");
      }

      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return err("Ingen fil i formuläret");
      }

      const fileName = sanitizeFileName(file.name);
      const mime = file.type || guessMime(fileName);

      await env.BUCKET.put(fileName, file.stream(), {
        httpMetadata: { contentType: mime },
      });

      return json({
        ok: true,
        key: fileName,
        url: `${url.origin}/media/${fileName}`,
        type: guessType(fileName),
      });
    }

    // ── DELETE /api/files/:name ──────────────────────────────────────────────
    if (path.startsWith("/api/files/") && request.method === "DELETE") {
      if (!isAuthorized()) return err("Ej behörig", 401);

      const key = decodeURIComponent(path.replace("/api/files/", ""));
      await env.BUCKET.delete(key);
      return json({ ok: true, deleted: key });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function guessType(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
    ? "image"
    : "video";
}

function guessMime(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._\-åäöÅÄÖ]/g, "_");
}

function parseRange(header, size) {
  const match = header.match(/bytes=(\d*)-(\d*)/);
  const start = match[1] ? parseInt(match[1]) : 0;
  const end = match[2] ? parseInt(match[2]) : size - 1;
  return [Math.max(0, start), Math.min(size - 1, end)];
}
