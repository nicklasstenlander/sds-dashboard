const PLAYER_HTML = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="google" content="notranslate">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SODSS Skyltning</title>
  <style>
    * { cursor: none !important; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #000;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    #player {
      position: relative;
      width: 100vw;
      height: 100vh;
      background: #000;
    }

    /* ── Slides ── */
    .slide {
      position: absolute;
      top: 0; right: 0; bottom: 0; left: 0;
      opacity: 0;
      pointer-events: none;
    }
    .slide img {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
    }
    .slide video {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
    }
    .slide iframe {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
      border: none;
      background: #000;
    }

    /* ── Progress bar ── */
    #progress {
      position: fixed;
      bottom: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: #dd5c86;
      opacity: 0.75;
      z-index: 50;
      transition: width linear;
    }

    /* ── Loader ── */
    #loader {
      position: fixed;
      top: 0; right: 0; bottom: 0; left: 0;
      background: #1e4025;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      z-index: 100;
      transition: opacity 0.6s ease;
    }
    #loader.hidden {
      opacity: 0;
      pointer-events: none;
    }
    #loader .spinner {
      width: 42px;
      height: 42px;
      border: 3px solid rgba(205,220,209,0.3);
      border-top-color: #CDDCD1;
      border-radius: 50%;
      animation: spin 1.1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #loader p {
      color: #CDDCD1;
      font-size: 13px;
      font-family: monospace;
      letter-spacing: 0.1em;
    }
    #loader .logo {
      font-family: monospace;
      font-size: 11px;
      letter-spacing: 0.2em;
      color: rgba(205,220,209,0.4);
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    /* ── Error ── */
    #error {
      position: fixed;
      top: 0; right: 0; bottom: 0; left: 0;
      background: #1e4025;
      color: #CDDCD1;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      font-family: monospace;
      text-align: center;
      padding: 48px;
    }
    #error.visible { display: flex; }
    #error .icon { font-size: 40px; }
    #error strong { font-size: 16px; }
    #error span { font-size: 13px; opacity: 0.6; }
    #error small { font-size: 11px; opacity: 0.35; margin-top: 8px; }

    /* ── Clock (valfritt) ── */
    #clock {
      position: fixed;
      bottom: 20px;
      right: 24px;
      color: rgba(255,255,255,0.25);
      font-family: monospace;
      font-size: 12px;
      letter-spacing: 0.06em;
      z-index: 40;
    }

    /* ── Slide counter (valfritt) ── */
    #counter {
      position: fixed;
      bottom: 20px;
      left: 24px;
      color: rgba(255,255,255,0.2);
      font-family: monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      z-index: 40;
    }
  </style>
</head>
<body>

<div id="loader">
  <div class="logo">SODSS · Skyltning</div>
  <div class="spinner"></div>
  <p id="loader-msg">Hämtar spellista…</p>
</div>

<div id="error">
  <div class="icon">⚠</div>
  <strong>Kunde inte ladda spellista</strong>
  <span id="error-msg"></span>
  <small id="error-detail"></small>
</div>

<div id="player"></div>
<div id="progress"></div>
<div id="clock"></div>
<div id="counter"></div>

<script>
// ─── URL-parametrar ──────────────────────────────────────────────────────────
//
//  Valfria:
//    ?worker=https://sodss-signage.xxx.workers.dev   (default: samma origin)
//    &screen=reception        (default: reception)
//    &reload=30               (minuter mellan omhämtning av manifest, default 30)
//    &clock=1                 (visa klocka nere till höger)
//    &counter=1               (visa bildräknare nere till vänster)

var p          = new URLSearchParams(location.search);
var WORKER_URL = p.get('worker') || (location.protocol + '//' + location.host);
var SCREEN_ID  = p.get('screen') || 'reception';
var RELOAD_MIN = parseInt(p.get('reload') || '30');
var SHOW_CLOCK = p.get('clock') === '1';
var SHOW_COUNT = p.get('counter') === '1';

// ─── DOM ─────────────────────────────────────────────────────────────────────
var playerEl  = document.getElementById('player');
var loaderEl  = document.getElementById('loader');
var loaderMsg = document.getElementById('loader-msg');
var errorEl   = document.getElementById('error');
var errorMsg  = document.getElementById('error-msg');
var errorDet  = document.getElementById('error-detail');
var progressEl= document.getElementById('progress');
var clockEl   = document.getElementById('clock');
var counterEl = document.getElementById('counter');

