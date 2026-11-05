import { getReport, getClients, getReportData, getAIStatus, updateReport, getQuality, getAudit, runAITags, runAISummaries, runAINarratives } from '../lib/api.js';
import { icon } from '../lib/icons.js';
import { card, button, toggle, statusBadge, sampleBadge, tabs, progressBar } from '../components/ui.js';
import { formatDate, formatDateRange } from '../lib/format.js';

export async function renderWorkspaceReport(main, reportId) {
  main.innerHTML = `<div class="max-w-4xl mx-auto px-4 sm:px-6 py-8"><p class="animate-pulse text-ink-faint">Loading…</p></div>`;

  const [report, clients, aiStatus] = await Promise.all([
    getReport(reportId), getClients(), getAIStatus()
  ]);
  const client = clients.find(c => c.slug === report.client);
  let activeTab = 'overview';

  function render() {
    main.innerHTML = `
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <a href="#/workspace" class="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-primary transition-colors mb-4">${icon.chevronRight} Workspace</a>
        <div class="flex items-start justify-between gap-4 mb-6">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span aria-hidden="true" class="h-5 w-1 rounded-full bg-linear-to-b from-brand-primary to-accent-violet"></span>
              <h1 class="text-xl font-bold font-display text-ink">${report.title}</h1>
              ${statusBadge(report.status)}
              ${report.is_sample ? sampleBadge() : ''}
            </div>
            <p class="text-sm text-ink-muted mt-1">${client?.name || report.client} · ${formatDateRange(report.period_start, report.period_end)}</p>
          </div>
          <a href="#/report/${reportId}" class="flex-shrink-0">${button('View report', { variant: 'secondary', icon: icon.eye, size: 'sm' })}</a>
        </div>

        ${tabs([
          { id: 'overview', label: 'Overview' },
          { id: 'ai', label: 'AI' },
          { id: 'quality', label: 'Data Quality' },
          { id: 'audit', label: 'Audit Log' },
        ], activeTab)}

        <div id="tab-content"></div>
      </div>`;

    main.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); });
    });

    const content = document.getElementById('tab-content');
    if (activeTab === 'overview') renderOverview(content);
    else if (activeTab === 'ai') renderAI(content);
    else if (activeTab === 'quality') renderQuality(content);
    else if (activeTab === 'audit') renderAuditLog(content);
  }

  function renderOverview(el) {
    el.innerHTML = `
      <div class="space-y-4">
        ${card(`<div class="p-4 space-y-4">
          <h3 class="text-sm font-semibold text-ink">Report Settings</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><span class="text-ink-muted">Created:</span> <span class="text-ink">${formatDate(report.created?.slice(0,10))}</span></div>
            <div><span class="text-ink-muted">Updated:</span> <span class="text-ink">${formatDate(report.updated?.slice(0,10))}</span></div>
            <div><span class="text-ink-muted">Sample data:</span> <span class="text-ink">${report.is_sample ? 'Yes' : 'No'}</span></div>
            <div><span class="text-ink-muted">AI allowed:</span> <span class="text-ink">${report.ai_allowed ? 'Yes' : 'No'}</span></div>
          </div>
        </div>`)}

        ${card(`<div class="p-4 space-y-4">
          <h3 class="text-sm font-semibold text-ink">Status</h3>
          <div class="flex items-center gap-3">
            <span class="text-sm text-ink-muted">Current: ${statusBadge(report.status)}</span>
            <button id="toggle-status" class="text-sm text-brand-primary hover:underline">
              ${report.status === 'draft' ? 'Mark as ready' : 'Revert to draft'}
            </button>
          </div>
        </div>`)}

        ${!report.is_sample ? card(`<div class="p-4 space-y-3">
          <h3 class="text-sm font-semibold text-ink">AI Data Policy</h3>
          <div id="ai-toggle-area">
            ${toggle('ai-allowed', 'Allow AI on this report\'s data (free tier)', report.ai_allowed, {
              warning: !report.ai_allowed ? 'Google\'s free tier may use submitted content to improve its products. For production, switch to AI_PROVIDER=claude.' : ''
            })}
            ${report.ai_allowed && report.ai_allowed_at ? `<p class="text-xs text-ink-faint mt-2">Enabled on ${formatDate(report.ai_allowed_at.slice(0,10))}</p>` : ''}
          </div>
        </div>`) : ''}

        ${card(`<div class="p-4">
          <h3 class="text-sm font-semibold text-ink mb-3">Quick Links</h3>
          <div class="flex gap-3">
            <a href="#/report/${reportId}">${button('View report', { variant: 'secondary', icon: icon.eye, size: 'sm' })}</a>
            <a href="#/workspace/report/${reportId}/review">${button('Review summaries', { variant: 'secondary', icon: icon.sparkles, size: 'sm' })}</a>
          </div>
        </div>`)}
      </div>`;

    el.querySelector('#toggle-status')?.addEventListener('click', async () => {
      const newStatus = report.status === 'draft' ? 'ready' : 'draft';
      await updateReport(reportId, { status: newStatus });
      report.status = newStatus;
      render();
    });

    el.querySelector('#ai-allowed')?.addEventListener('change', async (e) => {
      const allowed = e.target.checked;
      await updateReport(reportId, { ai_allowed: allowed, ai_allowed_at: allowed ? new Date().toISOString() : null });
      report.ai_allowed = allowed;
      if (allowed) report.ai_allowed_at = new Date().toISOString();
      render();
    });
  }

  function renderAI(el) {
    const available = aiStatus.available;
    const canRun = available && (report.is_sample || report.ai_allowed);

    el.innerHTML = `
      <div class="space-y-4">
        ${card(`<div class="p-4 flex items-center gap-3">
          <span class="${available ? 'text-positive' : 'text-warning'}">${available ? icon.checkCircle : icon.alertTriangle}</span>
          <div>
            <p class="text-sm font-medium text-ink">${available ? `AI ready — ${aiStatus.provider} · ${aiStatus.model}` : aiStatus.message}</p>
            ${!report.is_sample && !report.ai_allowed ? '<p class="text-xs text-warning">AI is off for this report (real data, free-tier rule). Enable in Overview tab.</p>' : ''}
          </div>
        </div>`)}

        ${canRun ? `
          ${card(`<div class="p-4 space-y-4">
            <h3 class="text-sm font-semibold text-ink">Run AI</h3>
            <div class="flex flex-wrap gap-3">
              <button id="run-tags" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-linear-to-r from-brand-primary to-accent-violet text-white shadow-sm shadow-brand-primary/25 hover:brightness-105 transition-all">${icon.sparkles} Tag mentions</button>
              <button id="run-summaries" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-linear-to-r from-brand-primary to-accent-teal text-white shadow-sm shadow-brand-primary/25 hover:brightness-105 transition-all">${icon.sparkles} Generate summaries</button>
              <button id="run-narratives" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-linear-to-r from-accent-violet to-accent-pink text-white shadow-sm shadow-accent-violet/25 hover:brightness-105 transition-all">${icon.sparkles} Find narratives</button>
            </div>
            <div id="ai-progress" class="hidden"></div>
          </div>`)}
        ` : ''}

        ${card(`<div class="p-4">
          <a href="#/workspace/report/${reportId}/review" class="inline-flex items-center gap-2 text-sm text-brand-primary hover:underline">${icon.sparkles} Review AI summaries</a>
        </div>`)}
      </div>`;

    if (canRun) {
      const progress = el.querySelector('#ai-progress');

      el.querySelector('#run-tags')?.addEventListener('click', async () => {
        progress.classList.remove('hidden');
        progress.innerHTML = '<p class="text-sm text-ink-muted animate-pulse">Tagging mentions…</p>';
        try {
          await runAITags(reportId, (evt) => {
            progress.innerHTML = `<div class="space-y-2">
              <p class="text-sm text-ink">Tagging: ${evt.done}/${evt.total} batches</p>
              ${progressBar(evt.done, evt.total)}
            </div>`;
          });
          progress.innerHTML = `<p class="text-sm text-positive flex items-center gap-1">${icon.checkCircle} Tagging complete</p>`;
        } catch (err) {
          progress.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
        }
      });

      el.querySelector('#run-summaries')?.addEventListener('click', async () => {
        progress.classList.remove('hidden');
        progress.innerHTML = '<p class="text-sm text-ink-muted animate-pulse">Generating summaries…</p>';
        try {
          await runAISummaries(reportId, (evt) => {
            progress.innerHTML = `<div class="space-y-2">
              <p class="text-sm text-ink">Summaries: ${evt.done}/${evt.total}</p>
              ${progressBar(evt.done, evt.total)}
            </div>`;
          });
          progress.innerHTML = `<p class="text-sm text-positive flex items-center gap-1">${icon.checkCircle} Summaries generated</p>`;
        } catch (err) {
          progress.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
        }
      });

      el.querySelector('#run-narratives')?.addEventListener('click', async () => {
        progress.classList.remove('hidden');
        progress.innerHTML = '<p class="text-sm text-ink-muted animate-pulse">Finding narratives…</p>';
        try {
          await runAINarratives(reportId);
          progress.innerHTML = `<p class="text-sm text-positive flex items-center gap-1">${icon.checkCircle} Narratives found</p>`;
        } catch (err) {
          progress.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
        }
      });
    }
  }

  async function renderQuality(el) {
    el.innerHTML = '<p class="animate-pulse text-ink-faint text-sm">Loading…</p>';
    try {
      const issues = await getQuality(reportId);
      if (!issues || issues.length === 0) {
        el.innerHTML = card(`<div class="p-6 text-center"><span class="text-positive">${icon.checkCircle}</span><p class="text-sm text-ink-muted mt-2">No data quality issues</p></div>`);
        return;
      }
      el.innerHTML = `<div class="space-y-3">${issues.map(issue => {
        const sev = { error: 'text-negative bg-negative/10', warning: 'text-warning bg-warning/10', info: 'text-info bg-info/10' };
        const sevIcon = { error: icon.alertTriangle, warning: icon.alertTriangle, info: icon.info };
        return card(`<div class="p-4">
          <div class="flex items-start gap-3">
            <span class="flex-shrink-0 w-8 h-8 rounded-lg ${sev[issue.severity] || sev.info} flex items-center justify-center">${sevIcon[issue.severity] || sevIcon.info}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-alt text-ink-muted">${issue.type}</span>
                <span class="text-xs text-ink-faint">${issue.severity}</span>
              </div>
              <p class="text-sm text-ink mt-1">${issue.message}</p>
              ${(issue.affected_rows || issue.affected_posts)?.length ? `<p class="text-xs text-ink-faint mt-1">Affected: ${(issue.affected_rows || issue.affected_posts).join(', ')}</p>` : ''}
            </div>
          </div>
        </div>`);
      }).join('')}</div>`;
    } catch (err) {
      el.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
    }
  }

  async function renderAuditLog(el) {
    el.innerHTML = '<p class="animate-pulse text-ink-faint text-sm">Loading…</p>';
    try {
      const log = await getAudit(reportId);
      if (!log || log.length === 0) {
        el.innerHTML = card(`<div class="p-6 text-center"><p class="text-sm text-ink-muted">No audit entries</p></div>`);
        return;
      }
      el.innerHTML = card(`<div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="bg-surface-alt border-b border-border">
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Time</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Action</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Target</th>
            <th class="px-3 py-2 text-left text-xs font-semibold text-ink-muted">Details</th>
          </tr></thead>
          <tbody class="divide-y divide-border">
            ${log.map(e => `<tr class="hover:bg-surface-alt/50">
              <td class="px-3 py-2 text-ink-muted whitespace-nowrap">${formatDate((e.timestamp || e.ts || '').slice(0,10))}</td>
              <td class="px-3 py-2"><span class="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-alt">${e.action}</span></td>
              <td class="px-3 py-2 text-ink">${e.target || e.source || '—'}</td>
              <td class="px-3 py-2 text-ink-muted">${e.details || (e.rows != null ? e.rows + ' rows' : e.affected_rows != null ? e.affected_rows + ' affected rows' : '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`);
    } catch (err) {
      el.innerHTML = `<p class="text-sm text-negative">${err.message}</p>`;
    }
  }

  render();
}
