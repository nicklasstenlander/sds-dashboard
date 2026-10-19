var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var ORG = "sollentunadans";
var BASE_URL = "https://dans.se/api/public";
var TELAVOX_BASE = "https://api.telavox.se";
var CACHE_TTL = 600;
var STALE_AFTER = 24e4;
var TERM_IDS = ["18402", "19459"];
var WARM_KEYS = [
  { type: "all", eventBlockId: "18402" },
  { type: "all", eventBlockId: "19459" },
  { type: "bookings", eventBlockId: "18402" },
  { type: "bookings", eventBlockId: "19459" }
];
var BOOKINGS_FETCH_MAX_ROWS = 25;
var BOOKINGS_MAX_NOTIFICATIONS_PER_RUN = 25;
var COGWORK_TIMEOUT_MS = 15e3;
var APNS_JWT_MAX_AGE = 45 * 60 * 1e3;
var apnsJwtCache = { jwt: null, createdAt: 0 };
// --- Rideau-statistik (CORE-fliken Foreställningar) ---
var RIDEAU_STATS_KV_KEY = "rideau:stats:v1";
var RIDEAU_STATS_FRESH_MS = 120 * 1e3;
var RIDEAU_STATS_KV_TTL_SECONDS = 3600;
var RIDEAU_STATS_TIMEOUT_MS = 8e3;
var RIDEAU_STATS_ALLOWED_ROLES = ["admin"];
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var STAFF_ROLES = ["admin", "teacher", "receptionist"];
var ALLOWED_ORIGINS = [
  "https://core.sollentunadansochscenskola.se",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
var SMS_SENDER = "0850278989";
function normalizeNumber(raw) {
  let n = raw.replace(/[\s.\-()]/g, "");
  if (n.startsWith("+46")) n = "0" + n.slice(3);
  return n;
}
__name(normalizeNumber, "normalizeNumber");
function normalizeNotificationPrefs({ role, notifyNews, notifyNewBookings, notifyPayments, followedEventIds }) {
  const isAdmin = role === "admin";
  return {
    news: notifyNews !== false ? 1 : 0,
    bookingsFlag: isAdmin && notifyNewBookings ? 1 : 0,
    paymentsFlag: isAdmin && notifyPayments ? 1 : 0,
    followed: JSON.stringify(followedEventIds ?? [])
  };
}
__name(normalizeNotificationPrefs, "normalizeNotificationPrefs");
var worker_default = {
  async fetch(request, env, ctx) {
    const corsHeaders = corsHeadersFor(request);
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
    if (url.pathname === "/goals" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM goals WHERE archived = 0 ORDER BY deadline ASC"
      ).all();
      return json(results, 200, corsHeaders);
    }
    if (url.pathname === "/goals" && request.method === "POST") {
      const body = await request.json();
      const { title, description, metric, target, event_block_id, event_key, deadline } = body;
      if (!title || !metric || !target || !deadline) {
        return json({ error: "title, metric, target och deadline kr\xE4vs" }, 400, corsHeaders);
      }
      const { meta } = await env.DB.prepare(
        `INSERT INTO goals (title, description, metric, target, event_block_id, event_key, deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(title, description ?? null, metric, target, event_block_id ?? null, event_key ?? null, deadline).run();
      const goal = await env.DB.prepare("SELECT * FROM goals WHERE id = ?").bind(meta.last_row_id).first();
      return json(goal, 201, corsHeaders);
    }
    if (url.pathname.startsWith("/goals/") && request.method === "PUT") {
      const id = url.pathname.split("/")[2];
      const body = await request.json();
      const { title, description, metric, target, event_block_id, event_key, deadline, archived } = body;
      await env.DB.prepare(
        `UPDATE goals SET
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          metric = COALESCE(?, metric),
          target = COALESCE(?, target),
          event_block_id = COALESCE(?, event_block_id),
          event_key = COALESCE(?, event_key),
          deadline = COALESCE(?, deadline),
          archived = COALESCE(?, archived),
          updated_at = datetime('now')
         WHERE id = ?`
      ).bind(
        title ?? null,
        description ?? null,
        metric ?? null,
        target ?? null,
        event_block_id ?? null,
        event_key ?? null,
        deadline ?? null,
        archived ?? null,
        id
      ).run();
      const goal = await env.DB.prepare("SELECT * FROM goals WHERE id = ?").bind(id).first();
      return json(goal, 200, corsHeaders);
    }
    if (url.pathname.startsWith("/goals/") && request.method === "DELETE") {
      const id = url.pathname.split("/")[2];
      await env.DB.prepare(
        "UPDATE goals SET archived = 1, updated_at = datetime('now') WHERE id = ?"
      ).bind(id).run();
      return json({ deleted: true }, 200, corsHeaders);
    }
    if (url.pathname === "/push/register-device" && request.method === "POST") {
      const body = await request.json();
      const {
        deviceToken,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      } = body;
      if (!deviceToken) return json({ error: "deviceToken kr\xE4vs" }, 400, corsHeaders);
      if (!staff) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
      const userId = staff.userId;
      const role = staff.role;
      const { news, bookingsFlag, paymentsFlag, followed } = normalizeNotificationPrefs({
        role,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      });
      await env.DB.prepare(
        `INSERT INTO ios_device_tokens
           (device_token, user_id, role, notify_news, notify_new_bookings, notify_payments, followed_event_ids, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(device_token) DO UPDATE SET
           user_id = excluded.user_id,
           role = excluded.role,
           notify_news = excluded.notify_news,
           notify_new_bookings = excluded.notify_new_bookings,
           notify_payments = excluded.notify_payments,
           followed_event_ids = excluded.followed_event_ids,
           updated_at = datetime('now')`
      ).bind(deviceToken, userId ?? null, role ?? null, news, bookingsFlag, paymentsFlag, followed).run();
      return json({ registered: true }, 200, corsHeaders);
    }
    if (url.pathname === "/push/preferences" && request.method === "POST") {
      const body = await request.json();
      const {
        deviceToken,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      } = body;
      if (!deviceToken) return json({ error: "deviceToken kr\xE4vs" }, 400, corsHeaders);
      if (!staff) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
      const role = staff.role;
      const { news, bookingsFlag, paymentsFlag, followed } = normalizeNotificationPrefs({
        role,
        notifyNews,
        notifyNewBookings,
        notifyPayments,
        followedEventIds
      });
      const { meta } = await env.DB.prepare(
        `UPDATE ios_device_tokens SET
           user_id = ?,
           role = ?,
           notify_news = ?,
           notify_new_bookings = ?,
           notify_payments = ?,
           followed_event_ids = ?,
           updated_at = datetime('now')
         WHERE device_token = ?`
      ).bind(staff.userId, staff.role, news, bookingsFlag, paymentsFlag, followed, deviceToken).run();
      if (meta.changes === 0) return json({ error: "ok\xE4nd deviceToken" }, 404, corsHeaders);
      return json({ updated: true }, 200, corsHeaders);
    }
    if (url.pathname === "/push/send-custom" && request.method === "POST") {
      const authed = await verifySupabaseJwt(request, env);
      if (!authed) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
      const body = await request.json();
      const { title, message, target } = body;
      if (!title || !message || !target?.type) {
        return json({ error: "title, message och target kr\xE4vs" }, 400, corsHeaders);
      }
      let tokens;
      if (target.type === "all") {
        const { results } = await env.DB.prepare("SELECT device_token FROM ios_device_tokens").all();
        tokens = results.map((r) => r.device_token);
      } else if (target.type === "course") {
        const { results } = await env.DB.prepare(
          "SELECT device_token, followed_event_ids FROM ios_device_tokens"
        ).all();
        tokens = results.filter((row) => {
          try {
            const ids = JSON.parse(row.followed_event_ids || "[]");
            return Array.isArray(ids) && ids.some((id) => String(id) === String(target.eventId));
          } catch {
            return false;
          }
        }).map((row) => row.device_token);
      } else {
        return json({ error: "ok\xE4nd target.type" }, 400, corsHeaders);
      }
      const { sent, failed } = await sendPushToDevices(tokens, title, message, env);
      return json({ sent, failed }, 200, corsHeaders);
    }
    if (url.pathname === "/push/notify-internal" && request.method === "POST") {
      const sharedSecret = request.headers.get("X-Internal-Secret");
      if (!sharedSecret || sharedSecret !== env.NOTIFIER_SHARED_SECRET) {
        return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
      }
      const body = await request.json();
      const { title, message } = body;
      if (!title || !message) {
        return json({ error: "title och message kr\xE4vs" }, 400, corsHeaders);
      }
      const { results } = await env.DB.prepare(
        "SELECT device_token FROM ios_device_tokens WHERE notify_new_bookings = 1"
      ).all();
      const tokens = results.map((r) => r.device_token);
      const { sent, failed } = await sendPushToDevices(tokens, title, message, env);
      return json({ sent, failed }, 200, corsHeaders);
    }
    if (url.pathname === "/rideau/stats") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, corsHeaders);
      return handleRideauStats(request, env, ctx, corsHeaders);
    }
    if (url.pathname === "/telavox/calls") {
      if (!telavoxToken) return json({ error: "TELAVOX_API_KEY saknas" }, 500, corsHeaders);
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const fromDate = url.searchParams.get("fromDate") || today;
      const toDate = url.searchParams.get("toDate") || today;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return json({ error: "ogiltigt datum" }, 400, corsHeaders);
      }
      try {
        const res = await fetch(
          `${TELAVOX_BASE}/calls?fromDate=${fromDate}&toDate=${toDate}`,
          { headers: { Authorization: `Bearer ${telavoxToken}` } }
        );
        return json(await res.json(), 200, corsHeaders);
      } catch (err) {
        return json({ error: err.message }, 500, corsHeaders);
      }
    }
    if (url.pathname === "/telavox/dial") {
      if (!telavoxToken) return json({ error: "TELAVOX_API_KEY saknas" }, 500, corsHeaders);
      const raw = url.searchParams.get("number") || "";
      if (!raw) return json({ error: "number saknas" }, 400, corsHeaders);
      const number = normalizeNumber(raw);
      try {
        const res = await fetch(
          `${TELAVOX_BASE}/dial/${encodeURIComponent(number)}`,
          { headers: { Authorization: `Bearer ${telavoxToken}` } }
        );
        return json(await res.json(), 200, corsHeaders);
      } catch (err) {
        return json({ error: err.message }, 500, corsHeaders);
      }
    }
    if (url.pathname === "/telavox/sms") {
      if (!telavoxToken) return json({ error: "TELAVOX_API_KEY saknas" }, 500, corsHeaders);
      const raw = url.searchParams.get("number") || "";
      const message = url.searchParams.get("message");
      const sender = SMS_SENDER;
      if (!raw || !message) return json({ error: "number och message kr\xE4vs" }, 400, corsHeaders);
      if (message.length > 480) return json({ error: "meddelandet \xE4r f\xF6r l\xE5ngt" }, 400, corsHeaders);
      const number = normalizeNumber(raw);
      try {
        const res = await fetch(
          `${TELAVOX_BASE}/sms/${encodeURIComponent(number)}?message=${encodeURIComponent(message)}&sender=${encodeURIComponent(sender)}`,
          { headers: { Authorization: `Bearer ${telavoxToken}` } }
        );
        return json(await res.json(), 200, corsHeaders);
      } catch (err) {
        return json({ error: err.message }, 500, corsHeaders);
      }
    }
    if (url.pathname === "/purge") {
      if (!apiKey) return json({ error: "COGWORK_API_KEY saknas" }, 500, corsHeaders);
      const list = await env.COGWORK_CACHE.list();
      await Promise.all(list.keys.map((k) => env.COGWORK_CACHE.delete(k.name)));
      console.log("KV Cache rensad:", list.keys.map((k) => k.name));
      await Promise.all(
        WARM_KEYS.map(({ type: type2, eventBlockId: eventBlockId2 }) => {
          const kvKey2 = type2 + (eventBlockId2 ? "_" + eventBlockId2 : "");
          return fetchAndStore(env, apiKey, type2, eventBlockId2, kvKey2).then(() => console.log("Purge: v\xE4rmde", kvKey2)).catch((err) => console.error("Purge: misslyckades", kvKey2, err.message));
        })
      );
      try {
        await buildAggregate(env, "all");
        await buildAggregate(env, "bookings");
        console.log("Purge: byggde aggregat (all, bookings)");
      } catch (err) {
        console.error("Purge: aggregat misslyckades", err.message);
      }
      return json({ purged: true, warmed: true, at: (/* @__PURE__ */ new Date()).toISOString() }, 200, corsHeaders);
    }
    if (url.pathname === "/cogwork/users" && request.method === "GET") {
      if (!apiKey) return json({ error: "COGWORK_API_KEY saknas" }, 500, corsHeaders);
      const name = (url.searchParams.get("name") || "").trim();
      const textSearch = (url.searchParams.get("textSearch") || "").trim();
      if (!name && !textSearch) return json({ error: "name eller textSearch kr\xE4vs" }, 400, corsHeaders);
      if (name.length > 200 || textSearch.length > 200) return json({ error: "f\xF6r l\xE5ng s\xF6kning" }, 400, corsHeaders);
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
      if (!eventId && !userId) return json({ error: "eventId eller userId kr\xE4vs" }, 400, corsHeaders);
      if (eventId && !/^\d+$/.test(eventId)) return json({ error: "ogiltigt eventId" }, 400, corsHeaders);
      if (userId && !/^\d+$/.test(userId)) return json({ error: "ogiltigt userId" }, 400, corsHeaders);
      const maxRowsRaw = url.searchParams.get("maxRows") || "500";
      const maxRows = /^\d+$/.test(maxRowsRaw) ? Math.min(1000, Math.max(1, Number(maxRowsRaw))) : 500;
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
      return json({ error: "ok\xE4nd type" }, 400, corsHeaders);
    }
    const eventBlockId = url.searchParams.get("eventBlockId") || "";
    if (eventBlockId && !/^\d+$/.test(eventBlockId)) {
      return json({ error: "ogiltigt eventBlockId" }, 400, corsHeaders);
    }
    const kvKey = type + (eventBlockId ? "_" + eventBlockId : "");
    const cached = await env.COGWORK_CACHE.get(kvKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const age = parsed.cachedAt ? Date.now() - new Date(parsed.cachedAt).getTime() : Infinity;
      if (age > STALE_AFTER) {
        console.log("KV Cache STALE \u2013 revaliderar i bakgrunden:", kvKey);
        ctx.waitUntil(fetchAndStore(env, apiKey, type, eventBlockId, kvKey));
      } else {
        console.log("KV Cache HIT:", kvKey);
      }
      return json(parsed, 200, corsHeaders);
    }
    console.log("KV Cache MISS:", kvKey);
    try {
      const data = await fetchAndStore(env, apiKey, type, eventBlockId, kvKey);
      return json(data, 200, corsHeaders);
    } catch (err) {
      console.error("Worker error:", err.message);
      return json({ error: err.message }, 500, corsHeaders);
    }
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "*/9 * * * *") {
      await runCacheWarming(env);
    } else if (event.cron === "*/18 * * * *") {
      await runPushChecks(env);
    } else if (event.cron === "*/5 * * * *") {
      await checkNewBookings(env);
    } else {
      console.error("Cron: ok\xE4nt schema", event.cron);
    }
  }
};
async function runCacheWarming(env) {
  console.log("Cron: b\xF6rjar v\xE4rma cache", (/* @__PURE__ */ new Date()).toISOString());
  const apiKey = env.COGWORK_API_KEY;
  if (!apiKey) {
    console.error("Cron: COGWORK_API_KEY saknas");
    return;
  }
  await Promise.all(
    WARM_KEYS.map(({ type, eventBlockId }) => {
      const kvKey = type + (eventBlockId ? "_" + eventBlockId : "");
      return fetchAndStore(env, apiKey, type, eventBlockId, kvKey).then(() => console.log("Cron: v\xE4rmde", kvKey)).catch((err) => console.error("Cron: misslyckades", kvKey, err.message));
    })
  );
  try {
    await buildAggregate(env, "all");
    await buildAggregate(env, "bookings");
    console.log("Cron: byggde aggregat (all, bookings)");
  } catch (err) {
    console.error("Cron: aggregat misslyckades", err.message);
  }
  console.log("Cron: klar", (/* @__PURE__ */ new Date()).toISOString());
}
__name(runCacheWarming, "runCacheWarming");
async function runPushChecks(env) {
  console.log("Cron: push-kontroll b\xF6rjar", (/* @__PURE__ */ new Date()).toISOString());
  try {
    await notifyNewsCards(env);
  } catch (err) {
    console.error("Cron: nyhetsnotis misslyckades", err.message);
  }
  console.log("Cron: push-kontroll klar", (/* @__PURE__ */ new Date()).toISOString());
}
__name(runPushChecks, "runPushChecks");
async function fetchAndStore(env, apiKey, type, eventBlockId, kvKey) {
  if (!eventBlockId && (type === "all" || type === "bookings")) {
    return buildAggregate(env, type);
  }
  const bParams = { maxRows: "10000", ...eventBlockId && { eventBlockId } };
  const eParams = { maxRows: "10000", ...eventBlockId && { eventBlockId } };
  const dParams = { duplicatesOnly: "true", maxRows: "10000", ...eventBlockId && { eventBlockId } };
  let data;
  switch (type) {
    case "bookings":
      data = await cogworkFetch(apiKey, "/bookings/", bParams);
      break;
    case "events":
      data = await cogworkFetch(apiKey, "/events/", eParams);
      break;
    case "duplicates":
      data = await cogworkFetch(apiKey, "/bookings/", dParams);
      break;
    case "all": {
      const [b, e, d] = await Promise.all([
        cogworkFetch(apiKey, "/bookings/", bParams),
        cogworkFetch(apiKey, "/events/", eParams),
        cogworkFetch(apiKey, "/bookings/", dParams)
      ]);
      data = { bookings: b, events: e, duplicates: d, cachedAt: (/* @__PURE__ */ new Date()).toISOString() };
      break;
    }
    default:
      throw new Error("Ok\xE4nd type: " + type);
  }
  if (!data.cachedAt) data.cachedAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.COGWORK_CACHE.put(kvKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return data;
}
__name(fetchAndStore, "fetchAndStore");
async function buildAggregate(env, type) {
  const apiKey = env.COGWORK_API_KEY;
  const cachedTerms = await Promise.all(
    TERM_IDS.map(async (id) => {
      const cached = await env.COGWORK_CACHE.get(`all_${id}`);
      if (cached) return JSON.parse(cached);
      console.log("buildAggregate: all_" + id + " saknas i KV, h\xE4mtar fr\xE4scht");
      try {
        return await fetchAndStore(env, apiKey, "all", id, "all_" + id);
      } catch (err) {
        console.error("buildAggregate: kunde inte h\xE4mta all_" + id, err.message);
        return null;
      }
    })
  );
  const allBookings = [];
  const allEvents = [];
  const allDuplicates = [];
  for (const parsed of cachedTerms) {
    if (!parsed) continue;
    allBookings.push(...parsed.bookings?.bookings ?? []);
    allEvents.push(...parsed.events?.events ?? []);
    allDuplicates.push(...parsed.duplicates?.bookings ?? []);
  }
  let data;
  if (type === "bookings") {
    data = {
      bookings: allBookings,
      search: { numRowsFound: allBookings.length },
      cachedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await env.COGWORK_CACHE.put("bookings", JSON.stringify(data), { expirationTtl: CACHE_TTL });
  } else {
    data = {
      bookings: { bookings: allBookings, search: { numRowsFound: allBookings.length } },
      events: { events: allEvents, search: { numRowsFound: allEvents.length } },
      duplicates: { bookings: allDuplicates, search: { numRowsFound: allDuplicates.length } },
      cachedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await env.COGWORK_CACHE.put("all", JSON.stringify(data), { expirationTtl: CACHE_TTL });
  }
  return data;
}
__name(buildAggregate, "buildAggregate");
async function cogworkFetch(apiKey, endpoint, params = {}) {
  const query = new URLSearchParams({ org: ORG, pw: apiKey, ...params });
  const url = `${BASE_URL}${endpoint}?${query}`;
  console.log("Anropar:", url.replace(apiKey, "***"));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CogWork svarade ${response.status}`);
  return response.json();
}
__name(cogworkFetch, "cogworkFetch");
async function cogworkFetchWithTimeout(apiKey, endpoint, params, timeoutMs) {
  const query = new URLSearchParams({ org: ORG, pw: apiKey, ...params });
  const url = `${BASE_URL}${endpoint}?${query}`;
  console.log(`Anropar (timeout ${timeoutMs}ms):`, url.replace(apiKey, "***"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`CogWork svarade ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
__name(cogworkFetchWithTimeout, "cogworkFetchWithTimeout");
async function checkNewBookings(env) {
  console.log("Cron: bokningskontroll b\xF6rjar", (/* @__PURE__ */ new Date()).toISOString());
  const apiKey = env.COGWORK_API_KEY;
  if (!apiKey) {
    console.error("Cron: bokningskontroll - COGWORK_API_KEY saknas");
    return;
  }
  const stateRow = await env.DB.prepare(
    "SELECT last_notified_id FROM notification_state WHERE key = 'bookings'"
  ).first();
  let data;
  try {
    data = await cogworkFetchWithTimeout(
      apiKey,
      "/bookings/",
      { maxRows: String(BOOKINGS_FETCH_MAX_ROWS), verbose: "1" },
      COGWORK_TIMEOUT_MS
    );
  } catch (err) {
    console.error("Cron: bokningskontroll kunde inte h\xE4mta CogWork:", err.message);
    return;
  }
  if (data.errors && data.errors.length) {
    console.error("Cron: bokningskontroll - CogWork API-fel:", JSON.stringify(data.errors));
    return;
  }
  const bookings = data.bookings ?? [];
  console.log("Cron: bokningskontroll h\xE4mtade", bookings.length, "bokningar");
  if (!stateRow) {
    const maxId = bookings.reduce((max, b) => Math.max(max, Number(b.id) || 0), 0);
    await env.DB.prepare(
      "INSERT INTO notification_state (key, last_notified_id) VALUES ('bookings', ?)"
    ).bind(maxId).run();
    console.log("Cron: notification_state f\xF6r bookings saknades, initierar till", maxId, "(inga notiser skickade)");
    return;
  }
  const lastId = Number(stateRow.last_notified_id) || 0;
  const newBookings = bookings.filter((b) => (Number(b.id) || 0) > lastId).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  if (newBookings.length === 0) {
    console.log("Cron: bokningskontroll - inga nya bokningar (last_notified_id =", lastId, ")");
    return;
  }
  const toNotify = newBookings.slice(0, BOOKINGS_MAX_NOTIFICATIONS_PER_RUN);
  const remaining = newBookings.length - toNotify.length;
  console.log(
    "Cron: bokningskontroll -",
    newBookings.length,
    "nya bokningar, notifierar",
    toNotify.length,
    remaining > 0 ? `(${remaining} skippade pga MAX_NOTIFICATIONS_PER_RUN)` : ""
  );
  const { results } = await env.DB.prepare(
    "SELECT device_token FROM ios_device_tokens WHERE notify_new_bookings = 1"
  ).all();
  const tokens = results.map((r) => r.device_token);
  for (const booking of toNotify) {
    const title = "Ny anm\xE4lan";
    const message = formatBookingMessage(booking);
    try {
      const { sent, failed } = await sendPushToDevices(tokens, title, message, env);
      console.log("Cron: push f\xF6r bokning", booking.id, "-", sent, "skickade,", failed, "misslyckade");
    } catch (err) {
      console.error("Cron: native push-fel f\xF6r bokning", booking.id, ":", err.message);
    }
  }
  const maxSeenId = newBookings.reduce((max, b) => Math.max(max, Number(b.id) || 0), lastId);
  await env.DB.prepare(
    "UPDATE notification_state SET last_notified_id = ? WHERE key = 'bookings'"
  ).bind(maxSeenId).run();
  console.log("Cron: bokningskontroll klar, last_notified_id =", maxSeenId);
}
__name(checkNewBookings, "checkNewBookings");
function formatBookingMessage(b) {
  const event = b.event || {};
  const participant = b.participant || {};
  const payment = b.payment || {};
  const eventName = event.name || "Ok\xE4nd kurs";
  const eventCode = event.code || "";
  const startDt = event.startDateTime || `${event.startDate || ""} ${event.startTime || ""}`.trim();
  const participantName = participant.name || "Ok\xE4nd deltagare";
  const statusName = (b.status || {}).name || "";
  const created = b.created || "";
  const paid = payment.paid;
  const amountPaid = payment.amountPaid;
  const price = payment.priceAgreed;
  const currency = payment.currency || "SEK";
  const due = payment.paymentDue;
  let paidStr;
  if (paid === true) {
    paidStr = "\u2705 Betald";
    if (amountPaid !== void 0 && amountPaid !== null) paidStr += ` (${amountPaid} ${currency})`;
  } else if (paid === false) {
    paidStr = "\u23F3 Ej betald";
    if (due) paidStr += ` (f\xF6rfallo ${due})`;
  } else {
    paidStr = "\u2753 Betalstatus ok\xE4nd";
  }
  const priceStr = price !== void 0 && price !== null ? `\u{1F4B0} Pris: ${price} ${currency}` : null;
  const lines = [eventName, `Elev: ${participantName}`, `Status: ${statusName}`];
  if (startDt) lines.push(`Start: ${startDt}`);
  if (eventCode) lines.push(`Kod: ${eventCode}`);
  if (priceStr) lines.push(priceStr);
  lines.push(paidStr);
  if (created) lines.push(`\u{1F552} Skapad: ${created}`);
  return lines.filter((line) => line.trim()).join("\n");
}
__name(formatBookingMessage, "formatBookingMessage");
async function notifyNewsCards(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("Cron: SUPABASE_URL eller SUPABASE_ANON_KEY saknas, hoppar \xF6ver nyhetsnotiser");
    return;
  }
  const query = new URLSearchParams({
    select: "id,title,body",
    send_push: "eq.true",
    push_sent_at: "is.null",
    published: "eq.true",
    starts_at: `lte.${(/* @__PURE__ */ new Date()).toISOString()}`
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/content_cards?${query}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` }
  });
  if (!res.ok) {
    console.error("Cron: kunde inte h\xE4mta content_cards", res.status);
    return;
  }
  const cards = await res.json();
  if (!cards.length) return;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    console.error("Cron: SUPABASE_SERVICE_KEY saknas, kan inte st\xE4mpla content_cards \u2014 hoppar \xF6ver nyhetsnotiser");
    return;
  }
  const { results } = await env.DB.prepare(
    "SELECT device_token FROM ios_device_tokens WHERE notify_news = 1"
  ).all();
  const tokens = results.map((r) => r.device_token);
  for (const card of cards) {
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/content_cards?id=eq.${card.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        prefer: "return=minimal"
      },
      body: JSON.stringify({ push_sent_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
    if (!patchRes.ok) {
      console.error("Cron: kunde inte st\xE4mpla content_card", card.id, patchRes.status);
      continue;
    }
    if (tokens.length > 0) {
      const body = (card.body ?? "").slice(0, 120);
      await sendPushToDevices(tokens, card.title, body, env);
    }
  }
}
__name(notifyNewsCards, "notifyNewsCards");
async function buildApnsJwt(env) {
  const now = Date.now();
  if (apnsJwtCache.jwt && now - apnsJwtCache.createdAt < APNS_JWT_MAX_AGE) {
    console.log("APNs JWT: \xE5teranv\xE4nder cachad (\xE5lder", Math.round((now - apnsJwtCache.createdAt) / 1e3), "s)");
    return apnsJwtCache.jwt;
  }
  console.log("APNs JWT: signerar ny (cache tom eller f\xF6r gammal - modulvariabeln kan ha nollst\xE4llts av en ny isolate)");
  const header = { alg: "ES256", kid: env.APNS_KEY_ID };
  const payload = { iss: env.APNS_TEAM_ID, iat: Math.floor(now / 1e3) };
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.APNS_AUTH_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    encoder.encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;
  apnsJwtCache = { jwt, createdAt: now };
  return jwt;
}
__name(buildApnsJwt, "buildApnsJwt");
async function sendApnsPush(deviceToken, title, body, jwt, env) {
  const host = env.APNS_ENVIRONMENT === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": env.APNS_BUNDLE_ID,
      "apns-push-type": "alert"
    },
    body: JSON.stringify({ aps: { alert: { title, body } } })
  });
  if (response.status === 410) {
    await env.DB.prepare("DELETE FROM ios_device_tokens WHERE device_token = ?").bind(deviceToken).run();
  }
  return response;
}
__name(sendApnsPush, "sendApnsPush");
async function sendPushToDevices(tokens, title, body, env) {
  if (!tokens.length) return { sent: 0, failed: 0 };
  const jwt = await buildApnsJwt(env);
  const results = await Promise.allSettled(
    tokens.map((token) => sendApnsPush(token, title, body, jwt, env))
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error("Push-utskick kastade undantag f\xF6r token", tokens[i], ":", r.reason?.message || r.reason);
    }
  });
  const sent = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  return { sent, failed: results.length - sent };
}
__name(sendPushToDevices, "sendPushToDevices");
var SUPABASE_JWKS_URL = "https://vuokkdtyhmhkvfizsnwm.supabase.co/auth/v1/.well-known/jwks.json";
var JWKS_CACHE_TTL = 10 * 60 * 1e3;
var jwksCache = { keys: null, cachedAt: 0 };
async function fetchJwks() {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.cachedAt < JWKS_CACHE_TTL) return jwksCache.keys;
  const res = await fetch(SUPABASE_JWKS_URL);
  if (!res.ok) throw new Error("Kunde inte h\xE4mta JWKS: " + res.status);
  const { keys } = await res.json();
  jwksCache = { keys, cachedAt: now };
  return keys;
}
__name(fetchJwks, "fetchJwks");
function corsHeadersFor(request) {
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
  if (!sub || !UUID_RE.test(sub)) return json({ error: "Ej beh\xF6rig roll" }, 403, corsHeaders);
  let role;
  try {
    role = await resolveCoreUserRole(sub, request, env);
  } catch (err) {
    console.error("rolluppslag misslyckades:", err.message);
    return json({ error: "role_lookup_failed" }, 503, corsHeaders);
  }
  if (!STAFF_ROLES.includes(role)) return json({ error: "Ej beh\xF6rig roll" }, 403, corsHeaders);
  return { userId: sub, role };
}
__name(requireStaff, "requireStaff");
async function verifySupabaseJwt(request, env) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, signatureB64] = parts;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
    if (header.alg !== "ES256") return false;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (typeof payload.exp !== "number" || payload.exp * 1e3 <= Date.now()) return false;
    const keys = await fetchJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      base64UrlDecode(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
  } catch (err) {
    console.error("JWT-verifiering misslyckades:", err.message);
    return false;
  }
}
__name(verifySupabaseJwt, "verifySupabaseJwt");
function extractJwtSub(request) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
async function resolveCoreUserRole(userId, request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("role_lookup_not_configured");
  }
  const userToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=role`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${userToken}` } }
  );
  if (!res.ok) throw new Error("role_lookup_http_" + res.status);
  const rows = await res.json();
  return rows[0]?.role ?? null;
}
async function fetchRideauStats(env) {
  let res;
  try {
    res = await fetch(env.RIDEAU_STATS_URL, {
      headers: { Authorization: `Bearer ${env.RIDEAU_STATS_TOKEN}` },
      signal: AbortSignal.timeout(RIDEAU_STATS_TIMEOUT_MS)
    });
  } catch (err) {
    throw new Error("rideau_fetch_failed_" + (err.name || "error"));
  }
  if (!res.ok) throw new Error("rideau_http_" + res.status);
  return res.json();
}
async function refreshRideauStatsCache(env) {
  const data = await fetchRideauStats(env);
  const entry = { data, cachedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.COGWORK_CACHE.put(RIDEAU_STATS_KV_KEY, JSON.stringify(entry), {
    expirationTtl: RIDEAU_STATS_KV_TTL_SECONDS
  });
  return entry;
}
async function handleRideauStats(request, env, ctx, corsHeaders) {
  if (!env.RIDEAU_STATS_URL || !env.RIDEAU_STATS_TOKEN) {
    console.error("rideau/stats: RIDEAU_STATS_URL eller RIDEAU_STATS_TOKEN saknas");
    return json({ error: "stats_not_configured" }, 500, corsHeaders);
  }
  const authed = await verifySupabaseJwt(request, env);
  if (!authed) return json({ error: "Ej auktoriserad" }, 401, corsHeaders);
  const sub = extractJwtSub(request);
  if (!sub || !UUID_RE.test(sub)) return json({ error: "Ej beh\xF6rig roll" }, 403, corsHeaders);
  let role;
  try {
    role = await resolveCoreUserRole(sub, request, env);
  } catch (err) {
    console.error("rideau/stats: rolluppslag misslyckades:", err.message);
    return json({ error: "role_lookup_failed" }, 503, corsHeaders);
  }
  if (!RIDEAU_STATS_ALLOWED_ROLES.includes(role)) {
    return json({ error: "Ej beh\xF6rig roll" }, 403, corsHeaders);
  }
  const cachedRaw = await env.COGWORK_CACHE.get(RIDEAU_STATS_KV_KEY);
  const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
  const age = cached ? Date.now() - new Date(cached.cachedAt).getTime() : Infinity;
  if (cached && age <= RIDEAU_STATS_FRESH_MS) {
    return json({ ...cached.data, cached_at: cached.cachedAt, stale: false }, 200, corsHeaders);
  }
  if (cached) {
    ctx.waitUntil(
      refreshRideauStatsCache(env).catch((err) => {
        console.error("rideau/stats: bakgrundsuppdatering misslyckades:", err.message);
      })
    );
    return json({ ...cached.data, cached_at: cached.cachedAt, stale: true, stale_since: cached.cachedAt }, 200, corsHeaders);
  }
  try {
    const entry = await refreshRideauStatsCache(env);
    return json({ ...entry.data, cached_at: entry.cachedAt, stale: false }, 200, corsHeaders);
  } catch (err) {
    console.error("rideau/stats: Rideau-anrop misslyckades, ingen cache:", err.message);
    return json({ error: "stats_unavailable" }, 502, corsHeaders);
  }
}
function base64UrlEncode(buffer) {
  let binary = "";
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + (4 - str.length % 4) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(base64UrlDecode, "base64UrlDecode");
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
__name(pemToArrayBuffer, "pemToArrayBuffer");
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(json, "json");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map