// ─── State ───────────────────────────────────────────────────────────────────
var playlist      = [];
var current       = -1;
var advTimer      = null;
var lastSignature = null;

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showError(msg, detail) {
  loaderEl.style.opacity = '0';
  loaderEl.style.pointerEvents = 'none';
  errorEl.style.display = 'flex';
  errorMsg.innerHTML = msg;
  errorDet.innerHTML = detail || '';
}

function hideLoader() {
  loaderEl.style.opacity = '0';
  loaderEl.style.pointerEvents = 'none';
}

// ─── Clock ───────────────────────────────────────────────────────────────────
clockEl.style.display = SHOW_CLOCK ? 'block' : 'none';
counterEl.style.display = SHOW_COUNT ? 'block' : 'none';

function updateClock() {
  if (!SHOW_CLOCK) return;
  clockEl.textContent = new Date().toLocaleTimeString('sv-SE', {
    hour: '2-digit', minute: '2-digit'
  });
}
setInterval(updateClock, 15000);
updateClock();

// ─── Tidsstyrning (per objekt, nyckel = R2-nyckel t.ex. "reception/foo.jpg") ──
function isScheduledNow(schedule) {
  if (!schedule) return true;
  var now = new Date();
  var today = now.getFullYear() + '-' +
    ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
    ('0' + now.getDate()).slice(-2);
  var timeNow = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  var dow = now.getDay();
  var isoDay = dow === 0 ? 7 : dow; // 1=Mån … 7=Sön
  if (schedule.dateFrom && today < schedule.dateFrom) return false;
  if (schedule.dateTo   && today > schedule.dateTo)   return false;
  if (schedule.timeFrom && timeNow < schedule.timeFrom) return false;
  if (schedule.timeTo   && timeNow > schedule.timeTo)   return false;
  if (schedule.weekdays && schedule.weekdays.length > 0 &&
      schedule.weekdays.indexOf(isoDay) === -1) return false;
  return true;
}

var schedules = {};

// ─── Service Worker (lokal cache av bild/video) ───────────────────────────────
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(function() {});
}

function syncServiceWorkerCache(items) {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  var urls = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type === 'image' || items[i].type === 'video') urls.push(items[i].url);
  }
  navigator.serviceWorker.controller.postMessage({ type: 'sync-playlist', urls: urls });
}

// Signatur av den resolvade (schema-filtrerade, url-kompletta) spellistan.
// Jämförs istället för manifest.updated: ett rent updated-baserat schema
// missar ändringar som inte rör manifestet självt — ett ändrat tidsschema
// i /api/schedules, eller en ersatt fil vars nya etag redan slagits upp av
// Workern men vars manifest.json inte sparats om.
function playlistSignature(list) {
  var parts = [];
  for (var i = 0; i < list.length; i++) {
    parts.push(list[i].id + '|' + list[i].type + '|' + list[i].url + '|' + list[i].duration);
  }
  return parts.join(',');
}

// ─── Fetch manifest från Worker ───────────────────────────────────────────────
// Returnerar: 'built' (ny spellista, bygg om DOM), 'unchanged' (inget att göra),
// 'error' (kallstart utan manifest — felskärm visas)
function fetchPlaylist() {
  loaderMsg.innerHTML = 'Hämtar spellista…';
  return Promise.all([
    fetch(WORKER_URL + '/api/playlist/' + SCREEN_ID).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
    fetch(WORKER_URL + '/api/schedules').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }),
  ]).then(function(results) {
    var manifest = results[0];
    schedules = results[1];

    var rawItems = manifest.items || [];
    var mapped = rawItems.map(function(it) {
      if (it.type === 'web') {
        return { id: it.id, type: 'web', url: it.url, duration: it.duration || 30 };
      }
      var mediaUrl = WORKER_URL + '/media/' + it.key + (it.etag ? ('?v=' + it.etag) : '');
      return { id: it.id, type: it.type, key: it.key, url: mediaUrl, duration: it.duration || 8 };
    }).filter(function(it) {
      return it.type === 'web' ? true : isScheduledNow(schedules[it.key]);
    });

    syncServiceWorkerCache(mapped);

    var signature = playlistSignature(mapped);
    if (signature === lastSignature) {
      return 'unchanged';
    }

    if (mapped.length === 0) {
      if (playlist.length > 0) return 'unchanged';
      showError('Inga inslag', 'Spellistan är tom just nu');
      return 'error';
    }

    playlist = mapped;
    lastSignature = signature;
    return 'built';
  }).catch(function(fetchErr) {
    if (playlist.length > 0) return 'unchanged'; // Offline-tålighet: fortsätt spela ur cachen
    showError('Fetch-fel: ' + fetchErr.message + ' | URL: ' + WORKER_URL);
    return 'error';
  });
}

