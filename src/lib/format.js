/**
 * Number and date formatting utilities.
 * All formatting for display happens here — never in metrics.js.
 */

const locale = 'en-PH';

/** Format a number with compact notation: 4670000000 → "₱4.67B" */
export function formatCurrency(value, opts = {}) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  
  if (abs >= 1e9) {
    return `₱${(value / 1e9).toFixed(opts.decimals ?? 2)}B`;
  }
  if (abs >= 1e6) {
    return `₱${(value / 1e6).toFixed(opts.decimals ?? 2)}M`;
  }
  if (abs >= 1e3) {
    return `₱${(value / 1e3).toFixed(opts.decimals ?? 1)}K`;
  }
  return `₱${value.toLocaleString(locale)}`;
}

/** Format a number with compact notation: 90300000 → "90.3M" */
export function formatNumber(value, opts = {}) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  
  if (abs >= 1e9) {
    return `${(value / 1e9).toFixed(opts.decimals ?? 2)}B`;
  }
  if (abs >= 1e6) {
    return `${(value / 1e6).toFixed(opts.decimals ?? 1)}M`;
  }
  if (abs >= 1e3) {
    return `${(value / 1e3).toFixed(opts.decimals ?? 1)}K`;
  }
  return value.toLocaleString(locale);
}

/** Format a whole number with commas: 5873 → "5,873" */
export function formatWhole(value) {
  if (value == null || isNaN(value)) return '—';
  return Math.round(value).toLocaleString(locale);
}

/** Format percentage: 0.156 → "15.6%" or 15.6 → "15.6%" */
export function formatPct(value, opts = {}) {
  if (value == null || isNaN(value)) return '—';
  const v = value > 1 ? value : value * 100;
  return `${v.toFixed(opts.decimals ?? 1)}%`;
}

/** Format a delta: +15.6% or -3.2% */
export function formatDelta(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/** Format date: "2026-06-13" → "Jun 13, 2026" */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format date range: "Jan 2025 – Oct 2026" */
export function formatDateRange(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sStr = s.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  const eStr = e.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  return `${sStr} – ${eStr}`;
}

/** Format week label: "2026-06-09" → "Jun 9" */
export function formatWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
