/**
 * Reusable UI component functions — return HTML strings with Tailwind classes.
 */

import { icon } from '../lib/icons.js';
import { formatDate } from '../lib/format.js';

/**
 * Colour tones. Class strings are written out in full so Tailwind can find
 * them at build time — never build these names dynamically.
 */
const TONES = {
  cyan: {
    bar: 'from-brand-primary to-brand-secondary',
    chip: 'from-brand-primary/25 to-brand-primary/5 text-brand-primary border-brand-primary/30',
    dot: 'bg-brand-primary',
    glow: 'from-brand-primary/30 to-brand-primary/0',
  },
  violet: {
    bar: 'from-accent-violet to-accent-pink',
    chip: 'from-accent-violet/25 to-accent-pink/10 text-accent-violet border-accent-violet/30',
    dot: 'bg-accent-violet',
    glow: 'from-accent-violet/30 to-accent-violet/0',
  },
  pink: {
    bar: 'from-accent-pink to-accent-amber',
    chip: 'from-accent-pink/25 to-accent-amber/10 text-accent-pink border-accent-pink/30',
    dot: 'bg-accent-pink',
    glow: 'from-accent-pink/30 to-accent-pink/0',
  },
  amber: {
    bar: 'from-accent-amber to-brand-secondary',
    chip: 'from-accent-amber/25 to-brand-secondary/10 text-accent-amber border-accent-amber/30',
    dot: 'bg-accent-amber',
    glow: 'from-accent-amber/30 to-accent-amber/0',
  },
  teal: {
    bar: 'from-accent-teal to-brand-primary',
    chip: 'from-accent-teal/25 to-brand-primary/10 text-accent-teal border-accent-teal/30',
    dot: 'bg-accent-teal',
    glow: 'from-accent-teal/30 to-accent-teal/0',
  },
  sky: {
    bar: 'from-accent-sky to-accent-violet',
    chip: 'from-accent-sky/25 to-accent-violet/10 text-accent-sky border-accent-sky/30',
    dot: 'bg-accent-sky',
    glow: 'from-accent-sky/30 to-accent-sky/0',
  },
};

const TONE_KEYS = ['cyan', 'violet', 'pink', 'amber', 'teal', 'sky'];

/** Stable tone per label, so a metric keeps its colour between renders. */
function toneFor(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 100003;
  return TONES[TONE_KEYS[hash % TONE_KEYS.length]];
}

function tone(value, seed) {
  if (value && TONES[value]) return TONES[value];
  return seed != null ? toneFor(seed) : TONES.cyan;
}

/** Card wrapper */
export function card(content, opts = {}) {
  const cls = opts.class || '';
  const id = opts.id ? `id="${opts.id}"` : '';
  const accent = opts.tone
    ? `<span aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] rounded-t-2xl bg-linear-to-r ${tone(opts.tone).bar}"></span>`
    : '';
  return `<div ${id} class="card relative bg-surface-raised border border-border rounded-2xl shadow-[0_1px_2px_rgba(20,19,31,0.04),0_18px_40px_-32px_rgba(20,19,31,0.45)] ${cls}">${accent}${content}</div>`;
}

/** Section header with number, title, subtitle, and optional badge */
export function sectionHeader(number, title, subtitle, opts = {}) {
  const badge = opts.badge ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-warning/10 text-warning border border-warning/20">${icon.info} ${opts.badge}</span>` : '';
  const anchor = opts.anchor ? `id="${opts.anchor}"` : '';
  const t = tone(opts.tone, number);
  return `
    <div ${anchor} class="flex items-start gap-3 mb-4 scroll-mt-20">
      <span class="flex-shrink-0 w-9 h-9 rounded-xl border bg-linear-to-br ${t.chip} flex items-center justify-center text-sm font-bold font-display shadow-sm">${String(number).padStart(2, '0')}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="text-lg font-semibold text-ink font-display">${title}</h3>
          ${badge}
        </div>
        ${subtitle ? `<p class="text-sm text-ink-muted mt-0.5">${subtitle}</p>` : ''}
      </div>
    </div>`;
}

/** KPI tile */
export function kpiTile(label, value, delta, opts = {}) {
  const t = tone(opts.tone, label);
  const up = delta > 0;
  const deltaColor = up ? 'text-positive bg-positive/10' : delta < 0 ? 'text-negative bg-negative/10' : 'text-ink-muted bg-surface-alt';
  const deltaIcon = up ? icon.trendingUp : delta < 0 ? icon.trendingDown : '';
  const deltaStr = delta != null ? `
    <div class="flex items-center gap-1.5 mt-2">
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold ${deltaColor}">
        ${deltaIcon ? `<span class="w-3.5 h-3.5 [&_svg]:w-full [&_svg]:h-full">${deltaIcon}</span>` : ''}
        ${delta > 0 ? '+' : ''}${typeof delta === 'number' ? delta.toFixed(1) + '%' : delta}
      </span>
      ${opts.deltaLabel ? `<span class="text-xs text-ink-faint">${opts.deltaLabel}</span>` : ''}
    </div>` : '';

  return `
    <div class="group relative overflow-hidden p-4 bg-surface-raised border border-border rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5" data-metric>
      <span aria-hidden="true" class="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r ${t.bar}"></span>
      <span aria-hidden="true" class="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full bg-linear-to-br ${t.glow} blur-2xl opacity-70 transition-opacity duration-300 group-hover:opacity-100"></span>
      <div class="relative">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full ${t.dot}"></span>
          <p class="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">${label}</p>
        </div>
        <p class="text-2xl font-bold font-display text-ink mt-1.5 kpi-value">${value}</p>
        ${deltaStr}
      </div>
    </div>`;
}

