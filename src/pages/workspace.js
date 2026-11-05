/**
 * Workspace home — list reports with workspace actions.
 */

import { getClients, getReports, getAIStatus } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { statusBadge, card, button } from '../components/ui.js';
import { formatDateRange } from '../lib/format.js';

const ACCENTS = [
  'from-brand-primary to-accent-teal',
  'from-accent-violet to-accent-pink',
  'from-accent-amber to-brand-secondary',
  'from-accent-sky to-accent-violet',
  'from-accent-teal to-accent-sky',
];

export async function renderWorkspace(main) {
  main.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <section class="panel-hero relative overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 sm:p-8 mb-6 shadow-[0_24px_60px_-48px_rgba(20,19,31,0.6)]">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-accent-violet/10 text-accent-violet ring-1 ring-accent-violet/20">
              <span class="w-1.5 h-1.5 rounded-full bg-accent-violet"></span> Studio
            </span>
            <h1 class="mt-3 text-3xl font-bold font-display text-ink">Workspace</h1>
            <p class="text-sm text-ink-muted mt-1">Import data, run AI, review summaries.</p>
          </div>
          <a href="#/workspace/import">
            ${button('New report', { icon: icon.upload, variant: 'primary' })}
          </a>
        </div>
      </section>

      <div id="ai-status" class="mb-6"></div>
      <div id="workspace-reports" class="space-y-2">
        <div class="flex items-center justify-center py-12">
          <div class="h-8 w-8 rounded-full border-2 border-accent-violet/30 border-t-accent-violet animate-spin"></div>
        </div>
      </div>
    </div>`;

  try {
    const [clients, reports, aiStatus] = await Promise.all([
      getClients(), getReports(), getAIStatus()
    ]);
    const clientMap = Object.fromEntries(clients.map(c => [c.slug, c]));

    // AI status banner
    const aiEl = document.getElementById('ai-status');
    aiEl.innerHTML = aiStatus.available
      ? card(`
        <div class="p-3.5 flex items-center gap-3">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-positive/15 text-positive ring-1 ring-positive/25">${icon.checkCircle}</span>
          <div>
            <p class="text-sm font-medium text-ink">AI ready</p>
            <p class="text-xs text-ink-muted">${aiStatus.provider} · ${aiStatus.model}</p>
          </div>
          <span class="ml-auto h-2 w-2 rounded-full bg-positive shadow-[0_0_0_4px] shadow-positive/15"></span>
        </div>
      `, { tone: 'teal', class: 'bg-linear-to-r from-positive/10 via-surface-raised to-surface-raised border-positive/25' })
      : card(`
        <div class="p-3.5 flex items-center gap-3">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-warning/15 text-warning ring-1 ring-warning/25">${icon.alertTriangle}</span>
          <div>
            <p class="text-sm font-medium text-ink">${aiStatus.message}</p>
            <p class="text-xs text-ink-muted">AI features will be disabled</p>
          </div>
        </div>
      `, { tone: 'amber', class: 'bg-linear-to-r from-warning/10 via-surface-raised to-surface-raised border-warning/25' });

    // Reports list
    const list = document.getElementById('workspace-reports');
    if (reports.length === 0) {
      list.innerHTML = card(`
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <span class="mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-linear-to-br from-brand-primary/15 to-accent-violet/10 text-brand-primary ring-1 ring-brand-primary/20 [&_svg]:w-6 [&_svg]:h-6">${icon.fileText}</span>
          <p class="text-sm text-ink-muted mb-4">No reports yet</p>
          <a href="#/workspace/import">${button('Import data', { icon: icon.upload })}</a>
        </div>`, { class: 'p-4' });
      return;
    }

    list.innerHTML = reports.map((r, i) => {
      const client = clientMap[r.client];
      const accent = ACCENTS[i % ACCENTS.length];
      return card(`
        <div class="relative p-4 pl-5">
          <span aria-hidden="true" class="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-linear-to-b ${accent}"></span>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-medium text-ink">${r.title}</h3>
                ${statusBadge(r.status)}
                ${r.is_sample ? '<span class="text-xs text-info font-medium px-1.5 py-0.5 rounded bg-info/10">Sample</span>' : ''}
              </div>
              <p class="text-sm text-ink-muted mt-1">${client?.name || r.client} · ${formatDateRange(r.period_start, r.period_end)}</p>
              ${!r.is_sample && !r.ai_allowed ? '<p class="text-xs text-warning mt-1">AI off — real data, free-tier rule</p>' : ''}
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <a href="#/workspace/report/${r.id}" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-alt text-ink border border-border hover:border-accent-violet/40 hover:bg-accent-violet/10 transition-colors">
                ${icon.settings} Manage
              </a>
              <a href="#/report/${r.id}" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-linear-to-r from-brand-primary/15 to-accent-violet/15 text-brand-primary ring-1 ring-brand-primary/20 hover:from-brand-primary/25 hover:to-accent-violet/25 transition-colors">
                ${icon.eye} View
              </a>
            </div>
          </div>
        </div>
      `);
    }).join('');
  } catch (err) {
    document.getElementById('workspace-reports').innerHTML = `
      <div class="text-center py-8 rounded-2xl border border-negative/25 bg-negative/5">
        <p class="text-negative text-sm">${err.message}</p>
      </div>`;
  }
}
