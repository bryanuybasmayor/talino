/**
 * audit.js — Audit logging
 *
 * Appends structured entries to the report's audit_log.json.
 * Each entry records who/what did something, when, and to what.
 */

import { readJSON, writeJSON } from './store.js';

/** Allowed action types for validation. */
const VALID_ACTIONS = new Set([
  'import',
  'ai_tag',
  'ai_summary',
  'ai_narrative',
  'edit_summary',
  'approve_summary',
  'toggle_ai',
  'status_change',
  'report_created',
  'report_updated',
  'summary_approved',
  'summary_rejected',
]);

/**
 * Append an action to a report's audit log.
 *
 * @param {string} reportId — report identifier (used as folder name in store)
 * @param {string} action   — one of VALID_ACTIONS
 * @param {string} target   — what was acted on (e.g. "mentions", "summary", "tag:M05")
 * @param {Object} [details] — arbitrary extra context
 * @returns {Object} the log entry that was appended
 */
export function logAction(reportId, action, target, details = {}) {
  if (!reportId) {
    throw new Error('audit.logAction: reportId is required');
  }
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(
      `audit.logAction: unknown action "${action}". ` +
      `Allowed: ${[...VALID_ACTIONS].join(', ')}`
    );
  }

  const logPath = `reports/${reportId}/audit_log.json`;
  const log = readJSON(logPath) || [];

  const entry = {
    id:        `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action,
    target:    target || null,
    details:   details || {},
  };

  log.push(entry);
  writeJSON(logPath, log);

  return entry;
}

/**
 * Read the full audit log for a report.
 *
 * @param {string} reportId
 * @returns {Array} log entries, newest last (append order)
 */
export function readAuditLog(reportId) {
  if (!reportId) {
    throw new Error('audit.readAuditLog: reportId is required');
  }
  return readJSON(`reports/${reportId}/audit_log.json`) || [];
}

/**
 * Get the most recent entry for a given action type.
 *
 * @param {string} reportId
 * @param {string} action
 * @returns {Object|null}
 */
export function lastAction(reportId, action) {
  const log = readAuditLog(reportId);
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].action === action) return log[i];
  }
  return null;
}

/** Append in the { action, target, details } shape used by the API layer. */
export function appendAudit(reportId, entry = {}) {
  return logAction(reportId, entry.action, entry.target ?? null, entry.details ?? {});
}

/** Read in the shape used by the API layer. */
export function readAudit(reportId) {
  return readAuditLog(reportId);
}
