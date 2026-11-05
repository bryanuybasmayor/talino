/**
 * csv-import.js — CSV import and normalization
 *
 * Handles importing the 6 PDF-extracted CSVs (and future exports).
 * Each normalizer returns { data: [...], warnings: [...] }.
 */

import Papa from 'papaparse';

// ── Header signatures used to auto-detect CSV type ──────────────────────────
const SIGNATURES = [
  { type: 'top_posts',      required: ['post_id', 'name', 'platform_format', 'reach', 'emv_php'] },
  { type: 'kpis',           required: ['period', 'reach', 'emv_php', 'posts'] },
  { type: 'lanus',          required: ['rank', 'name', 'posts', 'emv_php', 'reach'] },
  { type: 'ploom_mentions', required: ['mention_id', 'platform', 'post_type', 'post_url'] },
  { type: 'campaign_share', required: ['campaign', 'share_pct'] },
  { type: 'format_mix',     required: ['platform', 'format', 'posts_approx'] },
];

/**
 * Detect CSV type from its header row.
 * @param {string[]} headers — lowercased, trimmed column names
 * @returns {string|null} one of the SIGNATURES type values, or null
 */
function detectType(headers) {
  const set = new Set(headers.map(h => h.trim().toLowerCase()));
  for (const sig of SIGNATURES) {
    if (sig.required.every(col => set.has(col))) return sig.type;
  }
  return null;
}

/**
 * Parse a CSV string, auto-detect its type, and normalize.
 *
 * @param {string} content  — raw CSV text
 * @param {string} filename — original filename (used in warnings)
 * @returns {{ type: string, data: any[], warnings: string[] }}
 */
export function parseCSV(content, filename = 'unknown.csv') {
  const parsed = Papa.parse(content.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,          // we handle type coercion per-field
    transformHeader: h => h.trim(),
  });

  if (parsed.errors.length) {
    const serious = parsed.errors.filter(e => e.type !== 'FieldMismatch');
    if (serious.length) {
      throw new Error(
        `CSV parse errors in ${filename}: ${serious.map(e => e.message).join('; ')}`
      );
    }
  }

  const headers = parsed.meta.fields || [];
  const type = detectType(headers);

  if (!type) {
    throw new Error(
      `Cannot detect CSV type for "${filename}". Headers: ${headers.join(', ')}`
    );
  }

  const normalizers = {
    top_posts:      normalizeTopPosts,
    kpis:           normalizeKPIs,
    lanus:          normalizeLanus,
    ploom_mentions: normalizePloomMentions,
    campaign_share: normalizeCampaignShare,
    format_mix:     normalizeFormatMix,
  };

  const { data, warnings } = normalizers[type](parsed.data, filename);
  return { type, data, warnings };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a numeric string, stripping commas. Returns NaN for blanks. */
function num(val) {
  if (val == null || val === '') return NaN;
  return Number(String(val).replace(/,/g, ''));
}

/** Safe trim that handles null/undefined. */
function trim(val) {
  return val == null ? '' : String(val).trim();
}

// ── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Top Posts — split platform_format like "INSTAGRAM - REELS" into
 * separate `platform` and `format` fields.
 */
export function normalizeTopPosts(rows, filename = '') {
  const warnings = [];
  const data = rows.map((row, i) => {
    const pf = trim(row.platform_format);
    let platform = '';
    let format   = '';

    if (pf) {
      const parts = pf.split(/\s*-\s*/);
      platform = parts[0] ? parts[0].trim() : '';
      format   = parts[1] ? parts[1].trim() : '';
    }

    const name = trim(row.name);

    if (!platform && !format) {
      warnings.push(`Row ${i + 1} (${name || 'unknown'}): no platform_format value`);
    }

    const postUrl = trim(row.post_url);
    if (!postUrl) {
      warnings.push(`Row ${i + 1} (${name || 'unknown'}): missing post_url`);
    }

    return {
      post_id:        trim(row.post_id),
      date:           trim(row.date),
      name,
      campaign:       trim(row.campaign),
      platform,
      format,
      platform_format: pf,
      post_url:       postUrl,
      proof_url:      trim(row.proof_url),
      reach:          num(row.reach),
      emv_php:        num(row.emv_php),
    };
  });

  return { data, warnings };
}

/**
 * Ploom Mentions — clean up truncated captions.
 */