/** AI read box — shows approved summary or pending state */
export function aiReadBox(summary, opts = {}) {
  if (!summary || (!summary.final && !summary.draft)) {
    return `
      <div class="mt-4 p-4 rounded-xl border border-dashed border-border bg-surface-alt/40">
        <div class="flex items-center gap-2 text-ink-faint">
          <span class="grid place-items-center w-5 h-5 rounded-md bg-surface-alt text-ink-faint [&_svg]:w-3.5 [&_svg]:h-3.5">${icon.sparkles}</span>
          <span class="text-sm">Summary pending</span>
        </div>
      </div>`;
  }

  const text = summary.final || summary.draft;
  const isApproved = !!summary.final;
  const reviewer = summary.approved_by || 'Pending review';
  const date = summary.approved_at ? formatDate(summary.approved_at.slice(0, 10)) : '';

  return `
    <div class="mt-4 p-4 rounded-xl border border-brand-primary/25 bg-linear-to-br from-brand-primary/10 via-accent-violet/5 to-transparent">
      <div class="flex items-start gap-2.5">
        <span class="flex-shrink-0 grid place-items-center w-5 h-5 rounded-md bg-linear-to-br from-brand-primary to-accent-violet text-white shadow-sm [&_svg]:w-3 [&_svg]:h-3">${icon.sparkles}</span>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-brand-primary mb-1">AI Read</p>
          <p class="text-sm text-ink leading-relaxed">${text}</p>
          <p class="text-xs text-ink-faint mt-2 flex items-center gap-1">
            ${isApproved ? `<span class="text-positive inline-flex [&_svg]:w-3.5 [&_svg]:h-3.5">${icon.checkCircle}</span> Reviewed by ${reviewer}` : `<span class="text-warning inline-flex [&_svg]:w-3.5 [&_svg]:h-3.5">${icon.info}</span> Draft — pending review`}
            ${date ? `<span>· ${date}</span>` : ''}
          </p>
        </div>
      </div>
    </div>`;
}

/** Sample data badge */
export function sampleBadge() {
  return `<span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-linear-to-r from-info/15 to-accent-violet/15 text-info border border-info/25">${icon.info} Sample data — preview of Meltwater integration</span>`;
}

/** Status badge */
export function statusBadge(status) {
  const styles = {
    draft: 'bg-warning/10 text-warning border-warning/25',
    ready: 'bg-positive/10 text-positive border-positive/25',
  };
  const dot = {
    draft: 'bg-warning',
    ready: 'bg-positive',
  };
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.draft}"><span class="w-1.5 h-1.5 rounded-full ${dot[status] || dot.draft}"></span>${status}</span>`;
}

/** Narrative status tag */
export function narrativeTag(status) {
  const styles = {
    'ANCHOR': 'bg-positive/10 text-positive border-positive/25',
    'ESCALATING': 'bg-warning/10 text-warning border-warning/25',
    'STEADY': 'bg-info/10 text-info border-info/25',
    'RED FLAG': 'bg-negative/10 text-negative border-negative/25',
  };
  return `<span class="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md border ${styles[status] || 'border-border text-ink-muted'}">${status}</span>`;
}

/** Sentiment bar (horizontal stacked) */
export function sentimentBar(positive, neutral, negative) {
  const total = positive + neutral + negative;
  if (total === 0) return '<div class="h-3 bg-surface-alt rounded-full"></div>';
  const pPct = (positive / total * 100).toFixed(1);
  const nePct = (neutral / total * 100).toFixed(1);
  const ngPct = (negative / total * 100).toFixed(1);

  return `
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div class="w-full flex h-3 rounded-full overflow-hidden sm:flex-1 ring-1 ring-inset ring-black/5 dark:ring-white/10">
        <div class="bg-linear-to-r from-positive to-emerald-400" style="width:${pPct}%" title="Positive ${pPct}%"></div>
        <div class="bg-neutral-sent/70" style="width:${nePct}%" title="Neutral ${nePct}%"></div>
        <div class="bg-linear-to-r from-negative to-rose-400" style="width:${ngPct}%" title="Negative ${ngPct}%"></div>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-positive"></span>${pPct}%</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-neutral-sent"></span>${nePct}%</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-negative"></span>${ngPct}%</span>
      </div>
    </div>`;
}

