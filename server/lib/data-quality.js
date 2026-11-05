/**
 * data-quality.js — Data quality checks
 *
 * Each check function returns an array of issue objects:
 *   { type, severity: 'error'|'warning'|'info', message, affected_rows: [ids] }
 *
 * runAllChecks() orchestrates every applicable check for a full report.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Compute the median of a numeric array (ignores NaN). */
function median(values) {
  const clean = values.filter(v => Number.isFinite(v));
  if (!clean.length) return 0;
  clean.sort((a, b) => a - b);
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0
    ? (clean[mid - 1] + clean[mid]) / 2
    : clean[mid];
}

// ── Check: exact duplicates ─────────────────────────────────────────────────

/**
 * Find exact duplicates by post_url, or same name + date + format.
 * @param {Array} posts — normalized top_posts rows
 * @returns {Array} issues
 */
export function checkDuplicates(posts) {
  const issues = [];

  // By post_url (non-empty)
  const byUrl = new Map();
  for (const p of posts) {
    if (!p.post_url) continue;
    const key = p.post_url.trim().toLowerCase();
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(p.post_id);
  }
  for (const [url, ids] of byUrl) {
    if (ids.length > 1) {
      issues.push({
        type: 'duplicate_url',
        severity: 'error',
        message: `Duplicate post_url shared by ${ids.join(', ')}: ${url}`,
        affected_rows: ids,
      });
    }
  }

  // By name + date + format
  const byComposite = new Map();
  for (const p of posts) {
    const key = `${(p.name || '').toLowerCase()}|${p.date}|${(p.format || '').toLowerCase()}`;
    if (!byComposite.has(key)) byComposite.set(key, []);
    byComposite.get(key).push(p.post_id);
  }
  for (const [key, ids] of byComposite) {
    if (ids.length > 1) {
      issues.push({
        type: 'duplicate_composite',
        severity: 'warning',
        message: `Same name+date+format for ${ids.join(', ')}: ${key}`,
        affected_rows: ids,
      });
    }
  }

  return issues;
}

// ── Check: copied metrics ───────────────────────────────────────────────────

/**
 * Detect rows where the same creator has identical reach AND EMV on
 * different post links. Known cases:
 *   Heart Evangelista (P05, P06), Lella Ford (P10, P11, P12),
 *   Atasha Muhlach (P14, P15) = 7 rows total.
 *
 * @param {Array} posts — normalized top_posts rows
 * @returns {Array} issues
 */
export function checkCopiedMetrics(posts) {
  const issues = [];

  // Group by name
  const byName = new Map();
  for (const p of posts) {
    const name = (p.name || '').trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(p);
  }

  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    // Group by (reach, emv_php) within this creator
    const byMetrics = new Map();
    for (const p of group) {
      // Use string keys to avoid floating-point comparison issues
      const key = `${p.reach}|${p.emv_php}`;
      if (!byMetrics.has(key)) byMetrics.set(key, []);
      byMetrics.get(key).push(p);
    }

    for (const [, cluster] of byMetrics) {
      if (cluster.length < 2) continue;

      // Verify they have different post URLs (not true duplicates)
      const urls = new Set(cluster.map(p => p.post_url).filter(Boolean));
      if (urls.size < 2) continue; // same URL = actual duplicate, handled elsewhere

      const ids = cluster.map(p => p.post_id);
      issues.push({
        type: 'copied_metrics',
        severity: 'warning',
        message: `${name}: ${ids.join(', ')} have identical reach (${cluster[0].reach}) and EMV (${cluster[0].emv_php}) on different posts. Metrics likely copied at creator level.`,
        affected_rows: ids,
      });
    }
  }

  return issues;
}

// ── Check: EMV outliers ─────────────────────────────────────────────────────

/**
 * Flag posts where EMV per 1K reach is more than 3× the median.
 * @param {Array} posts — normalized top_posts rows
 * @returns {Array} issues
 */
export function checkEMVOutliers(posts) {
  const issues = [];

  // Compute EMV per 1K reach for each post
  const ratios = posts
    .filter(p => Number.isFinite(p.reach) && p.reach > 0 && Number.isFinite(p.emv_php))
    .map(p => ({
      post_id: p.post_id,
      name: p.name,
      ratio: (p.emv_php / p.reach) * 1000,
    }));

  const med = median(ratios.map(r => r.ratio));
  if (med === 0) return issues;

  const threshold = med * 3;

  for (const r of ratios) {
    if (r.ratio > threshold) {
      issues.push({
        type: 'emv_outlier',
        severity: 'info',
        message: `${r.name} (${r.post_id}): EMV/1K reach = ${r.ratio.toFixed(0)} vs median ${med.toFixed(0)} (${(r.ratio / med).toFixed(1)}× median)`,
        affected_rows: [r.post_id],
      });
    }
  }

  return issues;
}

// ── Check: untagged mentions ────────────────────────────────────────────────

/**
 * Find mentions that have no AI tags at all.
 * @param {Array} mentions — normalized ploom_mentions rows
 * @param {Array} tags     — array of tag objects with mention_id
 * @returns {Array} issues
 */
export function checkUntaggedMentions(mentions, tags) {
  const issues = [];
  const taggedIds = new Set((tags || []).map(t => t.mention_id));

  const untagged = mentions.filter(m => !taggedIds.has(m.mention_id));
  if (untagged.length) {
    issues.push({
      type: 'untagged_mentions',
      severity: 'warning',
      message: `${untagged.length} mention(s) have no AI tags`,
      affected_rows: untagged.map(m => m.mention_id),
    });
  }

  return issues;
}

// ── Check: invalid tags ─────────────────────────────────────────────────────

/**
 * Find tags whose values are outside the allowed lists.
 * @param {Array}  tags          — array of tag objects { mention_id, dimension, value }
 * @param {Object} allowedValues — { dimension: Set|Array of allowed values }
 * @returns {Array} issues
 */
export function checkInvalidTags(tags, allowedValues) {
  const issues = [];
  if (!tags || !allowedValues) return issues;

  for (const tag of tags) {
    const dimension = tag.dimension;
    const allowed = allowedValues[dimension];
    if (!allowed) continue; // no constraint for this dimension

    const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
    if (!allowedSet.has(tag.value)) {
      issues.push({
        type: 'invalid_tag',
        severity: 'error',
        message: `Tag on ${tag.mention_id}: "${tag.value}" is not a valid value for dimension "${dimension}"`,
        affected_rows: [tag.mention_id],
      });
    }
  }

  return issues;
}

// ── Run all checks ──────────────────────────────────────────────────────────

/**
 * Run every applicable quality check on a report's data.
 *
 * @param {Object} reportData — may contain:
 *   - posts:          normalized top_posts
 *   - mentions:       normalized ploom_mentions
 *   - tags:           AI tag array
 *   - allowedValues:  { dimension: [...] } for tag validation
 * @returns {Array} all issues found
 */
export function runAllChecks(reportData = {}) {
  const { posts, mentions, tags, allowedValues } = reportData;
  const allIssues = [];

  if (posts && posts.length) {
    allIssues.push(...checkDuplicates(posts));
    allIssues.push(...checkCopiedMetrics(posts));
    allIssues.push(...checkEMVOutliers(posts));
  }

  if (mentions && mentions.length) {
    allIssues.push(...checkUntaggedMentions(mentions, tags || []));
  }

  if (tags && tags.length && allowedValues) {
    allIssues.push(...checkInvalidTags(tags, allowedValues));
  }

  return allIssues;
}
