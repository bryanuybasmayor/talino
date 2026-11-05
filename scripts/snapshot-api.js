#!/usr/bin/env node
/**
 * scripts/snapshot-api.js — Static snapshot of the API for server-less hosting.
 *
 * Boots the real Express API on a spare port, calls every read endpoint the
 * client uses, and writes each JSON body to public/demo-data/ along with a
 * manifest mapping endpoint → file. The client reads those files when built
 * with VITE_STATIC_DEMO=true (see src/lib/api.js).
 *
 * Usage: npm run snapshot:static
 * Requires a seeded store — run `npm run demo:reset` first.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'data', 'store');
const REPORTS = join(STORE, 'reports');
const OUT = join(ROOT, 'public', 'demo-data');
const PORT = Number(process.env.SNAPSHOT_PORT || 3919);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const manifest = {};
let fileCount = 0;

function write(relPath, data) {
  const full = join(OUT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data) + '\n');
  fileCount++;
}

async function snapshot(endpoint, relPath) {
  const res = await fetch(`${ORIGIN}/api${endpoint}`);
  if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status}`);
  write(relPath, await res.json());
  manifest[endpoint] = relPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(child, timeoutMs = 20000) {
  const started = Date.now();
  let log = '';

  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before it was ready:\n${log}`);
    }
    try {
      const res = await fetch(`${ORIGIN}/api/ai/status`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }

  throw new Error(`Timed out waiting for the API:\n${log}`);
}

/** Report ids come from the store, which is what the API enumerates. */
function reportIds() {
  if (!existsSync(REPORTS)) return [];
  return readdirSync(REPORTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => existsSync(join(REPORTS, id, 'report.json')))
    .sort();
}

/** Every stored JSON file is readable through /data/:file. */
function dataFiles(id) {
  return readdirSync(join(REPORTS, id))
    .filter((f) => f.endsWith('.json') && f !== 'report.json')
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

async function main() {
  if (!existsSync(STORE) || reportIds().length === 0) {
    throw new Error('data/store has no reports — run `npm run demo:reset` first.');
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const child = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child);

    await snapshot('/ai/status', 'ai-status.json');
    await snapshot('/clients', 'clients.json');
    await snapshot('/reports', 'reports.json');

    const clients = JSON.parse(
      await (await fetch(`${ORIGIN}/api/clients`)).text()
    );
    for (const client of clients) {
      await snapshot(`/clients/${client.slug}`, `clients/${client.slug}.json`);
    }

    for (const id of reportIds()) {
      await snapshot(`/reports/${id}`, `reports/${id}/report.json`);
      await snapshot(`/reports/${id}/metrics`, `reports/${id}/metrics.json`);
      await snapshot(`/reports/${id}/quality`, `reports/${id}/quality.json`);
      await snapshot(`/reports/${id}/audit`, `reports/${id}/audit.json`);

      for (const file of dataFiles(id)) {
        await snapshot(`/reports/${id}/data/${file}`, `reports/${id}/data/${file}.json`);
      }
    }

    write('manifest.json', manifest);
    console.log(`Snapshot written to public/demo-data/ (${fileCount} files).`);
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error(`\n✗ Snapshot failed: ${err.message}\n`);
  process.exit(1);
});
