#!/usr/bin/env node
/**
 * Fails if a Vite env name that would ship a secret in the public bundle
 * reappears. The banned suffixes are SECRET, PASSWORD, PASSWD and _PW.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url)
const prefix = 'VITE_'
const secretLike = new RegExp(`${prefix}[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|_PW)\\b`)
const named = ['COGWORK_SHARED_PW', 'WORKER_SECRET'].map((name) => prefix + name)
const skip = new Set(['node_modules', 'dist', '.git', 'coverage'])

function files(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) files(path, out)
    else if (stat.isFile() && stat.size < 2_000_000) out.push(path)
  }
  return out
}

const hits = []
for (const path of files(root.pathname)) {
  let text
  try { text = readFileSync(path, 'utf8') } catch { continue }
  const lines = text.split(/\n/)
  lines.forEach((line, index) => {
    if (secretLike.test(line) || named.some((name) => line.includes(name))) {
      hits.push(`${relative(root.pathname, path)}:${index + 1}`)
    }
  })
}

if (hits.length) {
  console.error('Hemliga Vite-namn får inte tillbaka in i repot:')
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log('OK: inga hemliga Vite-namn.')
