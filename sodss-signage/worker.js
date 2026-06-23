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
    .slide { position: absolute; top: 0; right: 0; bottom: 0; left: 0; opacity: 0; pointer-events: none; }
    .slide img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    .slide video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    #progress { position: fixed; bottom: 0; left: 0; height: 3px; width: 0%; background: #dd5c86; opacity: 0.75; z-index: 50; transition: width linear; }
    #loader { position: fixed; top: 0; right: 0; bottom: 0; left: 0;background: #1e4025; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; z-index: 100; transition: opacity 0.6s ease; }
    #loader.hidden { opacity: 0; pointer-events: none; }
    #loader .spinner { width: 42px; height: 42px; border: 3px solid rgba(205,220,209,0.3); border-top-color: #CDDCD1; border-radius: 50%; animation: spin 1.1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loader p { color: #CDDCD1; font-size: 13px; font-family: monospace; letter-spacing: 0.1em; }
    #loader .logo { font-family: monospace; font-size: 11px; letter-spacing: 0.2em; color: rgba(205,220,209,0.4); text-transform: uppercase; margin-bottom: 8px; }
    #error { position: fixed; top: 0; right: 0; bottom: 0; left: 0;background: #1e4025; color: #CDDCD1; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font-family: monospace; text-align: center; padding: 48px; }
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

function isScheduledNow(schedule) {
  if (!schedule) return true;
  var now = new Date();
  var today = now.getFullYear() + '-' +
    ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
    ('0' + now.getDate()).slice(-2);
  var timeNow = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  var dow = now.getDay(); // 0=Sun
  var isoDay = dow === 0 ? 7 : dow; // 1=Mon … 7=Sun
  if (schedule.dateFrom && today < schedule.dateFrom) return false;
  if (schedule.dateTo   && today > schedule.dateTo)   return false;
  if (schedule.timeFrom && timeNow < schedule.timeFrom) return false;
  if (schedule.timeTo   && timeNow > schedule.timeTo)   return false;
  if (schedule.weekdays && schedule.weekdays.length > 0 &&
      schedule.weekdays.indexOf(isoDay) === -1) return false;
  return true;
}

var schedules = {};