// ─── Bygg slide-DOM ───────────────────────────────────────────────────────────
function buildSlides() {
  playerEl.innerHTML = '';

  for (var i = 0; i < playlist.length; i++) {
    var item = playlist[i];
    var slide = document.createElement('div');
    slide.className = 'slide';
    slide.setAttribute('data-index', i);

    if (item.type === 'image') {
      var img = new Image();
      img.src = item.url;
      img.alt = '';
      slide.appendChild(img);

    } else if (item.type === 'video') {
      var vid = document.createElement('video');
      vid.muted    = true;
      vid.defaultMuted = true;
      vid.setAttribute('muted', '');
      vid.setAttribute('playsinline', '');
      vid.preload  = 'auto';
      vid.loop     = false;
      vid.src      = item.url;

      vid.addEventListener('ended', function() {
        if (parseInt(slide.getAttribute('data-index')) === current) nextSlide();
      });
      vid.addEventListener('error', function() {
        if (parseInt(slide.getAttribute('data-index')) === current) nextSlide();
      });

      slide.appendChild(vid);

    } else if (item.type === 'web') {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      slide.appendChild(iframe);
    }

    playerEl.appendChild(slide);
  }
}

// ─── Visa bild/video/webblänk ─────────────────────────────────────────────────
function showSlide(idx) {
  clearTimeout(advTimer);

  // Stoppa alla videor och sätt rätt synlighet med for-loop
  var allSlides = playerEl.getElementsByClassName('slide');
  for (var si = 0; si < allSlides.length; si++) {
    var s = allSlides[si];
    var isActive = si === idx;
    s.style.opacity = isActive ? '1' : '0';
    s.style.pointerEvents = isActive ? 'auto' : 'none';
    var svid = s.getElementsByTagName('video')[0];
    if (svid && !isActive) { svid.pause(); svid.currentTime = 0; }
  }

  if (SHOW_COUNT) {
    counterEl.innerHTML = (idx + 1) + ' / ' + playlist.length;
  }

  var item = playlist[idx];
  if (!item) return;

  progressEl.style.transition = 'none';
  progressEl.style.width = '0%';

  if (item.type === 'image') {
    var dur = (item.duration || 8) * 1000;
    requestAnimationFrame(function() {
      progressEl.style.transition = 'width ' + dur + 'ms linear';
      progressEl.style.width = '100%';
    });
    advTimer = setTimeout(nextSlide, dur);

  } else if (item.type === 'web') {
    var activeWebSlide = allSlides[idx];
    var iframeEl = activeWebSlide ? activeWebSlide.getElementsByTagName('iframe')[0] : null;
    if (iframeEl) iframeEl.src = item.url; // ladda om varje gång sliden aktiveras
    var wdur = (item.duration || 30) * 1000;
    requestAnimationFrame(function() {
      progressEl.style.transition = 'width ' + wdur + 'ms linear';
      progressEl.style.width = '100%';
    });
    advTimer = setTimeout(nextSlide, wdur);

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

function nextSlide() {
  if (playlist.length === 0) return;
  current = (current + 1) % playlist.length;
  showSlide(current);
}

// ─── Starta ───────────────────────────────────────────────────────────────────
function init() {
  registerServiceWorker();
  fetchPlaylist().then(function(status) {
    if (status !== 'built') return;
    buildSlides();
    hideLoader();
    current = 0;
    showSlide(0);
  });
}

// ─── Auto-reload manifest ─────────────────────────────────────────────────────
// Hämtar om manifestet var N:e minut utan att avbryta pågående uppspelning
// om inget faktiskt ändrats (manifest.updated oförändrat).
setInterval(function() {
  fetchPlaylist().then(function(status) {
    if (status === 'built') buildSlides(); // Slideshow fortsätter från current
  });
}, RELOAD_MIN * 60 * 1000);

// ─── Tangentbordsgenvägar (testläge) ─────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowRight') nextSlide();
  if (e.key === 'ArrowLeft') {
    current = (current - 2 + playlist.length) % playlist.length;
    nextSlide();
  }
  if (e.key === 'f' || e.key === 'F') {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }
});

