/**
 * store.js — Atomic JSON file storage
 *
 * All paths are relative to the project root's data/store/ directory.
 * Writes are atomic: data goes to a temp file first, then is renamed
 * into place so a crash mid-write never corrupts the real file.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

// ── Resolve project root from this file's location ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const STORE_ROOT   = join(PROJECT_ROOT, 'data', 'store');

/**
 * Ensure a directory (and all parents) exists.
 * @param {string} dirPath — absolute path
 */
export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

/**
 * Read and parse a JSON file from the store.
 * @param {string} relPath — path relative to data/store/
 * @returns {any} parsed JSON, or null if the file doesn't exist
 */
export function readJSON(relPath) {
  const fullPath = join(STORE_ROOT, relPath);
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`store.readJSON("${relPath}"): ${err.message}`);
  }
}

/**
 * Atomically write data as JSON to the store.
 *
 * 1. Serialize to a temp file in the same directory (same filesystem).
 * 2. Rename the temp file over the target — rename is atomic on POSIX.
 *
 * @param {string} relPath — path relative to data/store/
 * @param {any}    data    — value to serialize (must be JSON-safe)
 */
export function writeJSON(relPath, data) {
  const fullPath = join(STORE_ROOT, relPath);
  const dir      = dirname(fullPath);

  ensureDir(dir);

  const tmpSuffix = randomBytes(6).toString('hex');
  const tmpPath   = `${fullPath}.${tmpSuffix}.tmp`;

  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    renameSync(tmpPath, fullPath);
  } catch (err) {
    // Best-effort cleanup of the temp file
    try { if (existsSync(tmpPath)) writeFileSync(tmpPath, ''); } catch { /* ignore */ }
    throw new Error(`store.writeJSON("${relPath}"): ${err.message}`);
  }
}

/**
 * Convenience: return the absolute path for a store-relative path.
 * Useful when callers need to check existence or pass to other APIs.
 */
export function storePath(relPath) {
  return join(STORE_ROOT, relPath);
}

/**
 * Return the project root (absolute).
 */
export function projectRoot() {
  return PROJECT_ROOT;
}
