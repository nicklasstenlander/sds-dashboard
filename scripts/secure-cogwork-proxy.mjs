#!/usr/bin/env node
/**
 * Låser Cloudflare-workern sds-cogwork-proxy till inloggad CORE-personal.
 *
 * Källan som ska vara publicerad ligger i workers/sds-cogwork-proxy/worker.js.
 * --check jämför den med den publicerade workern. --deploy laddar upp repots
 * fil och rör inte bindings, secrets eller cron.
 *
 *   node scripts/secure-cogwork-proxy.mjs --self-check
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-cogwork-proxy.mjs --pull live-worker.js
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-cogwork-proxy.mjs --check
 *   CLOUDFLARE_API_TOKEN=... node scripts/secure-cogwork-proxy.mjs --deploy
 *
 * Publicera först när CORE-webben är live och en ny iOS-version som skickar
 * samma Authorization-header finns ute. Annars slutar installerade appar.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadWorker, sentryModules, sha256, uploadWorker } from './cf-worker.mjs'
import { selfCheckPublicCatalog } from './public-catalog-contract.mjs'

const SCRIPT_NAME = 'sds-cogwork-proxy'
const REPO_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../workers/sds-cogwork-proxy/worker.js')

export const PATCHES = [
  {
    name: 'staff-constants',
    from: 'var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\n',
    to: `var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var STAFF_ROLES = ["admin", "teacher", "receptionist"];
var ALLOWED_ORIGINS = [
  "https://core.sollentunadansochscenskola.se",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
var SMS_SENDER = "0850278989";
`,
  },
  {
    name: 'auth-gate',
    from: `    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    const apiKey = env.COGWORK_API_KEY;
    const telavoxToken = env.TELAVOX_API_KEY;
`,
    to: `    const corsHeaders = corsHeadersFor(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    const apiKey = env.COGWORK_API_KEY;
    const telavoxToken = env.TELAVOX_API_KEY;
    let staff = null;
    if (url.pathname !== "/push/notify-internal") {
      const gate = await requireStaff(request, env, corsHeaders);
      if (gate instanceof Response) return gate;
      staff = gate;
    }
`,
  },
  {
    name: 'register-device-role',
    from: `      const {
        deviceToken,
        userId,
        role,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      } = body;
      if (!deviceToken) return json({ error: "deviceToken kr\\xE4vs" }, 400, corsHeaders);
      const { news, bookingsFlag, paymentsFlag, followed } = normalizeNotificationPrefs({
        role,
`,
    to: `      const {
        deviceToken,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      } = body;
      if (!deviceToken) return json({ error: "deviceToken kr\\xE4vs" }, 400, corsHeaders);
      if (!staff) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
      const userId = staff.userId;
      const role = staff.role;
      const { news, bookingsFlag, paymentsFlag, followed } = normalizeNotificationPrefs({
        role,
`,
  },
  {
    name: 'preferences-role',
    from: `      const {
        deviceToken,
        role,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      } = body;
      if (!deviceToken) return json({ error: "deviceToken kr\\xE4vs" }, 400, corsHeaders);
      const { news, bookingsFlag, paymentsFlag, followed } = normalizeNotificationPrefs({
        role,
`,
    to: `      const {
        deviceToken,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      } = body;
      if (!deviceToken) return json({ error: "deviceToken kr\\xE4vs" }, 400, corsHeaders);
      if (!staff) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
      const role = staff.role;
      const { news, bookingsFlag, paymentsFlag, followed } = normalizeNotificationPrefs({
        role,
`,
  },
  {
    name: 'preferences-bind-identity',
    from: `        \`UPDATE ios_device_tokens SET
           notify_news = ?,
           notify_new_bookings = ?,
           notify_payments = ?,
           followed_event_ids = ?,
           updated_at = datetime('now')
         WHERE device_token = ?\`
      ).bind(news, bookingsFlag, paymentsFlag, followed, deviceToken).run();`,
    to: `        \`UPDATE ios_device_tokens SET
           user_id = ?,
           role = ?,
           notify_news = ?,
           notify_new_bookings = ?,
           notify_payments = ?,
           followed_event_ids = ?,
           updated_at = datetime('now')
         WHERE device_token = ?\`
      ).bind(staff.userId, staff.role, news, bookingsFlag, paymentsFlag, followed, deviceToken).run();`,
  },
  {
    name: 'telavox-calls-dates',
    from: `      const fromDate = url.searchParams.get("fromDate") || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const toDate = url.searchParams.get("toDate") || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
`,
    to: `      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const fromDate = url.searchParams.get("fromDate") || today;
      const toDate = url.searchParams.get("toDate") || today;
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(fromDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(toDate)) {
        return json({ error: "ogiltigt datum" }, 400, corsHeaders);
      }
`,
  },
  {
    name: 'telavox-dial-log',
    from: `      const number = normalizeNumber(raw);
      console.log("Ringer:", number);
      try {`,
    to: `      const number = normalizeNumber(raw);
      try {`,
  },
  {
    name: 'telavox-sms-sender',
    from: `      const message = url.searchParams.get("message");
      const sender = url.searchParams.get("sender") || "0850278989";
      if (!raw || !message) return json({ error: "number och message kr\\xE4vs" }, 400, corsHeaders);
      const number = normalizeNumber(raw);
      console.log("Skickar SMS till:", number, "fr\\xE5n:", sender);
`,
    to: `      const message = url.searchParams.get("message");
      const sender = SMS_SENDER;
      if (!raw || !message) return json({ error: "number och message kr\\xE4vs" }, 400, corsHeaders);
      if (message.length > 480) return json({ error: "meddelandet \\xE4r f\\xF6r l\\xE5ngt" }, 400, corsHeaders);
      const number = normalizeNumber(raw);
`,
  },
  {
    name: 'cogwork-lookups',
    from: `    if (!apiKey) return json({ error: "COGWORK_API_KEY saknas" }, 500, corsHeaders);
    const type = url.searchParams.get("type") || "bookings";
`,
    to: `    if (url.pathname === "/cogwork/users" && request.method === "GET") {
      if (!apiKey) return json({ error: "COGWORK_API_KEY saknas" }, 500, corsHeaders);
      const name = (url.searchParams.get("name") || "").trim();
      const textSearch = (url.searchParams.get("textSearch") || "").trim();
      if (!name && !textSearch) return json({ error: "name eller textSearch kr\\xE4vs" }, 400, corsHeaders);
      if (name.length > 200 || textSearch.length > 200) return json({ error: "f\\xF6r l\\xE5ng s\\xF6kning" }, 400, corsHeaders);
      const params = { verbose: "1", maxRows: textSearch ? "50" : "20" };
      if (name) params.name = name;
      if (textSearch) params.textSearch = textSearch;
      try {
        return json(await cogworkFetch(apiKey, "/users/", params), 200, corsHeaders);
      } catch (err) {
        return json({ error: err.message }, 502, corsHeaders);
      }
    }
    if (url.pathname === "/cogwork/bookings" && request.method === "GET") {
      if (!apiKey) return json({ error: "COGWORK_API_KEY saknas" }, 500, corsHeaders);
      const eventId = (url.searchParams.get("eventId") || "").trim();
      const userId = (url.searchParams.get("userId") || "").trim();
      if (!eventId && !userId) return json({ error: "eventId eller userId kr\\xE4vs" }, 400, corsHeaders);
      if (eventId && !/^\\d+$/.test(eventId)) return json({ error: "ogiltigt eventId" }, 400, corsHeaders);
      if (userId && !/^\\d+$/.test(userId)) return json({ error: "ogiltigt userId" }, 400, corsHeaders);
      const maxRowsRaw = url.searchParams.get("maxRows") || "500";
      const maxRows = /^\\d+$/.test(maxRowsRaw) ? Math.min(1000, Math.max(1, Number(maxRowsRaw))) : 500;
      const params = { verbose: "1", maxRows: String(maxRows) };
      if (eventId) params.eventId = eventId;
      if (userId) params.userId = userId;
      try {
        return json(await cogworkFetch(apiKey, "/bookings/", params), 200, corsHeaders);
      } catch (err) {
        return json({ error: err.message }, 502, corsHeaders);
      }
    }
    if (!apiKey) return json({ error: "COGWORK_API_KEY saknas" }, 500, corsHeaders);
    const type = url.searchParams.get("type") || "bookings";
    if (!["all", "bookings", "events", "duplicates"].includes(type)) {
      return json({ error: "ok\\xE4nd type" }, 400, corsHeaders);
    }
`,
  },
  {
    name: 'event-block-id',
    from: `    const eventBlockId = url.searchParams.get("eventBlockId") || "";
    const kvKey = type + (eventBlockId ? "_" + eventBlockId : "");
`,
    to: `    const eventBlockId = url.searchParams.get("eventBlockId") || "";
    if (eventBlockId && !/^\\d+$/.test(eventBlockId)) {
      return json({ error: "ogiltigt eventBlockId" }, 400, corsHeaders);
    }
    const kvKey = type + (eventBlockId ? "_" + eventBlockId : "");
`,
  },
  {
    name: 'auth-helpers',
    from: 'async function verifySupabaseJwt(request, env) {',
    to: `function corsHeadersFor(request) {
  const origin = request.headers.get("Origin");
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
    "Cache-Control": "no-store"
  };
}
__name(corsHeadersFor, "corsHeadersFor");
async function requireStaff(request, env, corsHeaders) {
  const authed = await verifySupabaseJwt(request, env);
  if (!authed) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
  const sub = extractJwtSub(request);
  if (!sub || !UUID_RE.test(sub)) return json({ error: "Ej beh\\xF6rig roll" }, 403, corsHeaders);
  let role;
  try {
    role = await resolveCoreUserRole(sub, request, env);
  } catch (err) {
    console.error("rolluppslag misslyckades:", err.message);
    return json({ error: "role_lookup_failed" }, 503, corsHeaders);
  }
  if (!STAFF_ROLES.includes(role)) return json({ error: "Ej beh\\xF6rig roll" }, 403, corsHeaders);
  return { userId: sub, role };
}
__name(requireStaff, "requireStaff");
async function verifySupabaseJwt(request, env) {`,
  },
]

export function patchMatchReport(source) {
  return PATCHES.map((patch) => ({
    name: patch.name,
    count: source.split(patch.from).length - 1,
  }))
}

export function applySecurityPatch(source) {
  let next = source
  const applied = []
  for (const patch of PATCHES) {
    const count = next.split(patch.from).length - 1
    if (count !== 1) {
      throw new Error(`Patch "${patch.name}" matchade ${count} gånger`)
    }
    next = next.replace(patch.from, patch.to)
    applied.push(patch.name)
  }
  if (!next.includes('async function requireStaff') || next.includes('"Access-Control-Allow-Origin": "*"')) {
    throw new Error('Patchen lämnade workern öppen')
  }
  return { source: next, applied }
}

export function readRepoWorker() {
  return readFileSync(REPO_PATH, 'utf8')
}

export function assertCogworkSource(source) {
  if (!source.includes('async function requireStaff')) {
    throw new Error('Repots worker saknar requireStaff')
  }
  // strict2/strict3: wildcard-CORS finns bara i legacyCorsHeaders(), för den
  // publika kurskatalogen. En öppen worker utan det avgränsade läget faller fortfarande.
  const openCors = source.includes('"Access-Control-Allow-Origin": "*"')
  const scopedPublicCors = source.includes('function legacyCorsHeaders')
    && source.includes('var AUTH_MODE = "strict"')
    && source.includes('function publicCatalogView')
  if (openCors && !scopedPublicCors) {
    throw new Error('Repots worker tillåter fortfarande alla origins')
  }
  if (!source.includes('url.pathname !== "/push/notify-internal"')) {
    throw new Error('Repots worker saknar undantaget för intern push')
  }
  // /public/catalog är den enda rutten som skickas vidare före varje auth-gate.
  const publicDispatch = source.indexOf('if (url.pathname === PUBLIC_CATALOG_PATH) return handlePublicCatalogRoute(')
  const firstGate = source.indexOf('await requireStaff(request')
  if (publicDispatch < 0 || publicDispatch > firstGate) {
    throw new Error('Repots worker skickar inte /public/catalog vidare före requireStaff')
  }
}

// Sökvägslitteraler ("/terms", "/push/...") som finns live men inte i repot är
// ändringar gjorda direkt i Cloudflare. En uppladdning skulle radera dem.
export function liveOnlyPaths(live, repoSource) {
  const paths = (src) => new Set([...src.matchAll(/"(\/[a-z][a-z0-9/_-]*)"/gi)].map((m) => m[1]))
  const repo = paths(repoSource)
  return [...paths(live)].filter((p) => !repo.has(p))
}

export function compareToLive(live, repoSource = readRepoWorker()) {
  assertCogworkSource(repoSource)
  const repoHash = sha256(repoSource)
  const liveHash = sha256(live)
  if (liveHash === repoHash) return { state: 'match', repoHash }
  const drift = liveOnlyPaths(live, repoSource)
  if (drift.length) {
    throw new Error(`Publicerad worker har rutter som saknas i repot: ${drift.join(', ')}. Synka live till repot innan uppladdning.`)
  }
  // Live är redan låst (strict): repot är en nyare låst version, inte patchen av en öppen worker.
  if (live.includes('async function requireStaff') && live.includes('var AUTH_MODE = "strict"')) {
    return { state: 'locked-live-update', repoHash }
  }
  const { source } = applySecurityPatch(live)
  if (sha256(source) !== repoHash) {
    throw new Error('Publicerad worker matchar varken repot eller patchen. Ingen uppladdning.')
  }
  return { state: 'unpatched-live', repoHash }
}

async function main() {
  if (process.argv.includes('--self-check')) {
    assertCogworkSource(readRepoWorker())
    await selfCheckPublicCatalog(REPO_PATH)
    console.log('OK: workers/sds-cogwork-proxy/worker.js är den låsta källan.')
    console.log('OK: /public/catalog svarar utan token, bara allowlistade fält, inga personuppgifter, POST ger 405, övriga rutter 401.')
    return
  }
  const deploy = process.argv.includes('--deploy')
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    console.error('CLOUDFLARE_API_TOKEN saknas')
    process.exit(1)
  }
  const pullIndex = process.argv.indexOf('--pull')
  if (pullIndex > 0) {
    const out = process.argv[pullIndex + 1]
    if (!out || out.startsWith('--')) throw new Error('--pull kräver en filsökväg')
    const live = await downloadWorker(token, SCRIPT_NAME)
    writeFileSync(out, live)
    console.log(`Live-källan sparad i ${out} (${sha256(live)}). Inget laddades upp.`)
    return
  }
  const repoSource = readRepoWorker()
  const live = await downloadWorker(token, SCRIPT_NAME)
  const { state, repoHash } = compareToLive(live, repoSource)
  console.log({
    match: `Publicerad worker matchar repot (${repoHash}).`,
    'locked-live-update': `Publicerad worker är låst men äldre än repot. Repot (${repoHash}) kan laddas upp.`,
    'unpatched-live': `Publicerad worker är oparad. Repot är patchen (${repoHash}).`,
  }[state])
  if (!deploy) {
    console.log('Ingen uppladdning (--deploy saknas).')
    return
  }
  console.log('Sentry: sätt compatibility_date >= 2024-09-23 och compatibility_flag nodejs_compat på workern. Skriptet ändrar inte de inställningarna. Utan flaggan svarar workern som vanligt, men fel skickas inte till Sentry.')
  if (state === 'match') {
    console.log('Redan publicerad.')
    return
  }
  const uploaded = await uploadWorker(token, SCRIPT_NAME, repoSource, sentryModules(dirname(REPO_PATH)))
  console.log('Uppladdad', JSON.stringify(uploaded?.result ?? uploaded).slice(0, 400))
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('secure-cogwork-proxy.mjs')
if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
