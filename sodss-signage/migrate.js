#!/usr/bin/env node
/**
 * Engångsskript — Skyltning v2, Del 4.
 *
 * Migrerar den platta R2-bucketens rotfiler (befintlig Skärm Reception)
 * till det nya namespaced-läget:
 *   <rotfil>  →  reception/<rotfil>
 * och bygger playlists/reception.json (duration: 8 för bilder).
 *
 * wrangler har ingen "lista objekt"-subkommando, så migreringen görs via
 * en tillfällig, ADMIN_SECRET-skyddad route i worker.js: POST /internal/migrate.
 * Den routen använder R2-bindningen direkt (list → get → put → delete) och
 * är betydligt mer robust än att skriptmässigt gissa sig fram med `wrangler
 * r2 object get/put/delete` en fil i taget.
 *
 * Kör INNAN den nya workern (med det nya, namespaced /api/files-kontraktet)
 * deployas skarpt — annars visar Skärm Reception felskärmen tills
 * migreringen är klar (se ordern, Del 4).
 *
 * Lämnar urls/-prefixet orört — det raderas manuellt när Del 1.5 är verifierad.
 *
 * Användning:
 *   SODSS_WORKER_URL=https://sodss-signage.nicklas-stenlander.workers.dev \
 *   SODSS_ADMIN_SECRET=<ADMIN_SECRET> \
 *   node migrate.js
 */

const WORKER_URL   = process.env.SODSS_WORKER_URL;
const ADMIN_SECRET = process.env.SODSS_ADMIN_SECRET;

if (!WORKER_URL || !ADMIN_SECRET) {
  console.error("Sätt SODSS_WORKER_URL och SODSS_ADMIN_SECRET som miljövariabler.");
  process.exit(1);
}

async function main() {
  const res = await fetch(`${WORKER_URL.replace(/\/$/, "")}/internal/migrate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN_SECRET}` },
  });
  const body = await res.json();

  if (!res.ok) {
    console.error("Migrering misslyckades:", body);
    process.exit(1);
  }

  if (body.migrated.length === 0) {
    console.log("Inga rotfiler att migrera (redan migrerat, eller bucketen är tom).");
    console.log("playlists/reception.json lämnad orörd.");
  } else {
    console.log(`Migrerade ${body.migrated.length} filer till reception/:`);
    for (const key of body.migrated) console.log(`  - ${key}`);
    const count = body.manifest ? body.manifest.items.length : 0;
    console.log(`\nplaylists/reception.json byggd med ${count} objekt.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
