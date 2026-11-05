/**
 * Inline SVG charts.
 *
 * Chart.js canvases depend on animation frames and resize observers; in print,
 * screenshots, and background tabs those frames can be skipped and the chart is
 * left blank. These renderers produce plain SVG, so the result is always there,
 * always themed with CSS variables, and trivially accessible.
 */

const W = 800;

/** Categorical series colours — brand first, then the accent palette. */
export const PALETTE = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
];

let gradientSeq = 0;

function esc(value) {
  return String(value).replace(/[&<>"]/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

function fmt(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) >= 1000) {
    const n = value / 1000;
    return `${n.toFixed(n >= 10 ? 0 : 1)}k`;
  }
  return Number(value).toFixed(decimals);
}

function truncate(text, max = 22) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function gridLines(x1, x2, yTop, yBottom, ticks = 4) {
  return Array.from({ length: ticks + 1 }, (_, i) => {
    const y = yTop + ((yBottom - yTop) * i) / ticks;
    return `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="${i === ticks ? 0.28 : 0.12}" stroke-width="1" />`;
  }).join('');
}

function legend(series, x = 0, y = 8) {
  return `<g transform="translate(${x},${y})">${series.map((s, i) => {
    const offset = i * 96;
    return `<g transform="translate(${offset},0)">
      <rect width="8" height="8" rx="2" y="2" fill="${s.color}" />
      <text x="12" y="10" font-size="12" fill="currentColor" opacity="0.75">${esc(s.label)}</text>
    </g>`;
  }).join('')}</g>`;
}

/**
 * Horizontal bars — good for ranked categories with long labels.
 * @param {{label:string, value:number, color?:string}[]} items
 */
export function hBars(items, { height = 240, valueFormat = fmt, barColor = 'var(--color-brand-primary)' } = {}) {
  if (!items.length) return '<p class="text-sm text-ink-faint py-6 text-center">No data</p>';

  const labelWidth = Math.min(190, Math.max(96, ...items.map(d => String(d.label).length * 6.4)));
  const padRight = 58;
  const top = 6;
  const bottom = 6;
  const innerW = W - labelWidth - padRight;
  const rowH = (height - top - bottom) / items.length;
  const max = Math.max(1, ...items.map(d => d.value));

  const rows = items.map((d, i) => {
    const y = top + i * rowH;
    const barH = Math.max(10, Math.min(26, rowH * 0.56));
    const width = Math.max(2, (d.value / max) * innerW);
    return `<g>
      <title>${esc(d.label)}: ${esc(valueFormat(d.value))}</title>
      <text x="${labelWidth - 10}" y="${y + rowH / 2 + 3.5}" text-anchor="end" font-size="12" fill="currentColor" opacity="0.78">${esc(truncate(d.label))}</text>
      <rect x="${labelWidth}" y="${y + (rowH - barH) / 2}" width="${innerW}" height="${barH}" rx="3" fill="currentColor" opacity="0.05" />
      <rect x="${labelWidth}" y="${y + (rowH - barH) / 2}" width="${width}" height="${barH}" rx="3" fill="${d.color || barColor}" />
      <text x="${labelWidth + width + 8}" y="${y + rowH / 2 + 3.5}" font-size="12" fill="currentColor" opacity="0.65">${esc(valueFormat(d.value))}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${height}" class="w-full h-auto block" preserveAspectRatio="xMidYMid meet" role="img">
    ${gridLines(labelWidth, W - padRight, top, height - bottom)}
    ${rows}
  </svg>`;
}

/**
 * Vertical bars — good for time series and mixes.
 * @param {{label:string, value:number, color?:string}[]} items
 */
export function vBars(items, { height = 240, labelEvery = 1, valueFormat = fmt, barColor = 'var(--color-brand-primary)' } = {}) {
  if (!items.length) return '<p class="text-sm text-ink-faint py-6 text-center">No data</p>';

  const left = 44;
  const right = 10;
  const top = 12;
  const bottom = 34;
  const innerW = W - left - right;
  const innerH = height - top - bottom;
  const max = Math.max(1, ...items.map(d => d.value));
  const slot = innerW / items.length;
  const barW = Math.max(4, Math.min(34, slot * 0.62));

  const bars = items.map((d, i) => {
    const h = Math.max(2, (d.value / max) * innerH);
    const x = left + i * slot + (slot - barW) / 2;
    const y = top + innerH - h;
    const showLabel = i % labelEvery === 0;
    return `<g>
      <title>${esc(d.label)}: ${esc(valueFormat(d.value))}</title>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${d.color || barColor}" />
      ${showLabel ? `<text x="${x + barW / 2}" y="${height - 12}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">${esc(truncate(d.label, 8))}</text>` : ''}
    </g>`;
  }).join('');

  const ticks = Array.from({ length: 5 }, (_, i) => {
    const value = Math.round((max * (4 - i)) / 4);
    const y = top + (innerH * i) / 4;
    return `<text x="${left - 8}" y="${y + 3.5}" text-anchor="end" font-size="11" fill="currentColor" opacity="0.55">${esc(fmt(value))}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${height}" class="w-full h-auto block" preserveAspectRatio="xMidYMid meet" role="img">
    ${gridLines(left, W - right, top, top + innerH)}
    ${ticks}
    ${bars}
  </svg>`;
}

/**
 * Stacked vertical bars with a legend.
 * @param {{label:string, segments:{label:string, value:number, color:string}[]}[]} groups
 */
export function stackedBars(groups, { height = 260, valueFormat = fmt } = {}) {
  if (!groups.length) return '<p class="text-sm text-ink-faint py-6 text-center">No data</p>';

  const left = 44;
  const right = 10;
  const top = 34;
  const bottom = 32;
  const innerW = W - left - right;
  const innerH = height - top - bottom;
  const totals = groups.map(g => g.segments.reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(1, ...totals);
  const slot = innerW / groups.length;
  const barW = Math.max(10, Math.min(56, slot * 0.56));
  const series = groups[0]?.segments || [];

  const bars = groups.map((g, i) => {
    const x = left + i * slot + (slot - barW) / 2;
    let y = top + innerH;
    const parts = g.segments.map(s => {
      const h = (s.value / max) * innerH;
      y -= h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(0, h)}" fill="${s.color}" />`;
    }).join('');
    return `<g>
      <title>${esc(g.label)} — ${g.segments.map(s => `${s.label}: ${valueFormat(s.value)}`).join(', ')}</title>
      ${parts}
      <text x="${x + barW / 2}" y="${height - 12}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">${esc(truncate(g.label, 10))}</text>
    </g>`;
  }).join('');

  const ticks = Array.from({ length: 5 }, (_, i) => {
    const value = Math.round((max * (4 - i)) / 4);
    const y = top + (innerH * i) / 4;
    return `<text x="${left - 8}" y="${y + 3.5}" text-anchor="end" font-size="11" fill="currentColor" opacity="0.55">${esc(fmt(value))}</text>`;
  }).join('');

  return `<div class="mb-1">${legend(series)}</div>
  <svg viewBox="0 0 ${W} ${height}" class="w-full h-auto block" preserveAspectRatio="xMidYMid meet" role="img">
    ${gridLines(left, W - right, top, top + innerH)}
    ${ticks}
    ${bars}
  </svg>`;
}

/**
 * Multi-series line chart with a light area fill.
 * @param {string[]} labels
 * @param {{label:string, values:number[], color:string}[]} series
 */
export function lines(labels, series, { height = 250, labelEvery = 6, valueFormat = fmt } = {}) {
  if (!labels.length || !series.length) return '<p class="text-sm text-ink-faint py-6 text-center">No data</p>';

  const left = 44;
  const right = 12;
  const top = 34;
  const bottom = 34;
  const innerW = W - left - right;
  const innerH = height - top - bottom;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;

  const paths = series.map(s => {
    const points = s.values.map((v, i) => {
      const x = left + i * stepX;
      const y = top + innerH - (v / max) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = `M${points.join(' L')}`;
    const area = `${line} L${left + (labels.length - 1) * stepX},${top + innerH} L${left},${top + innerH} Z`;
    const gradId = `area-grad-${++gradientSeq}`;
    return `<g>
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${s.color}" stop-opacity="0.32" />
          <stop offset="100%" stop-color="${s.color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gradId})" />
      <path d="${line}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${s.values.map((v, i) => {
        const x = left + i * stepX;
        const y = top + innerH - (v / max) * innerH;
        return `      <circle cx="${x}" cy="${y}" r="2.8" fill="${s.color}" stroke="var(--color-surface-raised)" stroke-width="1.2"><title>${esc(labels[i])} — ${esc(s.label)}: ${esc(valueFormat(v))}</title></circle>`;
      }).join('')}
    </g>`;
  }).join('');

  const xLabels = labels.map((l, i) => {
    if (i % labelEvery !== 0 && i !== labels.length - 1) return '';
    const x = left + i * stepX;
    return `<text x="${x}" y="${height - 12}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.55">${esc(truncate(l, 8))}</text>`;
  }).join('');

  const ticks = Array.from({ length: 5 }, (_, i) => {
    const value = Math.round((max * (4 - i)) / 4);
    const y = top + (innerH * i) / 4;
    return `<text x="${left - 8}" y="${y + 3.5}" text-anchor="end" font-size="11" fill="currentColor" opacity="0.55">${esc(fmt(value))}</text>`;
  }).join('');

  return `<div class="mb-1">${legend(series)}</div>
  <svg viewBox="0 0 ${W} ${height}" class="w-full h-auto block" preserveAspectRatio="xMidYMid meet" role="img">
    ${gridLines(left, W - right, top, top + innerH)}
    ${ticks}
    ${xLabels}
    ${paths}
  </svg>`;
}

/**
 * Chart + accessible data table. One delegated click handler in the page
 * toggles `[data-chart-table]`.
 */
export function chartBlock(svg, { label, columns, rows }) {
  const head = columns.map(c => `<th class="px-2 py-1.5 text-left font-semibold text-ink-muted whitespace-nowrap">${esc(c)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((cell, i) => (
    `<td class="px-2 py-1 ${i === 0 ? 'text-ink' : 'text-right tabular-nums text-ink-muted'}">${esc(cell)}</td>`
  )).join('')}</tr>`).join('');

  return `<div data-chart-block class="h-full flex flex-col">
    <div role="img" aria-label="${esc(label)}" class="overflow-x-auto scrollbar-thin"><div class="min-w-[640px]">${svg}</div></div>
    <div class="mt-2 no-print">
      <button type="button" data-chart-toggle class="text-xs font-medium text-brand-primary hover:underline" aria-expanded="false">View as table</button>
      <div data-chart-table class="hidden mt-2 overflow-x-auto">
        <table class="w-full text-xs border border-border rounded">
          <thead><tr class="bg-surface-alt">${head}</tr></thead>
          <tbody class="divide-y divide-border">${body}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/** Delegated handler for every chart table toggle inside `root`. */
export function bindChartTableToggles(root) {
  if (root.dataset.chartToggleBound) return;
  root.dataset.chartToggleBound = '1';
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-chart-toggle]');
    if (!btn) return;
    const block = btn.closest('[data-chart-block]');
    const table = block?.querySelector('[data-chart-table]');
    if (!table) return;
    const hidden = table.classList.toggle('hidden');
    btn.textContent = hidden ? 'View as table' : 'Hide table';
    btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  });
}
