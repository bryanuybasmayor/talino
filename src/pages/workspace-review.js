import { getReport, getReportData, updateSummary, runAISummaries } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { card, button } from '../components/ui.js';
import { formatDate } from '../lib/format.js';

const LISTENING_SECTIONS = [
  'headline_strip', 'brand_sentiment', 'trending_issues', 'geographic',
  'conversation_volume', 'platform_sentiment', 'narrative_map', 'top_voices',
  'language_sentiment', 'keywords', 'viral_posts', 'share_of_voice'
];
const CAMPAIGN_SECTIONS = [
  'overview', 'performance_over_time', 'campaigns', 'lanu_leaderboard',
  'format_mix', 'top_posts', 'competitor_watch', 'data_quality'
];

const SECTION_LABELS = {
  lanu_leaderboard: 'LANU Leaderboard',
  performance_over_time: 'Performance Over Time',
  share_of_voice: 'Share of Voice vs Ploom',
  headline_strip: 'Headline Strip',
  brand_sentiment: 'Brand Sentiment',
  trending_issues: 'Top Trending Issues',
  geographic: 'Geographic Distribution',
  conversation_volume: 'Conversation Volume',
  platform_sentiment: 'Platform Sentiment',
  language_sentiment: 'Language Sentiment',
  top_voices: 'Top Voices',
  viral_posts: 'Viral Posts',
  narrative_map: 'Narrative Map',
  data_quality: 'Data Quality',
};

