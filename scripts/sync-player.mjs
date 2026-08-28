#!/usr/bin/env node
/**
 * Speglar public/player.html in i konstanten PLAYER_HTML i sodss-signage/worker.js.
 *
 * Pi:erna hämtar spelaren från Workern (/player), inte från public/. public/
 * är källan, PLAYER_HTML är det som faktiskt körs — och de två har glidit isär
 * flera gånger, vilket betyder att man felsöker fel fil.
 *
 *   node scripts/sync-player.mjs           skriver public/player.html → worker.js
 *   node scripts/sync-player.mjs --check   exit 1 om de skiljer sig (för CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYER = resolve(root, 'public/player.html');
const WORKER = resolve(root, 'sodss-signage/worker.js');
const OPEN = 'const PLAYER_HTML = `';
const CLOSE = '\n`;';

const player = readFileSync(PLAYER, 'utf8');
const worker = readFileSync(WORKER, 'utf8');

// PLAYER_HTML är ett template literal. Backtick och ${ skulle brytas ut ur det
// och tyst korrupta Workern, så vi vägrar i stället för att escapa i smyg.
for (const bad of ['`', '${']) {
  if (player.includes(bad)) {
    console.error(`public/player.html innehåller ${bad} — kan inte bäddas in i ett template literal.`);
    process.exit(1);
  }
}

const start = worker.indexOf(OPEN);
if (start === -1) throw new Error('Hittade inte PLAYER_HTML i worker.js');
const bodyStart = start + OPEN.length;
const bodyEnd = worker.indexOf(CLOSE, bodyStart);
if (bodyEnd === -1) throw new Error('Hittade inte slutet på PLAYER_HTML i worker.js');

const embedded = worker.slice(bodyStart, bodyEnd);
const wanted = player.replace(/\n$/, '');
const inSync = embedded === wanted;

if (process.argv.includes('--check')) {
  if (inSync) {
    console.log('OK: public/player.html och PLAYER_HTML är identiska.');
    process.exit(0);
  }
  console.error('AVVIKELSE: public/player.html och PLAYER_HTML skiljer sig.');
  console.error('Kör: node scripts/sync-player.mjs');
  process.exit(1);
}

if (inSync) {
  console.log('Redan i synk — inget att göra.');
  process.exit(0);
}

writeFileSync(WORKER, worker.slice(0, bodyStart) + wanted + worker.slice(bodyEnd));
console.log('Skrev public/player.html → PLAYER_HTML i sodss-signage/worker.js');
