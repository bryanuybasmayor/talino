/** Shared number formatting for AI payloads (display strings the model can quote verbatim). */

export function formatMoney(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e9) return `₱${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `₱${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `₱${(v / 1e3).toFixed(1)}K`;
  return `₱${Math.round(v)}`;
}

export function formatCount(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return Math.round(v).toLocaleString('en-PH');
}

export function formatPct(n, digits = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

/** KPI row with machine + display values. */
export function kpiForPrompt(k) {
  if (!k) return null;
  return {
    period: k.period,
    start_date: k.start_date,
    end_date: k.end_date,
    posts: k.posts,
    posts_display: formatCount(k.posts),
    lanus: k.lanus,
    reach: k.reach,
    reach_display: formatCount(k.reach),
    views: k.views,
    views_display: formatCount(k.views),
    emv_php: k.emv_php,
    emv_display: formatMoney(k.emv_php),
    likes: k.likes,
    comments: k.comments,
    shares: k.shares,
    saves: k.saves,
    engagement_rate: k.reach
      ? formatPct(
          ((k.likes + k.comments + k.shares + k.saves) / k.reach) * 100,
          2
        )
      : null,
  };
}
