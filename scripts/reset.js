#!/usr/bin/env node
/**
 * scripts/reset.js — Demo seed / reset script for TALINO dashboard.
 *
 * Usage:  npm run demo:reset
 *
 * Clears data/store/ and rebuilds the demo state from CSV sources
 * and (optionally) pre-generated seed files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ─── Paths ───────────────────────────────────────────────────────────────────

const STORE      = path.join(ROOT, 'data', 'store');
const SOURCE_PDF = path.join(ROOT, 'data', 'source-pdf');
const SEED       = path.join(ROOT, 'data', 'seed');

const RPT1_DIR = path.join(STORE, 'reports', 'rpt-campaign-demo');
const RPT2_DIR = path.join(STORE, 'reports', 'rpt-listening-demo');
const CLIENT_DIR = path.join(STORE, 'clients');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/** Write JSON with 2-space indent */
function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Minimal CSV parser — handles quoted fields (with embedded commas and
 * escaped quotes ""). Good enough for the simple CSVs in data/source-pdf/.
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return [];

  const parseLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current);
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (vals[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

/** Title-case a string: "INSTAGRAM" → "Instagram" */
function titleCase(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Split "INSTAGRAM - REELS" → { platform: "Instagram", format: "Reels" }
 * Handles multi-part formats like "INSTAGRAM - STORIES - STATIC"
 *   → { platform: "Instagram", format: "Stories - Static" }
 */
function splitPlatformFormat(pf) {
  if (!pf || !pf.trim()) return { platform: '', format: '' };
  const parts = pf.split(' - ').map(p => p.trim());
  const platform = titleCase(parts[0]);
  const format = parts.slice(1).map(titleCase).join(' - ');
  return { platform, format };
}

// ─── 1. Clear data/store/ ────────────────────────────────────────────────────

console.log('Clearing data/store/ …');
fs.rmSync(STORE, { recursive: true, force: true });
fs.mkdirSync(path.join(STORE, 'clients'), { recursive: true });
fs.mkdirSync(path.join(STORE, 'reports'), { recursive: true });

// ─── 2. Client config ───────────────────────────────────────────────────────

console.log('Writing client config …');
writeJSON(path.join(CLIENT_DIR, 'zyn.json'), {
  slug: 'zyn',
  name: 'ZYN Philippines',
  logo: '/assets/logos/zyn.svg',
  brand_colors: {
    primary: '#00D4D4',
    secondary: '#FF6B35',
  },
  topic_list: [
    'event experience',
    'product & flavor',
    'price & availability',
    'health & safety',
    'age & legality',
    'celebrity / LANU',
    'competitor comparison',
    'other',
  ],
  competitors: ['Ploom'],
  created: '2025-01-01T00:00:00Z',
});

// ─── 3. Report 1 — Campaign performance ─────────────────────────────────────

console.log('Building Report 1: Campaign performance …');
fs.mkdirSync(RPT1_DIR, { recursive: true });

// 3a. KPIs
const kpisRaw = parseCSV(fs.readFileSync(path.join(SOURCE_PDF, 'kpis.csv'), 'utf8'));
const kpis = kpisRaw.map(r => ({
  period:     r.period,
  start_date: r.start_date,
  end_date:   r.end_date,
  reach:      Number(r.reach),
  views:      Number(r.views),
  emv_php:    Number(r.emv_php),
  likes:      Number(r.likes),
  comments:   Number(r.comments),
  shares:     Number(r.shares),
  saves:      Number(r.saves),
  posts:      Number(r.posts),
  lanus:      Number(r.lanus),
  note:       r.note || null,
}));
writeJSON(path.join(RPT1_DIR, 'kpis.json'), kpis);

// 3b. LANUs
const lanusRaw = parseCSV(fs.readFileSync(path.join(SOURCE_PDF, 'lanus_2026.csv'), 'utf8'));
const lanus = lanusRaw.map(r => ({
  rank:    Number(r.rank),
  name:    r.name,
  posts:   Number(r.posts),
  emv_php: Number(r.emv_php),
  reach:   Number(r.reach),
}));
writeJSON(path.join(RPT1_DIR, 'lanus.json'), lanus);

// 3c. Top posts (normalize platform_format)
const postsRaw = parseCSV(fs.readFileSync(path.join(SOURCE_PDF, 'top_posts.csv'), 'utf8'));
const campaignPosts = postsRaw.map(r => {
  const { platform, format } = splitPlatformFormat(r.platform_format);
  return {
    post_id:   r.post_id,
    date:      r.date,
    name:      r.name,
    campaign:  r.campaign,
    platform,
    format,
    post_url:  r.post_url || null,
    proof_url: r.proof_url || null,
    reach:     Number(r.reach),
    emv_php:   Number(r.emv_php),
  };
});
writeJSON(path.join(RPT1_DIR, 'campaign_posts.json'), campaignPosts);

// 3d. Campaign share
const shareRaw = parseCSV(fs.readFileSync(path.join(SOURCE_PDF, 'campaign_share.csv'), 'utf8'));
const campaignShare = shareRaw.map(r => ({
  campaign:  r.campaign,
  share_pct: Number(r.share_pct),
}));
writeJSON(path.join(RPT1_DIR, 'campaign_share.json'), campaignShare);

// 3e. Format mix
const fmtRaw = parseCSV(fs.readFileSync(path.join(SOURCE_PDF, 'format_mix.csv'), 'utf8'));
const formatMix = fmtRaw.map(r => ({
  platform:     r.platform,
  format:       r.format,
  posts_approx: Number(r.posts_approx),
}));
writeJSON(path.join(RPT1_DIR, 'format_mix.json'), formatMix);

// 3f. Ploom mentions
const ploomRaw = parseCSV(fs.readFileSync(path.join(SOURCE_PDF, 'ploom_mentions.csv'), 'utf8'));
const ploomMentions = ploomRaw.map(r => ({
  mention_id:     r.mention_id,
  date:           r.date,
  profile:        r.profile,
  platform:       r.platform,
  post_type:      r.post_type,
  caption_excerpt: r.caption_excerpt || null,
  post_url:       r.post_url,
}));
writeJSON(path.join(RPT1_DIR, 'ploom_mentions.json'), ploomMentions);

// 3g. report.json
const ts = now();
writeJSON(path.join(RPT1_DIR, 'report.json'), {
  id:             'rpt-campaign-demo',
  client:         'zyn',
  title:          'Campaign performance, Jan 2025 – Oct 2026',
  period_start:   '2025-01-01',
  period_end:     '2026-10-22',
  status:         'ready',
  is_sample:      false,
  ai_allowed:     false,
  ai_allowed_at:  null,
  created:        ts,
  updated:        ts,
});

// 3h. Data quality checks on campaign_posts
const dataQualityIssues = [];

// Check 1: Copied metrics — same name, identical reach AND emv_php, different post_url
const byName = {};
for (const p of campaignPosts) {
  (byName[p.name] ??= []).push(p);
}

for (const [name, posts] of Object.entries(byName)) {
  if (posts.length < 2) continue;
  // Group by (reach, emv_php) fingerprint
  const byFingerprint = {};
  for (const p of posts) {
    const key = `${p.reach}|${p.emv_php}`;
    (byFingerprint[key] ??= []).push(p);
  }
  for (const [, group] of Object.entries(byFingerprint)) {
    if (group.length < 2) continue;
    // Verify they have different post_urls
    const urls = new Set(group.map(p => p.post_url).filter(Boolean));
    if (urls.size > 1 || (urls.size >= 1 && group.some(p => !p.post_url))) {
      dataQualityIssues.push({
        type: 'copied_metrics',
        severity: 'warning',
        name,
        reach: group[0].reach,
        emv_php: group[0].emv_php,
        affected_posts: group.map(p => p.post_id),
        message: `${name}: ${group.length} posts share identical reach (${group[0].reach.toLocaleString()}) and EMV (₱${group[0].emv_php.toLocaleString()}) — likely copied metrics`,
      });
    }
  }
}

// Check 2: EMV outliers — EMV per 1K reach > 3× median
const emvPer1k = campaignPosts
  .filter(p => p.reach > 0)
  .map(p => ({ post_id: p.post_id, name: p.name, ratio: (p.emv_php / p.reach) * 1000 }));

emvPer1k.sort((a, b) => a.ratio - b.ratio);
const mid = Math.floor(emvPer1k.length / 2);
const median = emvPer1k.length % 2 === 0
  ? (emvPer1k[mid - 1].ratio + emvPer1k[mid].ratio) / 2
  : emvPer1k[mid].ratio;

const threshold = median * 3;
const outliers = emvPer1k.filter(p => p.ratio > threshold);
if (outliers.length > 0) {
  for (const o of outliers) {
    dataQualityIssues.push({
      type: 'emv_outlier',
      severity: 'info',
      post_id: o.post_id,
      name: o.name,
      emv_per_1k_reach: Math.round(o.ratio * 100) / 100,
      median_emv_per_1k: Math.round(median * 100) / 100,
      threshold: Math.round(threshold * 100) / 100,
      message: `${o.name} (${o.post_id}): EMV/1K reach of ₱${Math.round(o.ratio).toLocaleString()} is >3× the median (₱${Math.round(median).toLocaleString()})`,
    });
  }
}

// Count affected rows for summary (warnings only — info-level outliers are FYI)
const warningIssues = dataQualityIssues.filter(i => i.severity === 'warning');
const affectedPostIds = new Set();
for (const issue of warningIssues) {
  if (issue.affected_posts) {
    issue.affected_posts.forEach(id => affectedPostIds.add(id));
  }
}

writeJSON(path.join(RPT1_DIR, 'data_quality.json'), dataQualityIssues);

// 3i. Audit log
writeJSON(path.join(RPT1_DIR, 'audit_log.json'), [
  { ts, action: 'import', source: 'kpis.csv', rows: kpis.length, actor: 'demo:reset' },
  { ts, action: 'import', source: 'lanus_2026.csv', rows: lanus.length, actor: 'demo:reset' },
  { ts, action: 'import', source: 'top_posts.csv', rows: campaignPosts.length, actor: 'demo:reset' },
  { ts, action: 'import', source: 'campaign_share.csv', rows: campaignShare.length, actor: 'demo:reset' },
  { ts, action: 'import', source: 'format_mix.csv', rows: formatMix.length, actor: 'demo:reset' },
  { ts, action: 'import', source: 'ploom_mentions.csv', rows: ploomMentions.length, actor: 'demo:reset' },
  { ts, action: 'data_quality', issues: dataQualityIssues.length, warnings: warningIssues.length, affected_rows: affectedPostIds.size, actor: 'demo:reset' },
]);

// 3j. Empty AI files (real data — AI not allowed on free tier)
writeJSON(path.join(RPT1_DIR, 'ai_summaries.json'), []);
writeJSON(path.join(RPT1_DIR, 'ai_tags.json'), []);

// ─── 4. Report 2 — Social listening preview ─────────────────────────────────

const seedFiles = ['mentions.json', 'ai_tags.json', 'ai_summaries.json', 'narratives.json'];
const seedExists = seedFiles.every(f => fs.existsSync(path.join(SEED, f)));

let mentionCount = 0;

if (!seedExists) {
  console.warn('\n⚠  data/seed/ files not found — skipping Report 2.');
  console.warn('   Run `npm run seed:listening` first to generate sample listening data.\n');
} else {
  console.log('Building Report 2: Social listening preview …');
  fs.mkdirSync(RPT2_DIR, { recursive: true });

  // Copy seed files
  for (const f of seedFiles) {
    fs.copyFileSync(path.join(SEED, f), path.join(RPT2_DIR, f));
  }

  // Count mentions for summary
  const mentions = JSON.parse(fs.readFileSync(path.join(RPT2_DIR, 'mentions.json'), 'utf8'));
  mentionCount = Array.isArray(mentions) ? mentions.length : 0;

  // report.json
  const ts2 = now();
  writeJSON(path.join(RPT2_DIR, 'report.json'), {
    id:            'rpt-listening-demo',
    client:        'zyn',
    title:         'Social listening preview',
    period_start:  '2026-01-01',
    period_end:    '2026-10-22',
    status:        'ready',
    is_sample:     true,
    ai_allowed:    true,
    ai_allowed_at: ts2,
    created:       ts2,
    updated:       ts2,
  });

  // Audit log
  writeJSON(path.join(RPT2_DIR, 'audit_log.json'), [
    { ts: ts2, action: 'import', source: 'seed/mentions.json', rows: mentionCount, actor: 'demo:reset' },
    { ts: ts2, action: 'import', source: 'seed/ai_tags.json', actor: 'demo:reset' },
    { ts: ts2, action: 'import', source: 'seed/ai_summaries.json', actor: 'demo:reset' },
    { ts: ts2, action: 'import', source: 'seed/narratives.json', actor: 'demo:reset' },
  ]);

  // Data quality — sample data has no issues
  writeJSON(path.join(RPT2_DIR, 'data_quality.json'), []);
}

// ─── 5. Summary ──────────────────────────────────────────────────────────────

console.log(`
Demo reset complete.

Client: ZYN Philippines

Report 1: Campaign performance, Jan 2025 – Oct 2026
  - ${campaignPosts.length} posts, ${kpis.length} KPI periods, ${lanus.length} LANUs, ${campaignShare.length} campaigns, ${formatMix.length} format entries, ${ploomMentions.length} Ploom mentions
  - ${warningIssues.length} data quality issues (${affectedPostIds.size} affected rows)
  - Status: ready | AI: off (real data, free-tier rule)`);

if (seedExists) {
  console.log(`
Report 2: Social listening preview
  - ${mentionCount} mentions (sample data)
  - Pre-generated AI tags, summaries, and narratives
  - Status: ready | AI: on (sample data)`);
} else {
  console.log(`
Report 2: Social listening preview
  - SKIPPED (run \`npm run seed:listening\` first)`);
}

console.log(`
Run \`npm run demo\` to start the app.
`);