// ─── Kör ─────────────────────────────────────────────────────────────────────
init();
</script>
</body>
</html>
`;

// ─── Service Worker — lokal cache av bild/video, servad på /sw.js ────────────
const SW_JS = `var CACHE_NAME = 'sodss-media-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function(event) {
  var data = event.data;
  if (!data || data.type !== 'sync-playlist') return;
  event.waitUntil(syncPlaylist(data.urls || []));
});

function syncPlaylist(urls) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.keys().then(function(existingRequests) {
      var wanted = urls.slice();
      var existingUrls = existingRequests.map(function(r) { return r.url; });

      var toFetch = wanted.filter(function(u) { return existingUrls.indexOf(u) === -1; });
      var toDelete = existingRequests.filter(function(r) { return wanted.indexOf(r.url) === -1; });

      var fetchPromises = toFetch.map(function(u) {
        return fetch(u).then(function(response) {
          if (response && response.ok) return cache.put(u, response);
        }).catch(function() {});
      });

      var deletePromises = toDelete.map(function(r) { return cache.delete(r); });

      return Promise.all(fetchPromises.concat(deletePromises));
    });
  });
}

self.addEventListener('fetch', function(event) {
  var req = event.request;
  var reqUrl = new URL(req.url);

  if (reqUrl.pathname.indexOf('/media/') !== 0) return; // bara /media/ hanteras, allt annat går till nätet som vanligt

  var rangeHeader = req.headers.get('Range');

  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req.url).then(function(cached) {
        if (cached) {
          if (rangeHeader) return rangeFromCache(cached, rangeHeader);
          return cached;
        }
        return fetch(req); // cache-miss → nätet, cacha inte här (nästa sync-playlist fyller på)
      });
    })
  );
});