/** Toggle switch */
export function toggle(id, label, checked = false, opts = {}) {
  const warning = opts.warning ? `<p class="text-xs text-warning mt-1">${opts.warning}</p>` : '';
  return `
    <label for="${id}" class="flex items-start gap-3 cursor-pointer">
      <div class="relative flex-shrink-0 mt-0.5">
        <input type="checkbox" id="${id}" class="sr-only peer" ${checked ? 'checked' : ''}>
        <div class="w-9 h-5 bg-border-strong rounded-full transition-colors peer-checked:bg-brand-primary"></div>
        <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
      </div>
      <div>
        <span class="text-sm font-medium text-ink">${label}</span>
        ${warning}
      </div>
    </label>`;
}

/** Button */
export function button(label, opts = {}) {
  const variant = opts.variant || 'primary';
  const size = opts.size || 'md';
  const disabled = opts.disabled ? 'disabled' : '';
  const iconHtml = opts.icon ? `<span class="w-4 h-4 shrink-0 [&_svg]:w-full [&_svg]:h-full">${opts.icon}</span>` : '';
  const id = opts.id ? `id="${opts.id}"` : '';

  const variants = {
    primary: 'bg-linear-to-r from-brand-primary to-brand-secondary text-white shadow-sm shadow-brand-primary/30 hover:brightness-105 hover:shadow-md hover:shadow-brand-primary/30 disabled:opacity-50',
    secondary: 'bg-surface-raised text-ink border border-border-strong/70 hover:bg-surface-alt hover:border-brand-primary/40 disabled:opacity-50',
    danger: 'bg-negative text-white shadow-sm shadow-negative/25 hover:brightness-105 disabled:opacity-50',
    ghost: 'text-ink-muted hover:text-ink hover:bg-surface-alt disabled:opacity-50',
  };

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  };

  return `<button ${id} class="inline-flex items-center gap-2 font-medium rounded-lg transition-all ${variants[variant]} ${sizes[size]} ${opts.class || ''}" ${disabled}>${iconHtml}${label}</button>`;
}

/** Tabs */
export function tabs(items, activeId) {
  return `
    <div class="flex gap-1 mb-4 overflow-x-auto scrollbar-thin" role="tablist">
      ${items.map(item => `
        <button role="tab" data-tab="${item.id}" aria-selected="${item.id === activeId}"
          class="relative px-4 py-2 text-sm font-medium transition-colors rounded-t-lg border-b-2 ${
            item.id === activeId
              ? 'border-brand-primary text-brand-primary bg-linear-to-b from-brand-primary/10 to-transparent'
              : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface-alt/60'
          }">${item.label}</button>
      `).join('')}
    </div>`;
}

/** Empty state */
export function emptyState(message, opts = {}) {
  const iconHtml = opts.icon || icon.fileText;
  return `
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <span class="mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-linear-to-br from-brand-primary/15 to-accent-violet/10 text-brand-primary ring-1 ring-brand-primary/20 [&_svg]:w-6 [&_svg]:h-6">${iconHtml}</span>
      <p class="text-sm text-ink-muted">${message}</p>
      ${opts.action ? `<div class="mt-4">${opts.action}</div>` : ''}
    </div>`;
}

/** Data table with sticky first column */
export function dataTable(headers, rows, opts = {}) {
  const sortable = opts.sortable ? 'data-sortable' : '';
  return `
    <div class="overflow-x-auto scrollbar-thin rounded-xl border border-border">
      <table class="w-full text-sm" ${sortable}>
        <thead>
          <tr class="bg-linear-to-r from-surface-alt to-surface-alt/40 border-b border-border">
            ${headers.map((h, i) => `
              <th class="px-3 py-2.5 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide whitespace-nowrap ${i === 0 ? 'sticky left-0 bg-surface-alt z-10' : ''}" ${h.sort ? `data-sort="${h.sort}"` : ''}>${h.label || h}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          ${rows.map(row => `
            <tr class="hover:bg-brand-primary/5 transition-colors">
              ${row.map((cell, i) => `
                <td class="px-3 py-2.5 ${i === 0 ? 'sticky left-0 bg-surface-raised z-10 font-medium' : ''} ${typeof cell === 'number' ? 'text-right tabular-nums' : ''}">${cell}</td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

/** Progress bar */
export function progressBar(value, max, opts = {}) {
  const pct = max > 0 ? (value / max * 100) : 0;
  const color = opts.color || 'bg-linear-to-r from-brand-primary to-accent-violet';
  return `
    <div class="w-full bg-surface-alt rounded-full h-2 overflow-hidden ring-1 ring-inset ring-black/5 dark:ring-white/10">
      <div class="${color} h-full rounded-full transition-all duration-300" style="width:${pct}%"></div>
    </div>`;
}