function sectionLabel(key) {
  return SECTION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function renderReview(main, reportId) {
  main.innerHTML = `<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8"><p class="animate-pulse text-ink-faint">Loading…</p></div>`;

  const report = await getReport(reportId);
  const summaries = await getReportData(reportId, 'ai_summaries').catch(() => null);
  const tags = await getReportData(reportId, 'ai_tags').catch(() => null);
  const mentions = await getReportData(reportId, 'mentions').catch(() => []);

  const sections = summaries?.sections || {};
  const sectionKeys = mentions.length > 0 ? LISTENING_SECTIONS : CAMPAIGN_SECTIONS;
  const tagList = tags?.tags || [];

  // Tagging stats
  const sentCounts = { positive: 0, neutral: 0, negative: 0 };
  const confCounts = { high: 0, medium: 0, low: 0 };
  for (const t of tagList) {
    sentCounts[t.sentiment] = (sentCounts[t.sentiment] || 0) + 1;
    confCounts[t.confidence] = (confCounts[t.confidence] || 0) + 1;
  }

  // Random 20 tagged rows for spot-check
  const mentionMap = Object.fromEntries(mentions.map(m => [m.mention_id, m]));
  const sampleTags = [...tagList].sort(() => 0.5 - Math.random()).slice(0, 20);

  main.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <a href="#/workspace/report/${reportId}" class="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors mb-4">${icon.chevronRight} Back to report</a>
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex items-center gap-3">
          <span aria-hidden="true" class="h-6 w-1 rounded-full bg-linear-to-b from-accent-violet to-accent-pink"></span>
          <h1 class="text-xl font-bold font-display text-ink">Review AI Summaries</h1>
        </div>
        <button id="regen-all" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-linear-to-r from-accent-violet to-accent-pink text-white shadow-sm shadow-accent-violet/25 hover:brightness-105 transition-all">${icon.refresh} Regenerate all</button>
      </div>
      <div id="regen-progress" class="hidden mb-4"></div>

      ${tagList.length > 0 ? card(`<div class="p-4 mb-6">
        <h3 class="text-sm font-semibold text-ink mb-3">Tagging Stats</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
          <div><span class="text-ink-muted">Total tagged:</span> <span class="font-medium text-ink">${tagList.length}</span></div>
          <div><span class="text-positive">Positive:</span> <span class="font-medium">${sentCounts.positive}</span></div>
          <div><span class="text-ink-muted">Neutral:</span> <span class="font-medium">${sentCounts.neutral}</span></div>
          <div><span class="text-negative">Negative:</span> <span class="font-medium">${sentCounts.negative}</span></div>
        </div>
        <div class="grid grid-cols-3 gap-4 text-sm mb-4">
          <div><span class="text-ink-muted">High conf:</span> <span class="font-medium">${confCounts.high}</span></div>
          <div><span class="text-ink-muted">Medium:</span> <span class="font-medium">${confCounts.medium}</span></div>
          <div><span class="text-ink-muted">Low:</span> <span class="font-medium">${confCounts.low}</span></div>
        </div>
        <details class="mt-3">
          <summary class="text-sm text-brand-primary cursor-pointer hover:underline">Spot-check: 20 random tagged rows</summary>
          <div class="mt-3 overflow-x-auto scrollbar-thin">
            <table class="w-full text-xs">
              <thead><tr class="bg-surface-alt border-b border-border">
                <th class="px-2 py-1.5 text-left text-ink-muted">Text</th>
                <th class="px-2 py-1.5 text-left text-ink-muted">Sentiment</th>
                <th class="px-2 py-1.5 text-left text-ink-muted">Emotion</th>
                <th class="px-2 py-1.5 text-left text-ink-muted">Topic</th>
                <th class="px-2 py-1.5 text-left text-ink-muted">Conf</th>
              </tr></thead>
              <tbody class="divide-y divide-border">
                ${sampleTags.map(t => {
                  const m = mentionMap[t.mention_id];
                  const sentColor = t.sentiment === 'positive' ? 'text-positive' : t.sentiment === 'negative' ? 'text-negative' : 'text-ink-muted';
                  return `<tr>
                    <td class="px-2 py-1.5 max-w-[200px] truncate">${m?.text || t.mention_id}</td>
                    <td class="px-2 py-1.5 ${sentColor} font-medium">${t.sentiment}</td>
                    <td class="px-2 py-1.5">${t.emotion}</td>
                    <td class="px-2 py-1.5">${t.topic}</td>
                    <td class="px-2 py-1.5">${t.confidence}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </details>
      </div>`) : ''}

      <div class="space-y-6" id="sections-list">
        ${sectionKeys.map(key => {
          const s = sections[key];
          const draft = s?.draft || '';
          const final_ = s?.final || '';
          const isApproved = !!s?.final;
          return card(`<div class="p-4" data-section="${key}">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-ink">${sectionLabel(key)}</h3>
              ${isApproved ? `<span class="text-xs text-positive flex items-center gap-1">${icon.checkCircle} Approved${s.approved_by ? ` by ${s.approved_by}` : ''}${s.approved_at ? ` · ${formatDate(s.approved_at.slice(0,10))}` : ''}</span>` : '<span class="text-xs text-warning">Pending review</span>'}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p class="text-xs font-medium text-ink-muted mb-1">AI Draft</p>
                <div class="p-3 rounded-md bg-surface-alt text-sm text-ink leading-relaxed min-h-[80px]">${draft || '<span class="text-ink-faint">No draft generated</span>'}</div>
              </div>
              <div>
                <p class="text-xs font-medium text-ink-muted mb-1">Final Text</p>
                <textarea data-key="${key}" class="w-full p-3 rounded-md border border-border bg-surface text-sm text-ink leading-relaxed min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand-primary resize-y">${final_ || draft}</textarea>
              </div>
            </div>
            <div class="flex gap-2 mt-3">
              <button data-approve="${key}" ${(final_ || draft) ? '' : 'disabled'} class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${isApproved ? 'bg-surface-alt text-ink border border-border hover:bg-border/50' : 'bg-positive text-white hover:opacity-90'} disabled:opacity-40 disabled:cursor-not-allowed">${isApproved ? `${icon.checkCircle} Approved` : `${icon.check} Approve`}</button>
              <button data-regen="${key}" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface-alt text-ink border border-border hover:bg-border/50">${icon.refresh} Regenerate</button>
            </div>
          </div>`);
        }).join('')}
      </div>
    </div>`;

  // Regenerate handlers (regenerates every section, then reloads)
  async function regenerate() {
    const prog = main.querySelector('#regen-progress');
    prog.classList.remove('hidden');
    prog.innerHTML = '<p class="text-sm text-ink-muted">Regenerating summaries…</p>';
    try {
      await runAISummaries(reportId, (evt) => {
        prog.innerHTML = `<p class="text-sm text-ink">Summaries: ${evt.done}/${evt.total}</p>`;
      });
      await renderReview(main, reportId);
    } catch (err) {
      prog.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
    }
  }
  main.querySelector('#regen-all')?.addEventListener('click', regenerate);
  main.querySelectorAll('[data-regen]').forEach(btn => btn.addEventListener('click', regenerate));

  // Approve handlers
  main.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.approve;
      const textarea = main.querySelector(`textarea[data-key="${key}"]`);
      const text = textarea?.value?.trim();
      if (!text) return;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await updateSummary(reportId, key, { final: text, approved_by: 'Bryan' });
        const section = btn.closest('[data-section]');
        const statusEl = section.querySelector('.text-xs.text-warning, .text-xs.text-positive');
        if (statusEl) {
          statusEl.className = 'text-xs text-positive flex items-center gap-1';
          statusEl.innerHTML = `${icon.checkCircle} Approved by Bryan · ${formatDate(new Date().toISOString().slice(0,10))}`;
        }
        btn.innerHTML = `${icon.checkCircle} Approved`;
        btn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface-alt text-ink border border-border hover:bg-border/50';
      } catch (err) {
        btn.textContent = err.message;
        btn.disabled = false;
      }
    });
  });
}