async function rangeFromCache(cached, rangeHeader) {
  var buf = await cached.arrayBuffer();
  var size = buf.byteLength;
  var m = /bytes=(\\d*)-(\\d*)/.exec(rangeHeader);
  var start = m && m[1] ? parseInt(m[1], 10) : 0;
  var end   = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (end >= size) end = size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type':   cached.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range':  'bytes ' + start + '-' + end + '/' + size,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges':  'bytes'
    }
  });
}
`;

/**
 * SODSS Signage — Cloudflare Worker (v2, två skärmar + fjärrstyrning)
 *
 * R2-layout:
 *   reception/<filnamn>                media för Skärm Reception
 *   lounge/<filnamn>                   media för Skärm Lounge
 *   playlists/reception.json           manifest (spellista) för Skärm Reception
 *   playlists/lounge.json              manifest (spellista) för Skärm Lounge
 *   _schedules.json                    tidsstyrning, nyckel = R2-nyckel (t.ex "reception/foo.jpg")
 *
 *   screens/<id>/status.json           senaste heartbeat från Pi-agenten
 *   screens/<id>/latest.jpg            senaste skärmdump
 *   screens/<id>/screenshot-meta.json  { capturedAt, hostname } för senaste skärmdump
 *   screens/<id>/commands/<cmdId>.json ett fjärrkommando (pending → running → done/failed)
 *
 *   Detta är ett eget namespace, skilt från <id>/ (mediafiler) och playlists/<id>.json.
 *
 * Endpoints:
 *   GET    /api/screens                            → [{ id, name, online, lastHeartbeatAt,
 *                                                        lastScreenshotAt, temperature, uptime,
 *                                                        lastCommand }] (publik)
 *   POST   /api/screens/<id>/commands               skapa fjärrkommando { type }           [admin-auth]
 *   GET    /api/files?screen=<id>                  → filer under <id>/
 *   POST   /api/upload?screen=<id>                 → ladda upp till <id>/<sanerat filnamn>  [admin-auth]
 *   DELETE /api/files/<id>/<filnamn>                ta bort fil                             [admin-auth]
 *   GET    /api/playlist/<id>                       manifest (publik — spelaren läser den)
 *   PUT    /api/playlist/<id>                       sparar manifest                         [admin-auth]
 *   GET    /api/schedules                           tidsstyrning (alla skärmar, keyed på R2-nyckel)
 *   PUT    /api/schedules                           sparar tidsstyrning                     [admin-auth]
 *   GET    /media/<id>/<filnamn>                    serverar fil med Range-stöd
 *   GET    /player?screen=<id>                      spelaren
 *   GET    /sw.js                                   Service Worker (lokal cache på Pi:n)
 *
 *   POST   /api/screens/<id>/heartbeat              agentens heartbeat                      [agent-auth]
 *   POST   /api/screens/<id>/screenshot             agentens skärmdumpsuppladdning          [agent-auth]
 *   GET    /api/screens/<id>/commands/next           hämta/starta nästa väntande kommando    [agent-auth]
 *   POST   /api/screens/<id>/commands/<cmdId>/result rapportera kommandoresultat             [agent-auth]
 *
 * Miljövariabler (Cloudflare Dashboard → Worker → Settings → Variables):
 *   BUCKET               — R2 Bucket binding (se wrangler.toml)
 *   ADMIN_SECRET         — En hemlig sträng, t.ex. ett långt lösenord (Core-GUI:t)
 *   CORS_ORIGIN          — URL till din Core-dashboard, t.ex. https://core.sollentunadansochscenskola.se
 *   CORE_AGENT_TOKEN     — Delad hemlighet för alla Pi-agenter (fallback om SCREEN_AGENT_TOKENS saknar id)
 *   SCREEN_AGENT_TOKENS  — JSON, per-skärm-tokens: {"reception":"...","lounge":"..."}
 */

const SCREENS = [
  { id: 'reception', name: 'Skärm Reception' },
  { id: 'lounge', name: 'Skärm Lounge' },
];

const ALLOWED_COMMAND_TYPES = ['screenshot_now', 'reload_browser', 'restart_browser', 'reboot_pi'];
const HEARTBEAT_ONLINE_WINDOW_MS = 120 * 1000; // 2× agentens 60s-intervall

function isValidScreen(id) {
  return SCREENS.some((s) => s.id === id);
}

// Agent-auth: skild från admin-isAuthorized(). Accepterar SCREEN_AGENT_TOKENS[screenId]
// om satt, annars CORE_AGENT_TOKEN som delad fallback. Agenten kan aldrig skapa kommandon
// åt sig själv med denna — bara hämta/rapportera på dem (se admin-auth för /commands POST).
function isAgentAuthorized(request, screenId, env) {
  const auth = request.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/);
  if (!match) return false;
  const token = match[1];

  let perScreenTokens = {};
  if (env.SCREEN_AGENT_TOKENS) {
    try {
      perScreenTokens = JSON.parse(env.SCREEN_AGENT_TOKENS);
    } catch (e) {
      console.log('[agent-auth] SCREEN_AGENT_TOKENS är inte giltig JSON', e);
    }
  }

  if (Object.prototype.hasOwnProperty.call(perScreenTokens, screenId)) {
    return token === perScreenTokens[screenId];
  }
  if (env.CORE_AGENT_TOKEN) return token === env.CORE_AGENT_TOKEN;
  return false;
}

async function readJsonObject(env, key) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch (e) {
    console.log(`[screens] trasig JSON för "${key}"`, e);
    return null;
  }
}

async function writeJsonObject(env, key, data) {
  await env.BUCKET.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
  });
}

// Senast skapade/uppdaterade kommando för en skärm (för lastCommand i /api/screens).
async function getLastCommand(env, screenId) {
  const listed = await env.BUCKET.list({ prefix: `screens/${screenId}/commands/` });
  let latest = null;
  for (const o of listed.objects) {
    const cmd = await readJsonObject(env, o.key);
    if (!cmd) continue;
    const stamp = cmd.updatedAt || cmd.createdAt || '';
    const latestStamp = latest ? (latest.updatedAt || latest.createdAt || '') : '';
    if (!latest || stamp > latestStamp) latest = cmd;
  }
  return latest;
}

// Äldsta kommandot med status "pending" för en skärm.
async function getOldestPendingCommand(env, screenId) {
  const listed = await env.BUCKET.list({ prefix: `screens/${screenId}/commands/` });
  let oldest = null;
  for (const o of listed.objects) {
    const cmd = await readJsonObject(env, o.key);
    if (!cmd || cmd.status !== 'pending') continue;
    if (!oldest || (cmd.createdAt || '') < (oldest.createdAt || '')) oldest = cmd;
  }
  return oldest;
}

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

    // ── Auth (för POST, PUT och DELETE) ──────────────────────────────────────
    function isAuthorized() {
      if (!env.ADMIN_SECRET) return true; // inget secret konfigurerat = öppet
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

    // ── GET /sw.js — Service Worker för lokal cache på Pi:n ───────────────────
    if (path === '/sw.js' && request.method === 'GET') {
      return new Response(SW_JS, {
        headers: {
          'Content-Type': 'application/javascript',
          'Service-Worker-Allowed': '/',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // ── GET /api/screens — statisk lista + liveuppgifter (publik) ────────────
    if (path === '/api/screens' && request.method === 'GET') {
      const now = Date.now();
      const enriched = await Promise.all(SCREENS.map(async (s) => {
        const status = await readJsonObject(env, `screens/${s.id}/status.json`);
        const meta = await readJsonObject(env, `screens/${s.id}/screenshot-meta.json`);
        const lastCommand = await getLastCommand(env, s.id);

        const lastHeartbeatAt = status?.receivedAt ?? null;
        const online = lastHeartbeatAt != null
          && (now - new Date(lastHeartbeatAt).getTime()) <= HEARTBEAT_ONLINE_WINDOW_MS;

        return {
          id: s.id,
          name: s.name,
          online,
          lastHeartbeatAt,
          lastScreenshotAt: meta?.capturedAt ?? null,
          temperature: status?.temperature ?? null,
          uptime: status?.uptime ?? null,
          lastCommand: lastCommand
            ? { type: lastCommand.type, status: lastCommand.status, error: lastCommand.error ?? null }
            : null,
        };
      }));
      return json(enriched);
    }

    // ── POST /api/screens/<id>/commands — skapa fjärrkommando (Core-GUI:t) [admin-auth] ─
    const commandsCreateMatch = path.match(/^\/api\/screens\/([^/]+)\/commands$/);
    if (commandsCreateMatch && request.method === 'POST') {
      const screenId = commandsCreateMatch[1];
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      if (!isAuthorized()) return err('Ej behörig', 401);

      const body = await request.json();
      if (!ALLOWED_COMMAND_TYPES.includes(body.type)) return err('Okänt kommandotyp', 400);

      const commandId = randomId();
      const now = new Date().toISOString();
      const command = { id: commandId, type: body.type, status: 'pending', createdAt: now, updatedAt: now };
      await writeJsonObject(env, `screens/${screenId}/commands/${commandId}.json`, command);
      return json({ commandId });
    }

    // ── POST /api/screens/<id>/heartbeat — agentens heartbeat [agent-auth] ────
    const heartbeatMatch = path.match(/^\/api\/screens\/([^/]+)\/heartbeat$/);
    if (heartbeatMatch && request.method === 'POST') {
      const screenId = heartbeatMatch[1];
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      if (!isAgentAuthorized(request, screenId, env)) return err('Ej behörig', 401);

      const body = await request.json();
      const status = {
        hostname: body.hostname ?? null,
        localTime: body.localTime ?? null,
        uptime: body.uptime ?? null,
        temperature: body.temperature ?? null,
        tailscaleIp: body.tailscaleIp ?? null,
        agentVersion: body.agentVersion ?? null,
        receivedAt: new Date().toISOString(),
      };
      await writeJsonObject(env, `screens/${screenId}/status.json`, status);
      return json({ ok: true });
    }

    // ── POST /api/screens/<id>/screenshot — agentens skärmdump [agent-auth] ───
    const screenshotMatch = path.match(/^\/api\/screens\/([^/]+)\/screenshot$/);
    if (screenshotMatch && request.method === 'POST') {
      const screenId = screenshotMatch[1];
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      if (!isAgentAuthorized(request, screenId, env)) return err('Ej behörig', 401);

      const contentType = request.headers.get('Content-Type') ?? '';
      if (!contentType.includes('multipart/form-data')) return err('Förväntar multipart/form-data');

      const formData = await request.formData();
      const file = formData.get('screenshot');
      if (!file || typeof file === 'string') return err('Ingen skärmdump i formuläret');

      const capturedAtField = formData.get('capturedAt');
      const hostnameField = formData.get('hostname');

      await env.BUCKET.put(`screens/${screenId}/latest.jpg`, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });
      await writeJsonObject(env, `screens/${screenId}/screenshot-meta.json`, {
        capturedAt: typeof capturedAtField === 'string' && capturedAtField ? capturedAtField : new Date().toISOString(),
        hostname: typeof hostnameField === 'string' ? hostnameField : null,
      });
      return json({ ok: true });
    }

    // ── GET /api/screens/<id>/commands/next — hämta nästa kommando [agent-auth] ─
    const commandsNextMatch = path.match(/^\/api\/screens\/([^/]+)\/commands\/next$/);
    if (commandsNextMatch && request.method === 'GET') {
      const screenId = commandsNextMatch[1];
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      if (!isAgentAuthorized(request, screenId, env)) return err('Ej behörig', 401);

      const next = await getOldestPendingCommand(env, screenId);
      if (!next) return json({});

      next.status = 'running';
      next.updatedAt = new Date().toISOString();
      await writeJsonObject(env, `screens/${screenId}/commands/${next.id}.json`, next);
      return json({ commandId: next.id, type: next.type });
    }

    // ── POST /api/screens/<id>/commands/<cmdId>/result — kommandoresultat [agent-auth] ─
    const commandResultMatch = path.match(/^\/api\/screens\/([^/]+)\/commands\/([^/]+)\/result$/);
    if (commandResultMatch && request.method === 'POST') {
      const [, screenId, commandId] = commandResultMatch;
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      if (!isAgentAuthorized(request, screenId, env)) return err('Ej behörig', 401);

      const body = await request.json();
      if (body.status !== 'done' && body.status !== 'failed') return err('Ogiltig status', 400);

      const key = `screens/${screenId}/commands/${commandId}.json`;
      const existing = await readJsonObject(env, key);
      if (!existing) return err('Okänt kommando', 404);

      existing.status = body.status;
      existing.updatedAt = new Date().toISOString();
      if (body.status === 'failed' && body.error) existing.error = String(body.error).slice(0, 500);
      else delete existing.error;
      await writeJsonObject(env, key, existing);
      return json({ ok: true });
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

    // ── GET /api/playlist/<id> — hämta manifest ──────────────────────────────
    if (path.startsWith('/api/playlist/') && request.method === 'GET') {
      const screenId = path.replace('/api/playlist/', '');
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      const manifest = await deliverManifest(env, screenId);
      return json(manifest);
    }

    // ── PUT /api/playlist/<id> — spara manifest ──────────────────────────────
    if (path.startsWith('/api/playlist/') && request.method === 'PUT') {
      if (!isAuthorized()) return err('Ej behörig', 401);
      const screenId = path.replace('/api/playlist/', '');
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);
      const body = await request.json();
      const manifest = {
        version: 2,
        updated: new Date().toISOString(),
        items: Array.isArray(body.items) ? body.items : [],
      };
      await env.BUCKET.put(`playlists/${screenId}.json`, JSON.stringify(manifest), {
        httpMetadata: { contentType: 'application/json' },
      });
      return json({ ok: true, manifest });
    }

    // ── GET /api/files?screen=<id> ─────────────────────────────────────────────
    if (path === "/api/files" && request.method === "GET") {
      const screenId = url.searchParams.get('screen');
      if (!screenId) return err('screen-parameter saknas', 400);
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);

      const listed = await env.BUCKET.list({ prefix: `${screenId}/` });
      const files = listed.objects
        .filter((obj) => !obj.key.endsWith('/'))
        .map((obj) => ({
          key: obj.key,
          name: obj.key.slice(screenId.length + 1),
          size: obj.size,
          etag: obj.etag,
          uploaded: obj.uploaded,
          type: guessType(obj.key),
          url: `${url.origin}/media/${obj.key}?v=${obj.etag}`,
        }));
      files.sort((a, b) => a.name.localeCompare(b.name));
      return json({ files });
    }

    // ── GET /media/<key>  — publik filservering (nyckeln inkluderar skärm-prefix) ─
    if (path.startsWith('/media/')) {
      const key = decodeURIComponent(path.replace('/media/', ''));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders });

      const contentType = obj.httpMetadata?.contentType ?? guessMime(key);
      const isVideo = contentType.startsWith('video/');
      const isScreenshot = key.startsWith('screens/') && key.endsWith('/latest.jpg');
      const size = obj.size;

      const baseHeaders = {
        ...corsHeaders,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        // Skärmdumpar ska alltid vara färska — Core cache-bustar med ?t=<lastScreenshotAt>
        // men vi litar inte på det ensamt eftersom webbläsaren annars kan cacha mellan dumpar.
        'Cache-Control': isScreenshot ? 'no-store' : 'public, max-age=31536000, immutable',
        // Ta bort x-frame-options så video kan spelas i iframe/player
        'X-Frame-Options': '',
      };

      // Range request (krävs för video — <video>-element skickar alltid Range)
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

    // ── POST /api/upload?screen=<id> ─────────────────────────────────────────
    if (path === "/api/upload" && request.method === "POST") {
      if (!isAuthorized()) return err("Ej behörig", 401);

      const screenId = url.searchParams.get('screen');
      if (!screenId) return err('screen-parameter saknas', 400);
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);

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
      const key = `${screenId}/${fileName}`;
      const mime = file.type || guessMime(fileName);

      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: mime },
      });
      const head = await env.BUCKET.head(key);

      return json({
        ok: true,
        key,
        name: fileName,
        etag: head?.etag,
        url: `${url.origin}/media/${key}${head?.etag ? `?v=${head.etag}` : ''}`,
        type: guessType(fileName),
      });
    }

    // ── DELETE /api/files/<id>/<filnamn> ─────────────────────────────────────
    if (path.startsWith("/api/files/") && request.method === "DELETE") {
      if (!isAuthorized()) return err("Ej behörig", 401);

      const rest = decodeURIComponent(path.replace("/api/files/", ""));
      const slashIdx = rest.indexOf('/');
      if (slashIdx === -1) return err('Förväntar /api/files/<screen>/<filnamn>', 400);

      const screenId = rest.slice(0, slashIdx);
      const fileName = rest.slice(slashIdx + 1);
      if (!isValidScreen(screenId)) return err('Okänd skärm', 404);

      const key = `${screenId}/${fileName}`;
      await env.BUCKET.delete(key);
      return json({ ok: true, deleted: key });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

// ─── Manifest-hjälpare ──────────────────────────────────────────────────────────

// Läser playlists/<id>.json. Saknas den: bygg den från bucketens innehåll
// (självläkning — en skärm ska aldrig sluta fungera bara för att manifestet
// inte hunnit skapas) och spara den.
async function getOrBuildManifest(env, screenId) {
  const key = `playlists/${screenId}.json`;
  const obj = await env.BUCKET.get(key);
  if (obj) {
    try {
      return JSON.parse(await obj.text());
    } catch (e) {
      console.log(`[playlist:${screenId}] trasigt manifest, bygger om`, e);
    }
  }
  const manifest = await buildManifestFromBucket(env, screenId);
  await env.BUCKET.put(key, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });
  return manifest;
}

async function buildManifestFromBucket(env, screenId) {
  const listed = await env.BUCKET.list({ prefix: `${screenId}/` });
  const items = listed.objects
    .filter((o) => !o.key.endsWith('/'))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((o) => {
      const type = guessType(o.key);
      const item = { id: randomId(), type, key: o.key };
      if (type === 'image') item.duration = 8;
      return item;
    });
  return { version: 2, updated: new Date().toISOString(), items };
}

// Hämtar manifestet och validerar varje medieobjekt mot R2 vid leverans.
// Ett objekt vars nyckel inte längre finns hoppas över (och loggas) — men
// manifestet i R2 rörs inte. Etag hämtas färskt (head()) så en ersatt fil
// alltid får ny cache-bustande ?v=-URL, även om manifestet inte sparats om.
async function deliverManifest(env, screenId) {
  const manifest = await getOrBuildManifest(env, screenId);
  const items = [];
  for (const item of manifest.items || []) {
    if (item.type === 'web') {
      items.push(item);
      continue;
    }
    const head = await env.BUCKET.head(item.key);
    if (!head) {
      console.log(`[playlist:${screenId}] saknar objekt för nyckel "${item.key}", hoppar över`);
      continue;
    }
    items.push({ ...item, etag: head.etag });
  }
  return { ...manifest, items };
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

// ─── Övriga helpers ──────────────────────────────────────────────────────────────

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
