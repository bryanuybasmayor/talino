import { getReport, getReportData, getClients } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { card, sectionHeader, kpiTile, aiReadBox, sampleBadge, sentimentBar, narrativeTag, statusBadge, emptyState, dataTable } from '../components/ui.js';
import { formatCurrency, formatNumber, formatWhole, formatPct, formatDate, formatDateRange, formatWeek } from '../lib/format.js';
import { hBars, vBars, stackedBars, lines, chartBlock, bindChartTableToggles, PALETTE } from '../lib/charts.js';
import { computeEngagementRate, computeLANUEfficiency, computeSentimentSplit, computeEmotionMix, computeTopicRanking, toLongTags } from '../lib/metrics.js';

// Theme-aware chart colors
const POS = 'var(--color-positive)';
const NEU = 'var(--color-neutral-sent)';
const NEG = 'var(--color-negative)';
const INFO = 'var(--color-info)';
const BRAND = 'var(--color-brand-primary)';
const BRAND2 = 'var(--color-brand-secondary)';

// ── Helpers ──────────────────────────────────────────────────────────────
function getSummary(summaries, key) {
  return summaries?.sections?.[key] || null;
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ── Main render ──────────────────────────────────────────────────────────
export async function renderReport(main, reportId) {
  main.innerHTML = `<div class="flex items-center justify-center min-h-[60vh]"><p class="animate-pulse text-ink-faint">Loading report…</p></div>`;

  const report = await getReport(reportId);
  const clients = await getClients();
  const client = clients.find(c => c.slug === report.client);

  // Load all data files in parallel
  const [kpis, posts, lanus, campaignShare, formatMix, ploomMentions, mentions, aiTags, aiSummaries, narratives, quality] = await Promise.all([
    getReportData(reportId, 'kpis').catch(() => []),
    getReportData(reportId, 'campaign_posts').catch(() => []),
    getReportData(reportId, 'lanus').catch(() => []),
    getReportData(reportId, 'campaign_share').catch(() => []),
    getReportData(reportId, 'format_mix').catch(() => []),
    getReportData(reportId, 'ploom_mentions').catch(() => []),
    getReportData(reportId, 'mentions').catch(() => []),
    getReportData(reportId, 'ai_tags').catch(() => null),
    getReportData(reportId, 'ai_summaries').catch(() => null),
    getReportData(reportId, 'narratives').catch(() => null),
    getReportData(reportId, 'data_quality').catch(() => []),
  ]);

  const hasCampaign = kpis.length > 0 || posts.length > 0;
  const hasListening = mentions.length > 0;
  const tags = aiTags?.tags || [];
  const tagMap = Object.fromEntries(tags.map(t => [t.mention_id, t]));

  // ── Build page ─────────────────────────────────────────────────────────
  main.innerHTML = `
    <!-- Header -->
    <header class="panel-hero relative border-b border-border bg-surface-raised/90 print:bg-white print:border-b">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-7">
        <div class="flex items-center gap-3 mb-3">
          ${client?.logo ? `<img src="${client.logo}" alt="${client.name}" class="w-10 h-10 rounded-lg ring-1 ring-border bg-surface-raised p-0.5" />` : ''}
          <img src="/assets/logos/talino-mark.svg" alt="TALINO" class="w-8 h-8" />
          <span class="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest rounded-full bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20">Client report</span>
        </div>
        <h1 class="text-3xl font-bold font-display text-ink leading-tight">${report.title}</h1>
        <p class="text-sm text-ink-muted mt-1.5">${client?.name || report.client} · ${(() => { const k = kpis.find(x => x.period === '2026 YTD') || kpis[0]; return k?.start_date ? `${k.period} · ${formatDateRange(k.start_date, k.end_date)}` : formatDateRange(report.period_start, report.period_end); })()}</p>
        ${report.is_sample ? `<div class="mt-2">${sampleBadge()}</div>` : ''}
        
        <!-- In-page nav -->
        <nav class="flex flex-wrap items-center gap-2 mt-5 text-sm no-print" aria-label="Report sections">
          ${hasCampaign ? '<a href="#/report/' + reportId + '#parta" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/25 hover:bg-brand-primary/20 transition-colors">Part A: Campaign</a>' : ''}
          ${hasListening ? '<a href="#/report/' + reportId + '#partb" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-accent-violet/10 text-accent-violet ring-1 ring-accent-violet/25 hover:bg-accent-violet/20 transition-colors">Part B: Listening</a>' : ''}
          <a href="#/workspace/report/${reportId}" class="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-ink-muted hover:text-ink hover:bg-surface-alt transition-colors no-print">${icon.settings} Workspace</a>
        </nav>
      </div>
    </header>

    <!-- Content -->
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      ${hasCampaign ? `<div id="parta" class="scroll-mt-4">${renderPartA()}</div>` : ''}
      ${hasListening ? `<div id="partb" class="scroll-mt-4">${renderPartB()}</div>` : ''}
    </div>`;

  // ── Initialize charts after DOM is ready ───────────────────────────────
  if (hasCampaign) initPartACharts();
  if (hasListening) initPartBCharts();
  bindChartTableToggles(main);

  setTimeout(() => {
    // Scroll to anchor if present
    const hash = window.location.hash;
    if (hash.includes('#partb')) {
      document.getElementById('partb')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, 0);

  // Toggle for proof URLs
  main.querySelector('#toggle-proof')?.addEventListener('change', (e) => {
    main.querySelectorAll('.proof-cell').forEach(el => {
      el.style.display = e.target.checked ? '' : 'none';
    });
  });

  // ── Part A: Campaign & LANU Performance ────────────────────────────────
  function renderPartA() {
    const allTime = kpis.find(k => k.period === 'All time');
    const ytd = kpis.find(k => k.period === '2026 YTD');
    const current = ytd || allTime;
    // Only compare against a real prior period. "All time" is cumulative, not a baseline.
    const previous = kpis.find(k => /previous|prior|2025 ytd/i.test(k.period)) || null;

    return `
      <div class="space-y-10">
        <div class="flex items-center gap-3 border-b border-border pb-3">
          <span aria-hidden="true" class="h-6 w-1 rounded-full bg-linear-to-b from-brand-primary to-accent-teal"></span>
          <h2 class="text-xl font-bold font-display text-ink">Part A — Campaign & LANU Performance</h2>
        </div>

        <!-- A1: Overview -->
        <section class="section-enter">
          ${sectionHeader(1, 'Overview', 'Key performance indicators across all campaigns')}
          ${card(`<div class="p-5">
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
              ${kpiTile('EMV', formatCurrency(current?.emv_php), previous ? pctChange(ytd?.emv_php, allTime?.emv_php - ytd?.emv_php) : null)}
              ${kpiTile('Reach', formatNumber(current?.reach), previous ? pctChange(ytd?.reach, allTime?.reach - ytd?.reach) : null)}
              ${kpiTile('Views', formatNumber(current?.views), previous ? pctChange(ytd?.views, allTime?.views - ytd?.views) : null)}
              ${kpiTile('Engagement Rate', formatPct(current ? computeEngagementRate(current.likes, current.comments, current.shares, current.saves, current.reach) : 0), null)}
              ${kpiTile('Posts', formatWhole(current?.posts), null)}
              ${kpiTile('Active LANUs', formatWhole(current?.lanus), null)}
            </div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'overview'))}
        </section>

        <!-- A2: Performance Over Time -->
        <section class="section-enter">
          ${sectionHeader(2, 'Performance Over Time', 'Weekly posts and reach')}
          ${card(`<div class="p-5">${emptyState('Needs the full post export — the PDF only has totals, not daily data', { icon: icon.barChart })}</div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'performance_over_time'))}
        </section>

        <!-- A3: Campaigns -->
        <section class="section-enter">
          ${sectionHeader(3, 'Campaigns', 'Share of posts per campaign')}
          ${card(`<div class="p-5">
            ${renderCampaignTable()}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'campaigns'))}
        </section>

        <!-- A4: LANU Leaderboard -->
        <section class="section-enter">
          ${sectionHeader(4, 'LANU Leaderboard', 'Top influencers by EMV with efficiency metrics')}
          ${card(`<div class="p-5">
            ${renderLANUTable()}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'lanu_leaderboard'))}
        </section>

        <!-- A5: Content Format Mix -->
        <section class="section-enter">
          ${sectionHeader(5, 'Content Format Mix', 'Posts by platform and format (approximate)', { badge: 'Approximate values' })}
          ${card(`<div class="p-5">
            <div class="w-full"><div id="chart-format-mix"></div></div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'format_mix'))}
        </section>

        <!-- A6: Top Posts -->
        <section class="section-enter">
          ${sectionHeader(6, 'Top Posts', 'Highest-EMV posts across all campaigns')}
          ${card(`<div class="p-5">
            <label class="flex items-center gap-2 text-xs text-ink-muted mb-3 no-print cursor-pointer">
              <input type="checkbox" id="toggle-proof" class="rounded border-border" />
              Show internal links
            </label>
            ${renderTopPostsTable()}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'top_posts'))}
        </section>

        <!-- A7: Competitor Watch -->
        <section class="section-enter">
          ${sectionHeader(7, 'Competitor Watch: Ploom', 'Ploom PH social activity from monitoring data')}
          ${card(`<div class="p-5">
            ${renderPloomSection()}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'competitor_watch'))}
        </section>

        <!-- A8: Data Quality -->
        <section class="section-enter">
          ${sectionHeader(8, 'Data Quality', 'Known issues and flags in this dataset')}
          ${card(`<div class="p-5">
            ${renderQualitySection()}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'data_quality'))}
        </section>
      </div>`;
  }

  function renderCampaignTable() {
    if (!campaignShare.length) return emptyState('No campaign data');
    const totalPosts = kpis.find(k => k.period === 'All time')?.posts || 5873;
    const maxShare = Math.max(...campaignShare.map(c => c.share_pct));
    return `
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-border">
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Campaign</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Share</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Est. Posts</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted w-40">Distribution</th>
          </tr></thead>
          <tbody class="divide-y divide-border">
            ${campaignShare.map(c => `<tr class="hover:bg-surface-alt/50">
              <td class="px-3 py-2 font-medium text-ink">${c.campaign}</td>
              <td class="px-3 py-2 text-right tabular-nums">${formatPct(c.share_pct)}</td>
              <td class="px-3 py-2 text-right tabular-nums text-ink-muted">${Math.round(totalPosts * c.share_pct / 100).toLocaleString()}</td>
              <td class="px-3 py-2"><div class="w-full bg-surface-alt rounded-full h-2"><div class="bg-brand-primary h-2 rounded-full" style="width:${(c.share_pct / maxShare * 100).toFixed(1)}%"></div></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderLANUTable() {
    if (!lanus.length) return emptyState('No LANU data');
    const enriched = computeLANUEfficiency(lanus);
    return `
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-border">
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">#</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Name</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Posts</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">EMV</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Reach</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">EMV/Post</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">EMV/1K Reach</th>
          </tr></thead>
          <tbody class="divide-y divide-border">
            ${enriched.map(l => `<tr class="hover:bg-surface-alt/50">
              <td class="px-3 py-2 text-ink-muted">${l.rank}</td>
              <td class="px-3 py-2 font-medium text-ink">${l.name}</td>
              <td class="px-3 py-2 text-right tabular-nums">${l.posts}</td>
              <td class="px-3 py-2 text-right tabular-nums">${formatCurrency(l.emv_php)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${formatNumber(l.reach)}</td>
              <td class="px-3 py-2 text-right tabular-nums text-brand-primary font-medium">${formatCurrency(l.emv_per_post)}</td>
              <td class="px-3 py-2 text-right tabular-nums text-brand-primary font-medium">${formatCurrency(l.emv_per_1k_reach, { decimals: 0 })}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderTopPostsTable() {
    if (!posts.length) return emptyState('No post data');
    const copiedIds = new Set();
    (quality || []).filter(q => q.type === 'copied_metrics').forEach(q => (q.affected_rows || q.affected_posts || []).forEach(id => copiedIds.add(id)));

    return `
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-border">
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">#</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Name</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Campaign</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Format</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Reach</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">EMV</th>
            <th class="px-3 py-2 text-center text-xs font-semibold text-ink-muted">Link</th>
            <th class="px-3 py-2 text-center text-xs font-semibold text-ink-muted proof-cell" style="display:none">Proof</th>
          </tr></thead>
          <tbody class="divide-y divide-border">
            ${posts.map((p, i) => {
              const flagged = copiedIds.has(p.post_id);
              return `<tr class="hover:bg-surface-alt/50 ${flagged ? 'bg-warning/5' : ''}">
                <td class="px-3 py-2 text-ink-muted">${i + 1}</td>
                <td class="px-3 py-2 font-medium text-ink">
                  ${p.name}
                  ${flagged ? `<span class="ml-1 text-warning" title="Copied metrics — see Data Quality">${icon.alertTriangle}</span>` : ''}
                </td>
                <td class="px-3 py-2 text-ink-muted text-xs">${p.campaign || '—'}</td>
                <td class="px-3 py-2 text-xs">${p.platform ? `${p.platform} · ${p.format}` : '—'}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatNumber(p.reach)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatCurrency(p.emv_php)}</td>
                <td class="px-3 py-2 text-center">${p.post_url ? `<a href="${p.post_url}" target="_blank" rel="noopener" class="text-brand-primary hover:text-brand-secondary">${icon.externalLink}</a>` : '—'}</td>
                <td class="px-3 py-2 text-center proof-cell" style="display:none">${p.proof_url ? `<a href="${p.proof_url}" target="_blank" rel="noopener" class="text-ink-faint hover:text-ink">${icon.externalLink}</a>` : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderPloomSection() {
    if (!ploomMentions.length) return emptyState('No Ploom monitoring data');
    // Platform breakdown
    const platCounts = {};
    const typeCounts = {};
    ploomMentions.forEach(m => {
      platCounts[m.platform] = (platCounts[m.platform] || 0) + 1;
      typeCounts[m.post_type] = (typeCounts[m.post_type] || 0) + 1;
    });
    // Instagram/Facebook mirroring
    const fbPosts = ploomMentions.filter(m => m.platform === 'Facebook');
    const igPosts = ploomMentions.filter(m => m.platform === 'Instagram');
    const mirroredCount = fbPosts.filter(fb => igPosts.some(ig => ig.date === fb.date && ig.caption_excerpt && fb.caption_excerpt && ig.caption_excerpt.slice(0, 30) === fb.caption_excerpt.slice(0, 30))).length;

    return `
      <div class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div class="p-3 bg-surface-alt rounded-lg"><span class="text-ink-muted text-xs">Total posts</span><p class="font-bold font-display text-ink">${ploomMentions.length}</p></div>
          ${Object.entries(platCounts).map(([p, c]) => `<div class="p-3 bg-surface-alt rounded-lg"><span class="text-ink-muted text-xs">${p}</span><p class="font-bold font-display text-ink">${c}</p></div>`).join('')}
        </div>
        <p class="text-sm text-ink-muted">${mirroredCount} posts appear on both Instagram and Facebook (content mirroring). Post types: ${Object.entries(typeCounts).map(([t, c]) => `${t} (${c})`).join(', ')}.</p>
        <p class="text-xs text-ink-faint">Showing first ${ploomMentions.length} of 1,923 total Ploom mentions from monitoring.</p>
        <details>
          <summary class="text-sm text-brand-primary cursor-pointer hover:underline">Recent posts</summary>
          <div class="mt-3 space-y-2">
            ${ploomMentions.slice(0, 10).map(m => `
              <div class="p-3 bg-surface-alt rounded-lg text-sm">
                <div class="flex items-center gap-2 text-xs text-ink-muted mb-1">
                  <span>${formatDate(m.date)}</span> · <span>${m.profile}</span> · <span>${m.platform} ${m.post_type}</span>
                </div>
                ${m.caption_excerpt ? `<p class="text-ink text-sm">${m.caption_excerpt}</p>` : '<p class="text-ink-faint text-xs italic">No caption (Story)</p>'}
                ${m.post_url ? `<a href="${m.post_url}" target="_blank" rel="noopener" class="text-xs text-brand-primary hover:underline mt-1 inline-flex items-center gap-1">${icon.externalLink} View</a>` : ''}
              </div>
            `).join('')}
          </div>
        </details>
      </div>`;
  }

  function renderQualitySection() {
    if (!quality || quality.length === 0) return `<div class="flex items-center gap-2 text-positive"><span>${icon.checkCircle}</span><span class="text-sm">No data quality issues found</span></div>`;
    return `<div class="space-y-3">
      ${quality.map(q => {
        const colors = { error: 'text-negative', warning: 'text-warning', info: 'text-info' };
        return `<div class="flex items-start gap-3 p-3 rounded-lg bg-surface-alt">
          <span class="${colors[q.severity] || colors.info} flex-shrink-0 mt-0.5">${icon.alertTriangle}</span>
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-surface text-ink-muted">${q.type}</span>
            </div>
            <p class="text-sm text-ink">${q.message}</p>
            ${(q.affected_rows || q.affected_posts)?.length ? `<p class="text-xs text-ink-faint mt-1">Rows: ${(q.affected_rows || q.affected_posts).join(', ')}</p>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Part B: Social Listening ───────────────────────────────────────────
  function renderPartB() {
    const badge = ''; // page-level sample badge already shown in the header
    const zynMentions = mentions.filter(m => m.brand === 'ZYN');
    const ploomListening = mentions.filter(m => m.brand === 'Ploom');
    const zynTags = tags.filter(t => zynMentions.find(m => m.mention_id === t.mention_id));
    const ploomTags = tags.filter(t => ploomListening.find(m => m.mention_id === t.mention_id));

    // Sentiment
    const sentCount = { positive: 0, neutral: 0, negative: 0 };
    const emotionCount = {};
    const topicCount = {};
    for (const t of zynTags) {
      sentCount[t.sentiment]++;
      emotionCount[t.emotion] = (emotionCount[t.emotion] || 0) + 1;
      topicCount[t.topic] = (topicCount[t.topic] || 0) + 1;
    }
    const total = zynTags.length || 1;
    const posPct = (sentCount.positive / total * 100).toFixed(1);
    const negPct = (sentCount.negative / total * 100).toFixed(1);
    const netScore = (parseFloat(posPct) - parseFloat(negPct)).toFixed(1);

    // Platform counts
    const platCount = {};
    zynMentions.forEach(m => { platCount[m.platform] = (platCount[m.platform] || 0) + 1; });
    const topPlat = Object.entries(platCount).sort((a, b) => b[1] - a[1]);

    // Weekly volume
    const weeklyVol = {};
    zynMentions.forEach(m => {
      const d = new Date(m.date);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const key = ws.toISOString().slice(0, 10);
      weeklyVol[key] = (weeklyVol[key] || 0) + 1;
    });
    const weeks = Object.entries(weeklyVol).sort((a, b) => a[0].localeCompare(b[0]));
    const peakWeek = weeks.reduce((max, w) => w[1] > max[1] ? w : max, ['', 0]);

    // Dominant emotion
    const topEmotion = Object.entries(emotionCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    // Geo
    const cityCount = {};
    zynMentions.forEach(m => { if (m.city) cityCount[m.city] = (cityCount[m.city] || 0) + 1; });
    const geoTagged = zynMentions.filter(m => m.city).length;

    // Language
    const langCount = {};
    zynMentions.forEach(m => { langCount[m.language] = (langCount[m.language] || 0) + 1; });

    // Platform sentiment
    const platSent = {};
    zynMentions.forEach(m => {
      if (!platSent[m.platform]) platSent[m.platform] = { positive: 0, neutral: 0, negative: 0 };
      const t = tagMap[m.mention_id];
      if (t) platSent[m.platform][t.sentiment]++;
    });

    // Language sentiment
    const langSent = {};
    zynMentions.forEach(m => {
      if (!langSent[m.language]) langSent[m.language] = { positive: 0, neutral: 0, negative: 0, total: 0 };
      langSent[m.language].total++;
      const t = tagMap[m.mention_id];
      if (t) langSent[m.language][t.sentiment]++;
    });

    // Keywords
    const kwCount = {};
    zynMentions.forEach(m => {
      const words = m.text.match(/#\w+/g) || [];
      words.forEach(w => { kwCount[w.toLowerCase()] = (kwCount[w.toLowerCase()] || 0) + 1; });
    });
    const riskKw = ['#bawal', '#underagevaping', '#healthrisk', '#regulatenow', '#protecttheyouth', '#nicotineaddiction'];

    // Top voices
    const voiceStats = {};
    zynMentions.filter(m => !m.is_lanu).forEach(m => {
      if (!voiceStats[m.author]) voiceStats[m.author] = { author: m.author, platform: m.platform, reach: 0, engagement: 0, count: 0, sentiments: [] };
      const v = voiceStats[m.author];
      v.reach = Math.max(v.reach, m.reach || 0);
      v.engagement = Math.max(v.engagement, m.engagement || 0);
      v.count++;
      const t = tagMap[m.mention_id];
      if (t) v.sentiments.push(t.sentiment);
    });
    const topVoices = Object.values(voiceStats).sort((a, b) => (b.reach + b.engagement) - (a.reach + a.engagement)).slice(0, 10);

    // Viral posts
    const viralPosts = [...zynMentions].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 5);

    // SOV
    const ploomSentCount = { positive: 0, neutral: 0, negative: 0 };
    ploomTags.forEach(t => { ploomSentCount[t.sentiment]++; });
    const ploomTotal = ploomTags.length || 1;


    return `
      <div class="space-y-10">
        <div class="flex items-center gap-3 border-b border-border pb-3">
          <span aria-hidden="true" class="h-6 w-1 rounded-full bg-linear-to-b from-accent-violet to-accent-pink"></span>
          <h2 class="text-xl font-bold font-display text-ink">Part B — Social Listening</h2>
        </div>

        <!-- B1: Headline Strip -->
        <section class="section-enter" id="section-b1">
          ${badge}
          ${sectionHeader(1, 'Headline Strip', 'Key listening metrics at a glance')}
          ${card(`<div class="p-5">
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
              ${kpiTile('Conversation Volume', formatWhole(zynMentions.length))}
              ${kpiTile('Net Sentiment', `+${netScore}`, null)}
              ${kpiTile('Dominant Emotion', topEmotion)}
              ${kpiTile('Peak Week', formatWeek(peakWeek[0]), null)}
              ${kpiTile('Top Platform', `${topPlat[0]?.[0] || '—'}`, null)}
            </div>
            <div class="mt-3 text-xs text-ink-faint">
              Sentiment split: ${posPct}% positive · ${(sentCount.neutral / total * 100).toFixed(1)}% neutral · ${negPct}% negative.
              ${topPlat[0] ? `${topPlat[0][0]} ${(topPlat[0][1] / zynMentions.length * 100).toFixed(1)}%` : ''}${topPlat[1] ? `, ${topPlat[1][0]} ${(topPlat[1][1] / zynMentions.length * 100).toFixed(1)}%` : ''}${topPlat[2] ? `, ${topPlat[2][0]} ${(topPlat[2][1] / zynMentions.length * 100).toFixed(1)}%` : ''}.
            </div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'headline_strip'))}
        </section>

        <!-- B2: Brand Sentiment -->
        <section class="section-enter" id="section-b2">
          ${badge}
          ${sectionHeader(2, 'Brand Sentiment', 'Positive / neutral / negative split and emotion mix')}
          ${card(`<div class="p-5 space-y-4">
            <div>
              <p class="text-sm font-medium text-ink mb-2">Sentiment</p>
              ${sentimentBar(sentCount.positive, sentCount.neutral, sentCount.negative)}
              <p class="text-sm text-ink mt-2">Net score: <span class="font-bold font-display text-lg ${parseFloat(netScore) >= 0 ? 'text-positive' : 'text-negative'}">+${netScore}</span></p>
            </div>
            <div>
              <p class="text-sm font-medium text-ink mb-2">Emotion Mix</p>
              <div class="w-full"><div id="chart-emotions"></div></div>
            </div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'brand_sentiment'))}
        </section>

        <!-- B3: Trending Issues -->
        <section class="section-enter" id="section-b3">
          ${badge}
          ${sectionHeader(3, 'Top Trending Issues', 'Topics ranked by volume, colored by dominant sentiment')}
          ${card(`<div class="p-5">
            <div class="w-full"><div id="chart-topics"></div></div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'trending_issues'))}
        </section>

        <!-- B4: Geographic -->
        <section class="section-enter" id="section-b4">
          ${badge}
          ${sectionHeader(4, 'Geographic Distribution', `Volume by city (${geoTagged} of ${zynMentions.length} mentions geo-tagged)`)}
          ${card(`<div class="p-5">
            <div class="w-full"><div id="chart-geo"></div></div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'geographic'))}
        </section>

        <!-- B5: Conversation Volume -->
        <section class="section-enter" id="section-b5">
          ${badge}
          ${sectionHeader(5, 'Conversation Volume', 'Weekly mention volume with campaign events')}
          ${card(`<div class="p-5">
            <div class="w-full"><div id="chart-weekly"></div></div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'conversation_volume'))}
        </section>

        <!-- B6: Platform Sentiment -->
        <section class="section-enter" id="section-b6">
          ${badge}
          ${sectionHeader(6, 'Sentiment by Platform', 'How each platform shapes the sentiment story')}
          ${card(`<div class="p-5">
            <div class="w-full"><div id="chart-plat-sent"></div></div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'platform_sentiment'))}
        </section>

        <!-- B7: Narrative Map -->
        <section class="section-enter" id="section-b7">
          ${badge}
          ${sectionHeader(7, 'Narrative Map', 'Brand-positive vs risk/pressure narratives')}
          ${card(`<div class="p-5">
            ${renderNarratives()}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'narrative_map'))}
        </section>

        <!-- B8: Top Voices -->
        <section class="section-enter" id="section-b8">
          ${badge}
          ${sectionHeader(8, 'Top Voices', 'Highest-impact organic (non-LANU) accounts')}
          ${card(`<div class="p-5">
            ${renderTopVoicesTable(topVoices)}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'top_voices'))}
        </section>

        <!-- B9: Language Sentiment -->
        <section class="section-enter" id="section-b9">
          ${badge}
          ${sectionHeader(9, 'Sentiment by Language', 'How sentiment varies across languages')}
          ${card(`<div class="p-5">
            ${renderLanguageTable(langSent)}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'language_sentiment'))}
        </section>

        <!-- B10: Keywords -->
        <section class="section-enter" id="section-b10">
          ${badge}
          ${sectionHeader(10, 'Popular Keywords', 'Weighted hashtags and keywords')}
          ${card(`<div class="p-5">
            ${renderKeywords(kwCount, riskKw)}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'keywords'))}
        </section>

        <!-- B11: Viral Posts -->
        <section class="section-enter" id="section-b11">
          ${badge}
          ${sectionHeader(11, 'Top 5 Viral Posts', 'Highest-reach organic mentions')}
          ${card(`<div class="p-5">
            ${renderViralPosts(viralPosts)}
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'viral_posts'))}
        </section>

        <!-- B12: Share of Voice -->
        <section class="section-enter" id="section-b12">
          ${badge}
          ${sectionHeader(12, 'Share of Voice vs Ploom', 'ZYN vs Ploom conversation comparison')}
          ${card(`<div class="p-5">
            <div class="grid grid-cols-2 gap-6">
              <div>
                <h4 class="text-sm font-semibold text-ink mb-2">ZYN</h4>
                <p class="text-2xl font-bold font-display text-brand-primary">${formatWhole(zynMentions.length)}</p>
                <p class="text-xs text-ink-muted">mentions</p>
                ${sentimentBar(sentCount.positive, sentCount.neutral, sentCount.negative)}
                <p class="text-xs text-ink-muted mt-1">Net: +${netScore}</p>
              </div>
              <div>
                <h4 class="text-sm font-semibold text-ink mb-2">Ploom</h4>
                <p class="text-2xl font-bold font-display text-brand-secondary">${formatWhole(ploomListening.length)}</p>
                <p class="text-xs text-ink-muted">mentions</p>
                ${sentimentBar(ploomSentCount.positive, ploomSentCount.neutral, ploomSentCount.negative)}
                <p class="text-xs text-ink-muted mt-1">Net: +${((ploomSentCount.positive / ploomTotal * 100) - (ploomSentCount.negative / ploomTotal * 100)).toFixed(1)}</p>
              </div>
            </div>
            <div class="mt-4">
              <div class="w-full"><div id="chart-sov"></div></div>
            </div>
          </div>`)}
          ${aiReadBox(getSummary(aiSummaries, 'share_of_voice'))}
        </section>
      </div>`;
  }

  function renderNarratives() {
    if (!narratives) return emptyState('Run AI to generate narratives');
    const pos = narratives.positive || [];
    const risk = narratives.risk || [];
    // Compute volumes from topic counts
    const topicCount = {};
    tags.filter(t => mentions.find(m => m.mention_id === t.mention_id && m.brand === 'ZYN')).forEach(t => {
      topicCount[t.topic] = (topicCount[t.topic] || 0) + 1;
    });

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 class="text-sm font-semibold text-positive mb-3 flex items-center gap-1">${icon.trendingUp} Brand-Positive</h4>
          <div class="space-y-3">
            ${pos.map(n => `
              <div class="p-3 rounded-lg border border-positive/20 bg-positive/5">
                <div class="flex items-center justify-between mb-1">
                  <h5 class="text-sm font-semibold text-ink">${n.title}</h5>
                  ${narrativeTag(n.status)}
                </div>
                <p class="text-xs text-ink-muted mb-1">${n.description}</p>
                <div class="flex items-center gap-2 text-xs text-ink-faint">
                  <span>${n.topic}</span>
                  <span>·</span>
                  <span>${formatWhole(topicCount[n.topic] || 0)} mentions</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-negative mb-3 flex items-center gap-1">${icon.trendingDown} Risk / Pressure</h4>
          <div class="space-y-3">
            ${risk.map(n => `
              <div class="p-3 rounded-lg border border-negative/20 bg-negative/5">
                <div class="flex items-center justify-between mb-1">
                  <h5 class="text-sm font-semibold text-ink">${n.title}</h5>
                  ${narrativeTag(n.status)}
                </div>
                <p class="text-xs text-ink-muted mb-1">${n.description}</p>
                <div class="flex items-center gap-2 text-xs text-ink-faint">
                  <span>${n.topic}</span>
                  <span>·</span>
                  <span>${formatWhole(topicCount[n.topic] || 0)} mentions</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  }

  function renderTopVoicesTable(voices) {
    if (!voices.length) return emptyState('No voice data');
    return `
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-border">
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">#</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Handle</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Platform</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Top Reach</th>
            <th class="px-3 py-2 text-right text-xs font-semibold text-ink-muted">Top Engagement</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Lean</th>
          </tr></thead>
          <tbody class="divide-y divide-border">
            ${voices.map((v, i) => {
              const posSent = v.sentiments.filter(s => s === 'positive').length;
              const negSent = v.sentiments.filter(s => s === 'negative').length;
              const lean = posSent > negSent ? 'Positive' : negSent > posSent ? 'Negative' : 'Neutral';
              const leanColor = lean === 'Positive' ? 'text-positive' : lean === 'Negative' ? 'text-negative' : 'text-ink-muted';
              return `<tr class="hover:bg-surface-alt/50">
                <td class="px-3 py-2 text-ink-muted">${i + 1}</td>
                <td class="px-3 py-2 font-medium text-ink">${v.author}</td>
                <td class="px-3 py-2 text-ink-muted">${v.platform}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatNumber(v.reach)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatNumber(v.engagement)}</td>
                <td class="px-3 py-2 ${leanColor} font-medium">${lean}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderLanguageTable(langSent) {
    const langs = Object.entries(langSent).sort((a, b) => b[1].total - a[1].total);
    return `
      <div class="space-y-3">
        ${langs.map(([lang, s]) => {
          const t = s.total || 1;
          return `<div class="flex items-center gap-4">
            <span class="w-20 text-sm font-medium text-ink">${lang}</span>
            <div class="flex-1">${sentimentBar(s.positive, s.neutral, s.negative)}</div>
            <span class="text-xs text-ink-muted tabular-nums w-16 text-right">${formatWhole(s.total)}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderKeywords(kwCount, riskKw) {
    const sorted = Object.entries(kwCount).sort((a, b) => b[1] - a[1]).slice(0, 30);
    if (!sorted.length) return emptyState('No keywords found');
    const maxCount = sorted[0][1];
    return `
      <div class="flex flex-wrap gap-2">
        ${sorted.map(([kw, count]) => {
          const size = Math.max(0.75, Math.min(2, (count / maxCount) * 2));
          const isRisk = riskKw.includes(kw.toLowerCase());
          return `<span class="inline-block px-2 py-1 rounded-md ${isRisk ? 'bg-negative/10 text-negative border border-negative/20' : 'bg-surface-alt text-ink'}" style="font-size:${size}rem" title="${count} mentions">${kw} <span class="text-xs text-ink-faint">${count}</span></span>`;
        }).join('')}
      </div>`;
  }

  function renderViralPosts(viralPosts) {
    if (!viralPosts.length) return emptyState('No viral posts');
    return `
      <div class="space-y-3">
        ${viralPosts.map((m, i) => {
          const t = tagMap[m.mention_id];
          const sentColor = t?.sentiment === 'positive' ? 'bg-positive/10 text-positive' : t?.sentiment === 'negative' ? 'bg-negative/10 text-negative' : 'bg-surface-alt text-ink-muted';
          return `
            <div class="p-4 rounded-lg border border-border bg-surface-alt/30">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs font-bold text-ink-muted">#${i + 1}</span>
                <span class="text-xs px-1.5 py-0.5 rounded ${sentColor} font-medium">${t?.sentiment || 'untagged'}</span>
                <span class="text-xs text-ink-faint">${m.platform}</span>
                <span class="text-xs text-ink-faint">· ${formatDate(m.date)}</span>
              </div>
              <p class="text-sm text-ink mb-2">${m.text}</p>
              <div class="flex items-center gap-4 text-xs text-ink-muted">
                <span class="font-medium">${m.author}</span>
                <span>Reach: <strong class="text-ink">${formatNumber(m.reach)}</strong></span>
                <span>Engagement: <strong class="text-ink">${formatNumber(m.engagement)}</strong></span>
                ${m.views ? `<span>Views: <strong class="text-ink">${formatNumber(m.views)}</strong></span>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  // ── Chart rendering (inline SVG) ───────────────────────────────────────
  function mount(id, html) {
    const slot = document.getElementById(id);
    if (slot) slot.innerHTML = html;
  }

  function initPartACharts() {
    if (!formatMix.length) return;
    const items = formatMix.map((f, i) => ({
      label: `${f.platform} · ${f.format}`,
      value: f.posts_approx,
      color: PALETTE[i % PALETTE.length],
    }));
    mount('chart-format-mix', chartBlock(
      hBars(items, { height: 300, barColor: BRAND }),
      {
        label: 'Posts by platform and format',
        columns: ['Platform · Format', 'Posts (approx.)'],
        rows: items.map(i => [i.label, formatWhole(i.value)]),
      }
    ));
  }

  function initPartBCharts() {
    const zynMentions = mentions.filter(m => m.brand === 'ZYN');
    const zynTags = tags.filter(t => zynMentions.find(m => m.mention_id === t.mention_id));

    // Emotions
    const emotionColors = {
      joy: POS, excitement: 'var(--color-accent-amber)', trust: INFO, surprise: 'var(--color-accent-violet)',
      neutral: NEU, sadness: 'var(--color-accent-sky)', anger: NEG, disgust: 'var(--color-accent-pink)', fear: 'var(--color-accent-violet)',
    };
    const emotionCount = {};
    zynTags.forEach(t => { emotionCount[t.emotion] = (emotionCount[t.emotion] || 0) + 1; });
    const emotions = Object.entries(emotionCount)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, color: emotionColors[label] || NEU }));
    mount('chart-emotions', chartBlock(
      hBars(emotions, { height: 220 }),
      {
        label: 'Mentions by emotion',
        columns: ['Emotion', 'Mentions'],
        rows: emotions.map(e => [e.label, formatWhole(e.value)]),
      }
    ));

    // Topics, coloured by dominant sentiment
    const topicCount = {};
    const topicSent = {};
    zynTags.forEach(t => {
      topicCount[t.topic] = (topicCount[t.topic] || 0) + 1;
      if (!topicSent[t.topic]) topicSent[t.topic] = { positive: 0, neutral: 0, negative: 0 };
      topicSent[t.topic][t.sentiment]++;
    });
    const topics = Object.entries(topicCount)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => {
        const s = topicSent[label];
        const total = s.positive + s.neutral + s.negative || 1;
        const color = s.positive / total > 0.5 ? POS : s.negative / total > 0.4 ? NEG : NEU;
        return { label, value, color };
      });
    mount('chart-topics', chartBlock(
      hBars(topics, { height: 260 }),
      {
        label: 'Mentions by topic',
        columns: ['Topic', 'Mentions'],
        rows: topics.map(t => [t.label, formatWhole(t.value)]),
      }
    ));

    // Geography
    const cityCount = {};
    zynMentions.forEach(m => { if (m.city) cityCount[m.city] = (cityCount[m.city] || 0) + 1; });
    const cities = Object.entries(cityCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
    mount('chart-geo', chartBlock(
      hBars(cities, { height: 300, barColor: BRAND }),
      {
        label: 'Mentions by city',
        columns: ['City', 'Mentions'],
        rows: cities.map(c => [c.label, formatWhole(c.value)]),
      }
    ));

    // Weekly volume
    const weeklyVol = {};
    zynMentions.forEach(m => {
      const d = new Date(m.date);
      const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const key = ws.toISOString().slice(0, 10);
      weeklyVol[key] = (weeklyVol[key] || 0) + 1;
    });
    const weeks = Object.entries(weeklyVol).sort((a, b) => a[0].localeCompare(b[0]));
    const weekItems = weeks.map(([week, value]) => ({ label: formatWeek(week), value }));
    mount('chart-weekly', chartBlock(
      vBars(weekItems, { height: 250, labelEvery: 4, barColor: BRAND }),
      {
        label: 'Weekly mention volume',
        columns: ['Week', 'Mentions'],
        rows: weekItems.map(w => [w.label, formatWhole(w.value)]),
      }
    ));

    // Sentiment by platform
    const platSent = {};
    zynMentions.forEach(m => {
      if (!platSent[m.platform]) platSent[m.platform] = { positive: 0, neutral: 0, negative: 0 };
      const t = tagMap[m.mention_id];
      if (t) platSent[m.platform][t.sentiment]++;
    });
    const platforms = Object.keys(platSent).sort((a, b) => {
      const total = p => platSent[p].positive + platSent[p].neutral + platSent[p].negative;
      return total(b) - total(a);
    });
    const platGroups = platforms.map(label => ({
      label,
      segments: [
        { label: 'Positive', value: platSent[label].positive, color: POS },
        { label: 'Neutral', value: platSent[label].neutral, color: NEU },
        { label: 'Negative', value: platSent[label].negative, color: NEG },
      ],
    }));
    mount('chart-plat-sent', chartBlock(
      stackedBars(platGroups, { height: 250 }),
      {
        label: 'Sentiment split by platform',
        columns: ['Platform', 'Positive', 'Neutral', 'Negative'],
        rows: platforms.map(p => [p, formatWhole(platSent[p].positive), formatWhole(platSent[p].neutral), formatWhole(platSent[p].negative)]),
      }
    ));

    // Share of voice over time
    const weekly = (list) => {
      const out = {};
      list.forEach(m => {
        const d = new Date(m.date);
        const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
        const key = ws.toISOString().slice(0, 10);
        out[key] = (out[key] || 0) + 1;
      });
      return out;
    };
    const zynWeekly = weekly(zynMentions);
    const ploomWeekly = weekly(mentions.filter(m => m.brand === 'Ploom'));
    const allWeeks = [...new Set([...Object.keys(zynWeekly), ...Object.keys(ploomWeekly)])].sort();
    const sovLabels = allWeeks.map(w => formatWeek(w));
    const sovSeries = [
      { label: 'ZYN', values: allWeeks.map(w => zynWeekly[w] || 0), color: BRAND },
      { label: 'Ploom', values: allWeeks.map(w => ploomWeekly[w] || 0), color: BRAND2 },
    ];
    mount('chart-sov', chartBlock(
      lines(sovLabels, sovSeries, { height: 250, labelEvery: 6 }),
      {
        label: 'Weekly share of voice: ZYN vs Ploom',
        columns: ['Week', 'ZYN', 'Ploom'],
        rows: allWeeks.map((w, i) => [sovLabels[i], formatWhole(zynWeekly[w] || 0), formatWhole(ploomWeekly[w] || 0)]),
      }
    ));
  }

}
