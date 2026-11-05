import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { readJSON, writeJSON, storePath, projectRoot, ensureDir } from './lib/store.js';
import { parseCSV } from './lib/csv-import.js';
import { formatMoney, formatCount, kpiForPrompt } from './lib/format.js';

// ── Optional modules (may not exist yet) ────────────────────────────────────
let runAllChecks, getQualityReport;
try {
  const mod = await import('./lib/data-quality.js');
  runAllChecks = mod.runAllChecks;
  getQualityReport = mod.getQualityReport;
} catch { /* module not yet created */ }

let computeMetrics, computeSectionMetrics, computeListeningMetrics, toLongTags, computeGeoDistribution, computeTopVoices, computeKeywords, computeViralPosts, computeShareOfVoice;
try {
  const mod = await import('./lib/metrics.js');
  computeMetrics = mod.computeMetrics;
  computeSectionMetrics = mod.computeSectionMetrics;
  computeListeningMetrics = mod.computeListeningMetrics;
  toLongTags = mod.toLongTags;
  computeGeoDistribution = mod.computeGeoDistribution;
  computeTopVoices = mod.computeTopVoices;
  computeKeywords = mod.computeKeywords;
  computeViralPosts = mod.computeViralPosts;
  computeShareOfVoice = mod.computeShareOfVoice;
} catch { /* module not yet created */ }

let appendAudit, readAudit;
try {
  const mod = await import('./lib/audit.js');
  appendAudit = mod.appendAudit;
  readAudit = mod.readAudit;
} catch { /* module not yet created */ }

let aiProvider;
try {
  const mod = await import('./ai/provider.js');
  aiProvider = mod.default || mod;
} catch { /* module not yet created */ }

// ── App setup ───────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded / generated data files if needed
app.use('/data', express.static(join(projectRoot(), 'data')));

// Multer — memory storage for CSV uploads
const upload = multer({ storage: multer.memoryStorage() });

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique report ID */
function generateReportId() {
  return `rpt-${Date.now().toString(36)}`;
}

/** List JSON files in a store directory, returning parsed contents */
function listStoreDir(relDir) {
  const absDir = storePath(relDir);
  if (!existsSync(absDir)) return [];
  const files = readdirSync(absDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = readJSON(join(relDir, f));
    return data;
  }).filter(Boolean);
}

/** Read a report's report.json */
function getReport(id) {
  return readJSON(`reports/${id}/report.json`);
}

/** Check if AI is available */
function getAIStatus() {
  const provider = process.env.AI_PROVIDER || null;
  const model = process.env.AI_MODEL || null;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const hasKey = (provider === 'gemini' && !!geminiKey) ||
                 (provider === 'claude' && !!anthropicKey);

  return {
    available: hasKey && !!aiProvider,
    provider: hasKey ? provider : null,
    model: hasKey ? model : null,
    message: hasKey
      ? `AI ready (${provider} / ${model})`
      : 'Add GEMINI_API_KEY to .env to enable AI',
  };
}

/** Set up SSE headers on a response */
function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

