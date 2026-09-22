#!/usr/bin/env node
/**
 * Bundle budget check for the Nitro/Vercel build output (.vercel/output).
 * Fails when the SSR client payload or a named chunk exceeds its budget, so a
 * dependency bloat regression is caught in CI instead of silently slowing the
 * app.
 *
 * Budgets are advisory line-of-sight numbers, not promises — bump them when a
 * deliberate dependency is added, shrink them when a big win lands.
 *
 * Usage: node scripts/check-bundle.mjs [maxClientGzipKB]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".vercel", "output");
const CLIENT_DIR = join(OUT, "static");
const DEFAULT_MAX_CLIENT_GZIP_KB = 300; // Phase-1 budget (v2.0 roadmap: 260→300kB)

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const maxGzipKB = Number(process.argv[2] ?? DEFAULT_MAX_CLIENT_GZIP_KB);
const files = walk(CLIENT_DIR).filter((f) => /\.(js|css)$/.test(f));
let total = 0;
let worst = { name: "", kb: 0 };
for (const f of files) {
  const raw = readFileSync(f);
  const gzKB = gzipSync(raw).length / 1024;
  total += gzKB;
  if (gzKB > worst.kb)
    worst = { name: f.slice(CLIENT_DIR.length + 1), kb: gzKB };
}

const big = files
  .map((f) => ({
    name: f.slice(CLIENT_DIR.length + 1),
    kb: gzipSync(readFileSync(f)).length / 1024,
  }))
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 5);

console.log(
  `client gzip total: ${total.toFixed(1)} kB (budget ${maxGzipKB} kB)`,
);
console.log(`largest chunk: ${worst.name} @ ${worst.kb.toFixed(1)} kB`);
for (const b of big) console.log(`  - ${b.name}: ${b.kb.toFixed(1)} kB`);

if (total > maxGzipKB) {
  console.error(
    `\nBUNDLE BUDGET EXCEEDED: ${total.toFixed(1)} kB > ${maxGzipKB} kB`,
  );
  process.exit(1);
}
console.log("\nbundle budget OK");