function fetchPlaylist() {
  loaderMsg.innerHTML = 'Hämtar spellista…';
  return Promise.all([
    fetch(WORKER_URL + '/api/files').then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
    fetch(WORKER_URL + '/api/schedules').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }),
  ]).then(function(results) {
    var data = results[0];
    schedules = results[1];
    var files = (data.files || []).filter(function(f) {
      return (f.type === 'image' || f.type === 'video') && isScheduledNow(schedules[f.key]);
    });
    if (files.length === 0) { showError('Inga filer', 'Inga schemalagda inslag just nu'); return false; }
    playlist = files.map(function(f) { return { key: f.key, name: f.name, type: f.type, url: f.url, duration: f.duration || 8 }; });
    return true;
  }).catch(function(err) { showError('Fetch-fel: ' + err.message + ' | URL: ' + WORKER_URL); return false; });
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
      vid.muted = true;
      vid.defaultMuted = true;
      vid.setAttribute('muted', '');
      vid.setAttribute('playsinline', '');
      vid.preload = 'auto';
      vid.loop = false;
      vid.src = item.url;
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
      vid.muted = true;
      vid.defaultMuted = true;
      vid.currentTime = 0;
      vid.load();
      vid.addEventListener('loadeddata', function() {
        var pp = vid.play();
        if (pp && pp.catch) { pp.catch(function() { advTimer = setTimeout(nextSlide, 60000); }); }
      });
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
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    // ── GET /player-test — videotest med debug ───────────────────────────────
    if (path === '/player-test') {
      const listed = await env.BUCKET.list();
      const videos = listed.objects.filter(o => o.key.toLowerCase().endsWith('.mp4'));
      const src = videos.length > 0 ? `${url.origin}/media/${encodeURIComponent(videos[0].key)}` : '';
      return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#000;overflow:hidden;}
  #info{position:fixed;top:0;left:0;right:0;color:#0f0;font-family:monospace;font-size:13px;z-index:99;background:rgba(0,0,0,.85);padding:10px;max-height:50vh;overflow-y:auto;}
  video{position:fixed;bottom:0;left:0;width:100%;height:50vh;}
</style>
</head><body>
<div id="info">src: ${src || 'INGEN VIDEO'}<br></div>
<video id="v" muted loop playsinline preload="auto" controls src="${src}">
</video>
<script>
var v = document.getElementById('v');
var info = document.getElementById('info');
function log(t){ info.innerHTML += t+'<br>'; }

v.muted = true;
v.defaultMuted = true;

function showState(){
  log('readyState='+v.readyState+' networkState='+v.networkState);
}

v.addEventListener('loadstart',    function(){ log('loadstart'); showState(); });
v.addEventListener('progress',     function(){ log('progress'); });
v.addEventListener('loadedmetadata',function(){ log('loadedmetadata dur='+v.duration); showState(); });
v.addEventListener('loadeddata',   function(){ log('loadeddata'); showState();
  v.play().then(function(){ log('play() resolve'); }).catch(function(e){ log('play() FEL: '+e.message); });
});
v.addEventListener('canplay',      function(){ log('canplay'); });
v.addEventListener('playing',      function(){ log('SPELAR'); });
v.addEventListener('stalled',      function(){ log('stalled'); showState(); });
v.addEventListener('waiting',      function(){ log('waiting'); showState(); });
v.addEventListener('error',        function(){
  var e = v.error;
  log('ERROR kod='+(e?e.code:'?')+' msg='+(e?e.message:'?'));
  showState();
});

setTimeout(function(){ showState(); log('--- 3s timeout ---'); }, 3000);
</script>
</body></html>`, { headers: { 'Content-Type': 'text/html' } });
    }

    if (path === '/player-mini') {
      return new Response(`<!DOCTYPE html>
<html><body style="background:#111;color:#fff;font-family:monospace;padding:20px">
<div id="s1">1: startar...</div>
<div id="s2">2: ...</div>
<div id="s3">3: ...</div>
<div id="s4">4: ...</div>
<div id="s5">5: ...</div>
<div id="vid-wrap" style="position:relative;width:320px;height:180px;background:#333;margin-top:12px"></div>
<script>
function s(id,t){var e=document.getElementById(id);if(e)e.innerHTML=t;}
var W=location.protocol+'//'+location.host;
s('s1','1: JS ok, W='+W);
fetch(W+'/api/files')
  .then(function(r){return r.json();})
  .then(function(d){
    s('s2','2: '+d.files.length+' filer');
    var f=d.files[0];
    if(!f){s('s3','ingen fil');return;}
    s('s3','3: '+f.type+' — '+f.name);
    var wrap=document.getElementById('vid-wrap');
    if(f.type==='video'){
      var v=document.createElement('video');
      v.src=f.url; v.muted=true; v.setAttribute('muted',''); v.setAttribute('autoplay','');
      v.style.cssText='width:100%;height:100%;';
      wrap.appendChild(v);
      s('s4','4: video tillagd, spelar...');
      var pp=v.play();
      if(pp&&pp.then){
        pp.then(function(){s('s5','5: play() OK');})
          .catch(function(e){s('s5','5: play() FEL: '+e.message);});
      } else {
        s('s5','5: play() returnerade: '+pp);
      }
    } else {
      var img=new Image(); img.src=f.url; img.style.cssText='width:100%;';
      wrap.appendChild(img); s('s4','4: bild tillagd');
    }
  })
  .catch(function(e){s('s2','FEL: '+e.message);});
</script>
</body></html>`, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (path === '/canplay') {
      return new Response(`<!DOCTYPE html>
<html><body style="background:#1e4025;color:#CDDCD1;font-family:monospace;padding:30px;font-size:14px">
<h2 style="margin-bottom:16px">canPlayType</h2>
<div id="out"></div>
<script>
var v = document.createElement('video');
var types = [
  'video/mp4',
  'video/mp4; codecs="avc1.42E01E"',
  'video/mp4; codecs="avc1.4D401E"',
  'video/mp4; codecs="avc1.640028"',
  'video/webm',
  'video/webm; codecs="vp8"',
  'video/ogg',
  'video/ogg; codecs="theora"'
];
var html = '';
for (var i = 0; i < types.length; i++) {
  var r = v.canPlayType(types[i]);
  html += '<div style="margin:4px 0"><b>' + (r || 'NEJ') + '</b> — ' + types[i] + '</div>';
}
document.getElementById('out').innerHTML = html;
</script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
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

    // ── GET /api/schedules — hämta tidsscheman ──────────────────────────────
    if (path === '/api/schedules' && request.method === 'GET') {
      const obj = await env.BUCKET.get('_schedules.json');
      const schedules = obj ? JSON.parse(await obj.text()) : {};
      return json(schedules);
    }

    // ── PUT /api/schedules — spara tidsscheman ───────────────────────────────
    if (path === '/api/schedules' && request.method === 'PUT') {
      if (!isAuthorized()) return err('Ej behörig', 401);
      const body = await request.json();
      await env.BUCKET.put('_schedules.json', JSON.stringify(body), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ ok: true });
    }

    // ── GET /api/playlist — hämta spelliste-konfiguration ───────────────────
    if (path === '/api/playlist' && request.method === 'GET') {
      const obj = await env.BUCKET.get('_playlist.json');
      const config = obj ? JSON.parse(await obj.text()) : { order: [], durations: {} };
      return json(config);
    }

    // ── PUT /api/playlist — spara spelliste-konfiguration ───────────────────
    if (path === '/api/playlist' && request.method === 'PUT') {
      if (!isAuthorized()) return err('Ej behörig', 401);
      const body = await request.json();
      await env.BUCKET.put('_playlist.json', JSON.stringify(body), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ ok: true });
    }

    // ── GET /api/files ───────────────────────────────────────────────────────
    if (path === "/api/files" && request.method === "GET") {
      const listed = await env.BUCKET.list();
      const files = listed.objects
        .filter(obj => !obj.key.startsWith('_') && !obj.key.startsWith('urls/'))
        .map((obj) => ({
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
