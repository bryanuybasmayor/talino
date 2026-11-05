/**
 * Home page — list of reports per client.
 */

import { getClients, getReports } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { statusBadge, card, button, emptyState } from '../components/ui.js';
import { formatDateRange } from '../lib/format.js';
import { assetUrl } from '../lib/asset.js';

// Colour rails cycled across report rows so the list reads as a set, not a wall of grey.
const ACCENTS = [
  'from-brand-primary to-accent-teal',
  'from-accent-violet to-accent-pink',
  'from-accent-amber to-brand-secondary',
  'from-accent-sky to-accent-violet',
  'from-accent-teal to-accent-sky',
];

export async function renderHome(main) {
  main.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <section class="panel-hero relative overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 sm:p-8 mb-8 shadow-[0_24px_60px_-48px_rgba(20,19,31,0.6)]">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20">
              <span class="w-1.5 h-1.5 rounded-full bg-brand-primary"></span> Client insights
            </span>
            <h1 class="mt-3 text-3xl font-bold font-display text-ink">Reports</h1>
            <p class="text-sm text-ink-muted mt-1">Every campaign and listening report, in one place.</p>
          </div>
          <a href="#/workspace/import" class="no-print">
            ${button('New report', { icon: icon.upload, variant: 'primary' })}
          </a>
        </div>
        <div id="home-stats" class="mt-6 flex flex-wrap gap-2"></div>
      </section>

      <div id="reports-list" class="space-y-3">
        <div class="flex items-center justify-center py-12">
          <div class="h-8 w-8 rounded-full border-2 border-brand-primary/30 border-t-brand-primary animate-spin"></div>
        </div>
      </div>
    </div>`;

  try {
    const [clients, reports] = await Promise.all([getClients(), getReports()]);
    const clientMap = Object.fromEntries(clients.map(c => [c.slug, c]));
    const list = document.getElementById('reports-list');

    // Headline chips
    const readyCount = reports.filter(r => r.status === 'ready').length;
    const statsEl = document.getElementById('home-stats');
    if (statsEl) {
      const chips = [
        { label: 'Reports', value: reports.length, classes: 'bg-brand-primary/10 text-brand-primary ring-brand-primary/20' },
        { label: 'Clients', value: clients.length, classes: 'bg-accent-violet/10 text-accent-violet ring-accent-violet/20' },
        { label: 'Ready', value: readyCount, classes: 'bg-positive/10 text-positive ring-positive/20' },
      ];
      statsEl.innerHTML = chips.map(c => `
        <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium ring-1 ${c.classes}">
          <span class="font-display text-sm font-bold text-ink">${c.value}</span>${c.label}
        </span>`).join('');
    }

    if (reports.length === 0) {
      list.innerHTML = card(emptyState('No reports yet', {
        action: `<a href="#/workspace/import">${button('Import data', { icon: icon.upload })}</a>`,
      }), { class: 'p-4' });
      return;
    }

    // Group by client
    const grouped = {};
    for (const r of reports) {
      const key = r.client || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    let accentIndex = 0;

    list.innerHTML = Object.entries(grouped).map(([clientSlug, clientReports]) => {
      const client = clientMap[clientSlug];
      const clientName = client?.name || clientSlug;
      const logo = client?.logo;

      return `
        <div class="section-enter">
          <div class="flex items-center gap-3 mb-3">
            ${logo
              ? `<img src="${assetUrl(logo)}" alt="${clientName}" class="w-8 h-8 rounded-lg ring-1 ring-border bg-surface-raised p-0.5" />`
              : `<span class="grid place-items-center w-8 h-8 rounded-lg bg-linear-to-br from-brand-primary/20 to-accent-violet/15 text-brand-primary ring-1 ring-brand-primary/20 font-display text-sm font-bold">${clientName.slice(0, 1)}</span>`}
            <h2 class="text-lg font-semibold font-display text-ink">${clientName}</h2>
            <span class="h-px flex-1 bg-linear-to-r from-border-strong/60 to-transparent"></span>
            <span class="text-xs text-ink-faint tabular-nums">${clientReports.length}</span>
          </div>
          <div class="space-y-2">
            ${clientReports.map(r => {
              const accent = ACCENTS[accentIndex++ % ACCENTS.length];
              return card(`
                <a href="#/report/${r.id}" class="group relative flex items-start justify-between gap-3 p-4 pl-5 rounded-2xl transition-colors hover:bg-surface-alt/40">
                  <span aria-hidden="true" class="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-linear-to-b ${accent}"></span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-medium text-ink group-hover:text-brand-primary transition-colors">${r.title}</h3>
                      ${statusBadge(r.status)}
                      ${r.is_sample ? '<span class="text-xs text-info font-medium px-1.5 py-0.5 rounded bg-info/10">Sample</span>' : ''}
                    </div>
                    <p class="text-sm text-ink-muted mt-1">${formatDateRange(r.period_start, r.period_end)}</p>
                  </div>
                  <span class="flex-shrink-0 grid place-items-center w-8 h-8 rounded-full bg-surface-alt text-ink-faint transition-all group-hover:bg-linear-to-br group-hover:from-brand-primary group-hover:to-accent-violet group-hover:text-white [&_svg]:w-4 [&_svg]:h-4">${icon.chevronRight}</span>
                </a>
              `);
            }).join('')}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('reports-list').innerHTML = `
      <div class="text-center py-8 rounded-2xl border border-negative/25 bg-negative/5">
        <p class="text-negative text-sm">${err.message}</p>
        <p class="text-ink-muted text-xs mt-1">Make sure the server is running (npm run demo)</p>
      </div>`;
  }
}
