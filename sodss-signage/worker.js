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