/** Send an SSE event */
function sendSSE(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES — Clients
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/clients', (req, res) => {
  try {
    const clients = listStoreDir('clients');
    res.json(clients);
  } catch (err) {
    console.error('GET /api/clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:slug', (req, res) => {
  try {
    const data = readJSON(`clients/${req.params.slug}.json`);
    if (!data) return res.status(404).json({ error: 'Client not found' });
    res.json(data);
  } catch (err) {
    console.error(`GET /api/clients/${req.params.slug} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES — Reports
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/reports', (req, res) => {
  try {
    // Reports are stored as reports/{id}/report.json — enumerate subdirs
    const reportsDir = storePath('reports');
    let reports = [];
    if (existsSync(reportsDir)) {
      const dirs = readdirSync(reportsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      reports = dirs
        .map(id => readJSON(`reports/${id}/report.json`))
        .filter(Boolean);
    }

    // Optional client filter
    const clientFilter = req.query.client;
    if (clientFilter) {
      reports = reports.filter(r => r.client === clientFilter);
    }

    res.json(reports);
  } catch (err) {
    console.error('GET /api/reports error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports', (req, res) => {
  try {
    const { client, title, period_start, period_end, is_sample } = req.body;

    if (!client || !title) {
      return res.status(400).json({ error: 'client and title are required' });
    }

    const id = generateReportId();
    const report = {
      id,
      client,
      title,
      period_start: period_start || null,
      period_end: period_end || null,
      is_sample: is_sample ?? false,
      ai_allowed: is_sample ?? false, // samples default to AI-allowed
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Create report directory and save
    ensureDir(storePath(`reports/${id}`));
    writeJSON(`reports/${id}/report.json`, report);

    if (appendAudit) {
      appendAudit(id, { action: 'report_created', details: { title, client } });
    }

    res.status(201).json(report);
  } catch (err) {
    console.error('POST /api/reports error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id', (req, res) => {
  try {
    const report = getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (err) {
    console.error(`GET /api/reports/${req.params.id} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/reports/:id', (req, res) => {
  try {
    const report = getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const allowedFields = ['status', 'ai_allowed', 'title', 'period_start', 'period_end', 'is_sample'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.ai_allowed === true && !report.ai_allowed_at) {
      updates.ai_allowed_at = new Date().toISOString();
    }
    const updated = { ...report, ...updates, updated_at: new Date().toISOString() };
    writeJSON(`reports/${req.params.id}/report.json`, updated);

    appendAudit?.(req.params.id, {
      action: updates.ai_allowed !== undefined ? 'toggle_ai' : 'report_updated',
      target: 'report.json',
      details: updates,
    });

    res.json(updated);
  } catch (err) {
    console.error(`PATCH /api/reports/${req.params.id} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id/data/:file', (req, res) => {
  try {
    const { id, file } = req.params;
    const data = readJSON(`reports/${id}/${file}.json`);
    if (!data) return res.status(404).json({ error: `Data file "${file}" not found` });
    res.json(data);
  } catch (err) {
    console.error(`GET /api/reports/${req.params.id}/data/${req.params.file} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES — Import
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/reports/:id/import', upload.array('files'), async (req, res) => {
  try {
    const { id } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const imported = [];
    const warnings = [];

    for (const file of req.files) {
      const content = file.buffer.toString('utf-8');
      const { type, data, warnings: parseWarnings } = parseCSV(content, file.originalname);

      warnings.push(...parseWarnings.map(w => `[${file.originalname}] ${w}`));

      // The PDF's top_posts.csv becomes the report's campaign_posts file.
      const storeName = type === 'top_posts' ? 'campaign_posts' : type;
      writeJSON(`reports/${id}/${storeName}.json`, data);

      imported.push({ filename: file.originalname, type, rows: data.length });

      if (appendAudit) {
        appendAudit(id, {
          action: 'import',
          target: file.originalname,
          details: `${data.length} rows as ${storeName}.json`,
        });
      }
    }

    // Run cross-file quality checks once everything is saved.
    const posts = readJSON(`reports/${id}/campaign_posts.json`) || [];
    const mentions = readJSON(`reports/${id}/mentions.json`) || [];
    const tagFile = readJSON(`reports/${id}/ai_tags.json`);
    const client = loadClientConfig(report);
    const qualityIssues = runAllChecks ? runAllChecks({
      posts,
      mentions,
      tags: tagFile?.tags,
      allowedValues: { sentiments: ['positive','neutral','negative'], emotions: ['joy','excitement','trust','surprise','neutral','sadness','anger','disgust','fear'], topics: client.topic_list },
    }) : [];

    writeJSON(`reports/${id}/data_quality.json`, qualityIssues);

    // Keep the report in a valid status; only 'updated' changes.
    writeJSON(`reports/${id}/report.json`, {
      ...report,
      status: report.status === 'ready' ? 'ready' : 'draft',
      updated: new Date().toISOString(),
    });

    res.json({ imported, warnings, quality_issues: qualityIssues });
  } catch (err) {
    console.error(`POST /api/reports/${req.params.id}/import error:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/:id/import/preview', upload.array('files'), async (req, res) => {
  try {
    const { id } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const imported = [];
    const warnings = [];
    const qualityIssues = [];

    for (const file of req.files) {
      const content = file.buffer.toString('utf-8');
      const { type, data, warnings: parseWarnings } = parseCSV(content, file.originalname);

      warnings.push(...parseWarnings.map(w => `[${file.originalname}] ${w}`));

      if (runAllChecks && (type === 'top_posts' || type === 'campaign_posts' || type === 'mentions')) {
        qualityIssues.push(...runAllChecks({
          posts: type === 'mentions' ? undefined : data,
          mentions: type === 'mentions' ? data : undefined,
        }));
      }

      imported.push({
        filename: file.originalname,
        type,
        rows: data.length,
        preview: data.slice(0, 5), // first 5 rows as preview
      });
    }

    // Preview only — don't save anything
    res.json({ imported, warnings, quality_issues: qualityIssues });
  } catch (err) {
    console.error(`POST /api/reports/${req.params.id}/import/preview error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES — AI
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/ai/status', (req, res) => {
  try {
    res.json(getAIStatus());
  } catch (err) {
    console.error('GET /api/ai/status error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Shared guard: check AI availability and report permissions */
function guardAI(req, res) {
  const status = getAIStatus();
  if (!status.available) {
    res.status(503).json({ error: 'Add GEMINI_API_KEY to .env to enable AI' });
    return null;
  }

  const report = getReport(req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return null;
  }

  // Free-tier data rule: non-sample data requires explicit ai_allowed
  if (!report.is_sample && !report.ai_allowed) {
    res.status(403).json({
      error: 'AI is not allowed for this report. Set ai_allowed to true or use sample data.',
    });
    return null;
  }

  return report;
}

// ── AI: helpers ─────────────────────────────────────────────────────────────

function loadClientConfig(report) {
  return readJSON(`clients/${report.client}.json`) || {
    slug: report.client,
    name: report.client,
    topic_list: ['other'],
    competitors: [],
  };
}

function buildSectionNumbers(reportId) {
  const out = {};
  const mentions = readJSON(`reports/${reportId}/mentions.json`);
  const posts = readJSON(`reports/${reportId}/campaign_posts.json`) || [];
  const kpis = readJSON(`reports/${reportId}/kpis.json`) || [];
  const lanus = readJSON(`reports/${reportId}/lanus.json`) || [];
  const formatMix = readJSON(`reports/${reportId}/format_mix.json`) || [];
  const campaignShare = readJSON(`reports/${reportId}/campaign_share.json`) || [];
  const ploom = readJSON(`reports/${reportId}/ploom_mentions.json`) || [];
  const quality = readJSON(`reports/${reportId}/data_quality.json`) || [];

  if (kpis.length) {
    const ytd = kpis.find(k => k.period === '2026 YTD') || null;
    const allTime = kpis.find(k => k.period === 'All time') || null;
    const prior = kpis.find(k => /previous|prior|2025 ytd/i.test(k.period)) || null;
    const current = ytd || allTime;
    out.overview = {
      current: kpiForPrompt(current),
      previous: prior ? kpiForPrompt(prior) : null,
      note: 'All time is cumulative, not a comparison period. Do not present it as growth.',
    };
    out.lanu_leaderboard = lanus.slice(0, 10).map(l => ({
      rank: l.rank,
      name: l.name,
      posts: l.posts,
      reach_display: formatCount(l.reach),
      emv_display: formatMoney(l.emv_php),
    }));
    out.format_mix = {
      rows: formatMix.map(f => ({ platform: f.platform, format: f.format, posts_approx: f.posts_approx })),
      note: 'Approximate proportions; rows sum above the actual post total. Do not sum them.',
    };
    out.campaigns = {
      total_posts: current?.posts ?? null,
      total_posts_display: current ? formatCount(current.posts) : null,
      share_of_voice_top: campaignShare.slice(0, 10),
      note: 'share_of_voice is share of the client\'s own posts, not growth.',
    };
    out.top_posts = posts.slice(0, 10).map(p => ({
      id: p.post_id,
      creator: p.name,
      campaign: p.campaign,
      platform: p.platform,
      format: p.format,
      date: p.date,
      reach: p.reach,
      reach_display: formatCount(p.reach),
      emv_display: formatMoney(p.emv_php),
    }));
    out.competitor_watch = ploom.length
      ? {
          total_mentions: ploom.length,
          top: ploom.slice(0, 10).map(r => ({
            author: r.profile,
            platform: r.platform,
            date: r.date,
            post_type: r.post_type,
            caption: r.caption_excerpt,
          })),
        }
      : null;
    out.data_quality = quality.map(q => ({
      type: q.type,
      severity: q.severity,
      subject: q.name,
      message: q.message,
      affected_posts: q.affected_posts || [],
    }));
  }

  if (Array.isArray(mentions) && mentions.length) {
    const tags = (readJSON(`reports/${reportId}/ai_tags.json`) || {}).tags || [];
    // Client-brand sections describe ZYN only — the page's KPI strip does the same.
    const zynMentions = mentions.filter(m => m.brand === 'ZYN');
    const zynIds = new Set(zynMentions.map(m => m.mention_id));
    const zynTags = tags.filter(t => zynIds.has(t.mention_id));
    const listening = computeListeningMetrics(zynMentions, zynTags);
    out.headline_strip = { ...listening.sentiment, scope: 'ZYN mentions only' };
    out.brand_sentiment = { ...listening.sentiment, scope: 'ZYN mentions only' };
    out.trending_issues = listening.topics;
    out.geographic = computeGeoDistribution(mentions.filter(m => m.brand === 'ZYN'));
    out.conversation_volume = listening.weekly;
    out.platform_sentiment = listening.platform_sentiment;
    out.language_sentiment = listening.language_sentiment;
    out.top_voices = computeTopVoices(mentions.filter(m => m.brand === 'ZYN'), toLongTags(tags));
    out.keywords = computeKeywords(mentions.filter(m => m.brand === 'ZYN'));
    out.viral_posts = computeViralPosts(mentions.filter(m => m.brand === 'ZYN'), toLongTags(tags));
    out.share_of_voice = computeShareOfVoice(
      mentions.filter(m => m.brand === 'ZYN'),
      mentions.filter(m => m.brand === 'Ploom'),
      toLongTags(tags.filter(t => mentions.find(m => m.mention_id === t.mention_id && m.brand === 'ZYN'))),
      toLongTags(tags.filter(t => mentions.find(m => m.mention_id === t.mention_id && m.brand === 'Ploom')))
    );
    out.narrative_map = readJSON(`reports/${reportId}/narratives.json`) || listening.topics;
  }

  return out;
}

// ── AI: tagging ─────────────────────────────────────────────────────────────

app.post('/api/reports/:id/ai/tags', async (req, res) => {
  try {
    const report = guardAI(req, res);
    if (!report) return;

    setupSSE(res);

    const provider = aiProvider?.createProvider ? aiProvider.createProvider() : null;
    if (!provider) {
      sendSSE(res, { type: 'error', message: 'Add GEMINI_API_KEY to .env to enable AI' });
      return res.end();
    }

    const mentions = readJSON(`reports/${req.params.id}/mentions.json`) || [];
    if (!mentions.length) {
      sendSSE(res, { type: 'error', message: 'No listening mentions found. Import a Meltwater export first.' });
      return res.end();
    }

    const client = loadClientConfig(report);
    const rows = mentions.map(m => ({
      id: m.mention_id,
      brand: m.brand,
      platform: m.platform,
      text: m.text,
    }));

    const total = rows.length;
    const result = await aiProvider.tagMentionsBatch(provider, client, rows, (progress) => {
      sendSSE(res, { type: 'progress', done: progress.done, total: progress.total || total });
    });

    // Provider returns { id, ... }; store as { mention_id, ... }
    const tags = (result.tags || []).map(t => ({
      mention_id: t.id ?? t.mention_id,
      sentiment: t.sentiment,
      emotion: t.emotion,
      topic: t.topic,
      confidence: t.confidence,
    }));

    const payload = {
      provider: result.provider,
      model: result.model,
      prompt_version: result.prompt_version,
      generated_at: result.generated_at,
      tags,
    };
    writeJSON(`reports/${req.params.id}/ai_tags.json`, payload);
    appendAudit?.(req.params.id, { action: 'ai_tag', target: 'ai_tags.json', details: `${tags.length} mentions tagged (${result.provider}/${result.model})` });

    sendSSE(res, { type: 'complete', result: { tagged: tags.length, provider: result.provider, model: result.model } });
    res.end();
  } catch (err) {
    console.error(`POST /api/reports/${req.params.id}/ai/tags error:`, err);
    if (res.headersSent) {
      sendSSE(res, { type: 'error', message: err.message });
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ── AI: section summaries ───────────────────────────────────────────────────

app.post('/api/reports/:id/ai/summaries', async (req, res) => {
  try {
    const report = guardAI(req, res);
    if (!report) return;

    setupSSE(res);

    const provider = aiProvider?.createProvider ? aiProvider.createProvider() : null;
    if (!provider) {
      sendSSE(res, { type: 'error', message: 'Add GEMINI_API_KEY to .env to enable AI' });
      return res.end();
    }

    const client = loadClientConfig(report);
    const numbers = buildSectionNumbers(req.params.id);
    const keys = Object.keys(numbers);
    const total = keys.length;
    const sections = {};
    let done = 0;

    for (const key of keys) {
      try {
        const summary = await aiProvider.generateSummary(provider, client, key.replace(/_/g, ' '), numbers[key], null);
        sections[key] = {
          draft: summary.draft,
          final: null,
          provider: summary.provider,
          model: summary.model,
          prompt_version: summary.prompt_version,
          generated_at: summary.generated_at,
          approved_by: null,
          approved_at: null,
        };
      } catch (err) {
        sections[key] = { draft: '', final: null, error: err.message };
      }
      done++;
      sendSSE(res, { type: 'progress', done, total });
    }

    writeJSON(`reports/${req.params.id}/ai_summaries.json`, { sections });
    appendAudit?.(req.params.id, { action: 'ai_summary', target: 'ai_summaries.json', details: `${Object.keys(sections).length} sections (${provider.name}/${provider.model})` });

    sendSSE(res, { type: 'complete', result: { sections: Object.keys(sections) } });
    res.end();
  } catch (err) {
    console.error(`POST /api/reports/${req.params.id}/ai/summaries error:`, err);
    if (res.headersSent) {
      sendSSE(res, { type: 'error', message: err.message });
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ── AI: narratives ──────────────────────────────────────────────────────────

app.post('/api/reports/:id/ai/narratives', async (req, res) => {
  try {
    const report = guardAI(req, res);
    if (!report) return;

    setupSSE(res);

    const provider = aiProvider?.createProvider ? aiProvider.createProvider() : null;
    if (!provider) {
      sendSSE(res, { type: 'error', message: 'Add GEMINI_API_KEY to .env to enable AI' });
      return res.end();
    }

    const mentions = readJSON(`reports/${req.params.id}/mentions.json`) || [];
    const tags = (readJSON(`reports/${req.params.id}/ai_tags.json`) || {}).tags || [];
    if (!mentions.length || !tags.length) {
      sendSSE(res, { type: 'error', message: 'Run AI tagging first — narratives need tagged mentions.' });
      return res.end();
    }

    const client = loadClientConfig(report);
    const mentionMap = Object.fromEntries(mentions.map(m => [m.mention_id, m]));
    const grouped = {};
    for (const t of tags) {
      const g = grouped[t.topic] || (grouped[t.topic] = { count: 0, samples: [] });
      g.count++;
      const m = mentionMap[t.mention_id];
      if (m && g.samples.length < 5 && !g.samples.includes(m.text)) g.samples.push(m.text);
    }

    sendSSE(res, { type: 'progress', done: 0, total: 1 });
    const result = await aiProvider.generateNarratives(provider, client, grouped);
    writeJSON(`reports/${req.params.id}/narratives.json`, result);
    appendAudit?.(req.params.id, { action: 'ai_narrative', target: 'narratives.json', details: `${result.positive?.length || 0} positive, ${result.risk?.length || 0} risk` });
    sendSSE(res, { type: 'complete', result });
    res.end();
  } catch (err) {
    console.error(`POST /api/reports/${req.params.id}/ai/narratives error:`, err);
    if (res.headersSent) {
      sendSSE(res, { type: 'error', message: err.message });
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.patch('/api/reports/:id/ai/summaries/:section', (req, res) => {
  try {
    const { id, section } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const summaries = readJSON(`reports/${id}/ai_summaries.json`);
    if (!summaries) return res.status(404).json({ error: 'No AI summaries found. Generate them first.' });

    const sections = summaries.sections || {};
    if (!sections[section]) {
      return res.status(404).json({ error: `No summary found for section "${section}"` });
    }

    const { final: finalText, approved_by } = req.body;
    const entry = sections[section];
    if (finalText !== undefined) entry.final = finalText;
    if (approved_by !== undefined) entry.approved_by = approved_by;
    if (approved_by) entry.approved_at = new Date().toISOString();

    writeJSON(`reports/${id}/ai_summaries.json`, summaries);

    appendAudit?.(id, {
      action: approved_by ? 'summary_approved' : 'edit_summary',
      target: `ai_summaries.${section}`,
      details: { section, approved_by: approved_by || null },
    });

    res.json(entry);
  } catch (err) {
    console.error(`PATCH /api/reports/${req.params.id}/ai/summaries/${req.params.section} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES — Metrics
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/reports/:id/metrics', (req, res) => {
  try {
    const { id } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (!computeMetrics) {
      return res.status(501).json({ error: 'Metrics module not yet available' });
    }

    // Gather all data files for the report
    const reportData = {};
    const dataFiles = ['kpis', 'lanus', 'top_posts', 'campaign_share', 'format_mix', 'ploom_mentions', 'campaign_posts'];
    for (const file of dataFiles) {
      const data = readJSON(`reports/${id}/${file}.json`);
      if (data) reportData[file] = data;
    }

    const metrics = computeMetrics(reportData, report);
    res.json(metrics);
  } catch (err) {
    console.error(`GET /api/reports/${req.params.id}/metrics error:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id/metrics/:section', (req, res) => {
  try {
    const { id, section } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (!computeSectionMetrics) {
      return res.status(501).json({ error: 'Metrics module not yet available' });
    }

    const data = readJSON(`reports/${id}/${section}.json`);
    if (!data) return res.status(404).json({ error: `No data for section "${section}"` });

    const metrics = computeSectionMetrics(section, data, report);
    res.json(metrics);
  } catch (err) {
    console.error(`GET /api/reports/${req.params.id}/metrics/${req.params.section} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES — Quality & Audit
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/reports/:id/quality', (req, res) => {
  try {
    const { id } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Stored flags are authoritative — checks run at import time.
    const stored = readJSON(`reports/${id}/data_quality.json`);
    if (Array.isArray(stored)) return res.json(stored);

    if (!getQualityReport) return res.json([]);

    const quality = getQualityReport(id);
    res.json(quality);
  } catch (err) {
    console.error(`GET /api/reports/${req.params.id}/quality error:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/:id/audit', (req, res) => {
  try {
    const { id } = req.params;
    const report = getReport(id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (!readAudit) {
      // Fallback: return stored audit log if any
      const log = readJSON(`reports/${id}/audit_log.json`);
      return res.json(log || []);
    }

    const audit = readAudit(id);
    res.json(audit);
  } catch (err) {
    console.error(`GET /api/reports/${req.params.id}/audit error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Start server
// ═══════════════════════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  const aiStatus = getAIStatus();
  console.log(`\nTALINO API running on http://localhost:${PORT}`);
  console.log(`AI: ${aiStatus.available ? `✓ ${aiStatus.provider} / ${aiStatus.model}` : '✗ ' + aiStatus.message}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use — another TALINO API is probably still running.`);
    console.error(`  Stop it with:  kill $(lsof -ti :${PORT})\n`);
    process.exit(1);
  }
  throw err;
});