export function normalizePloomMentions(rows, filename = '') {
  const warnings = [];
  const data = rows.map((row, i) => {
    let caption = trim(row.caption_excerpt);

    // Flag truncated captions (end with "..." or ".. .." patterns from PDF)
    if (/\.{2,}\s*$/.test(caption) || /\.\s+\.\.\.$/.test(caption)) {
      warnings.push(`Row ${i + 1} (${trim(row.mention_id)}): caption is truncated`);
      // Normalize trailing ellipsis variants to a clean "…"
      caption = caption.replace(/\.\s*\.\s*\.?\s*$/, '…').replace(/\.{3,}$/, '…');
    }

    return {
      mention_id:     trim(row.mention_id),
      date:           trim(row.date),
      profile:        trim(row.profile),
      platform:       trim(row.platform),
      post_type:      trim(row.post_type),
      caption_excerpt: caption,
      post_url:       trim(row.post_url),
    };
  });

  return { data, warnings };
}

/**
 * KPIs — parse all numeric fields.
 */
export function normalizeKPIs(rows, filename = '') {
  const warnings = [];
  const data = rows.map((row, i) => {
    const period = trim(row.period);
    const entry = {
      period,
      start_date: trim(row.start_date),
      end_date:   trim(row.end_date),
      reach:      num(row.reach),
      views:      num(row.views),
      emv_php:    num(row.emv_php),
      likes:      num(row.likes),
      comments:   num(row.comments),
      shares:     num(row.shares),
      saves:      num(row.saves),
      posts:      num(row.posts),
      lanus:      num(row.lanus),
      note:       trim(row.note),
    };

    // Warn on any NaN numeric fields
    for (const key of ['reach', 'views', 'emv_php', 'likes', 'comments', 'shares', 'saves', 'posts', 'lanus']) {
      if (Number.isNaN(entry[key])) {
        warnings.push(`Row ${i + 1} (${period}): "${key}" is not a valid number`);
      }
    }

    return entry;
  });

  return { data, warnings };
}

/**
 * LANUs — parse numeric fields.
 */
export function normalizeLanus(rows, filename = '') {
  const warnings = [];
  const data = rows.map((row, i) => {
    const name = trim(row.name);
    const entry = {
      rank:    num(row.rank),
      name,
      posts:   num(row.posts),
      emv_php: num(row.emv_php),
      reach:   num(row.reach),
    };

    for (const key of ['rank', 'posts', 'emv_php', 'reach']) {
      if (Number.isNaN(entry[key])) {
        warnings.push(`Row ${i + 1} (${name}): "${key}" is not a valid number`);
      }
    }

    return entry;
  });

  return { data, warnings };
}

/**
 * Campaign Share — parse percentage values.
 */
export function normalizeCampaignShare(rows, filename = '') {
  const warnings = [];
  const data = rows.map((row, i) => {
    const campaign = trim(row.campaign);
    const raw = trim(row.share_pct).replace(/%$/, '');
    const share_pct = num(raw);

    if (Number.isNaN(share_pct)) {
      warnings.push(`Row ${i + 1} (${campaign}): share_pct is not a valid number`);
    }

    return { campaign, share_pct };
  });

  // Validate total is close to 100%
  const total = data.reduce((s, r) => s + (Number.isNaN(r.share_pct) ? 0 : r.share_pct), 0);
  if (Math.abs(total - 100) > 1) {
    warnings.push(`Campaign shares sum to ${total.toFixed(1)}%, expected ~100%`);
  }

  return { data, warnings };
}

/**
 * Format Mix — parse approximate post counts.
 * These are read-by-eye from a bar chart and sum to more than the actual
 * total, so they should be treated as proportions, not exact counts.
 */
export function normalizeFormatMix(rows, filename = '') {
  const warnings = [];
  const data = rows.map((row, i) => {
    const platform = trim(row.platform);
    const format   = trim(row.format);
    const posts_approx = num(row.posts_approx);

    if (Number.isNaN(posts_approx)) {
      warnings.push(`Row ${i + 1} (${platform} ${format}): posts_approx is not a valid number`);
    }

    return { platform, format, posts_approx };
  });

  // Always warn that these are approximate
  const total = data.reduce((s, r) => s + (Number.isNaN(r.posts_approx) ? 0 : r.posts_approx), 0);
  warnings.push(
    `Format mix values are approximate (read from bar chart). ` +
    `Sum is ${total.toLocaleString()}, which exceeds the actual post total. Treat as proportions.`
  );

  return { data, warnings };
}
