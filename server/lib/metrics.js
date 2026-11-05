/**
 * metrics.js — All computed metrics
 *
 * Every number shown in the UI is computed here.
 * Values are raw internally; formatting (₱, compact notation, %)
 * happens in the front end.
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Safe division — returns 0 when divisor is 0 or non-finite. */
function safeDivide(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

/** Compute the median of a numeric array (ignores non-finite). */
function median(values) {
  const clean = values.filter(v => Number.isFinite(v));
  if (!clean.length) return 0;
  clean.sort((a, b) => a - b);
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0
    ? (clean[mid - 1] + clean[mid]) / 2
    : clean[mid];
}

/** Sum an array of numbers, skipping non-finite values. */
function safeSum(arr) {
  return arr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}

/** ISO week key from a date string (YYYY-MM-DD). Returns "YYYY-Www". */
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'unknown';
  // ISO week calculation
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGN PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute change vs previous period for each KPI.
 * @param {Object} current  — { reach, views, emv_php, likes, comments, shares, saves, posts, lanus }
 * @param {Object} previous — same shape
 * @returns {Object} { [key]: { current, previous, delta, delta_pct } }
 */
export function computeKPIDeltas(currentKPIs, previousKPIs) {
  const keys = ['reach', 'views', 'emv_php', 'likes', 'comments', 'shares', 'saves', 'posts', 'lanus'];
  const result = {};

  for (const key of keys) {
    const cur  = Number.isFinite(currentKPIs?.[key])  ? currentKPIs[key]  : 0;
    const prev = Number.isFinite(previousKPIs?.[key]) ? previousKPIs[key] : 0;
    const delta = cur - prev;
    const delta_pct = safeDivide(delta, prev);

    result[key] = { current: cur, previous: prev, delta, delta_pct };
  }

  return result;
}

/**
 * Engagement rate = (likes + comments + shares + saves) / reach × 100.
 * @returns {number} percentage (e.g. 4.5 means 4.5%)
 */
export function computeEngagementRate(likes, comments, shares, saves, reach) {
  const engagements = safeSum([likes, comments, shares, saves]);
  return safeDivide(engagements, reach) * 100;
}

/**
 * EMV per post.
 * @returns {number}
 */
export function computeEMVPerPost(emv, posts) {
  return safeDivide(emv, posts);
}

/**
 * EMV per 1,000 reach.
 * @returns {number}
 */
export function computeEMVPer1KReach(emv, reach) {
  return safeDivide(emv, reach) * 1000;
}

/**
 * Add efficiency metrics to each LANU row.
 * @param {Array} lanus — normalized lanus rows
 * @returns {Array} lanus with emv_per_post and emv_per_1k_reach added
 */
export function computeLANUEfficiency(lanus) {
  return lanus.map(l => ({
    ...l,
    emv_per_post:     computeEMVPerPost(l.emv_php, l.posts),
    emv_per_1k_reach: computeEMVPer1KReach(l.emv_php, l.reach),
  }));
}

/**
 * Group posts by campaign, compute totals and rates.
 * @param {Array} posts — normalized top_posts rows
 * @returns {Array} [{ campaign, post_count, total_reach, total_emv, avg_emv, engagement_rate }]
 */
export function computeCampaignMetrics(posts) {
  const groups = new Map();

  for (const p of posts) {
    const key = p.campaign || 'Unknown';
    if (!groups.has(key)) {
      groups.set(key, { campaign: key, posts: [], total_reach: 0, total_emv: 0 });
    }
    const g = groups.get(key);
    g.posts.push(p);
    g.total_reach += Number.isFinite(p.reach)   ? p.reach   : 0;
    g.total_emv   += Number.isFinite(p.emv_php) ? p.emv_php : 0;
  }

  return Array.from(groups.values()).map(g => ({
    campaign:     g.campaign,
    post_count:   g.posts.length,
    total_reach:  g.total_reach,
    total_emv:    g.total_emv,
    avg_emv:      computeEMVPerPost(g.total_emv, g.posts.length),
    emv_per_1k_reach: computeEMVPer1KReach(g.total_emv, g.total_reach),
  }));
}

/**
 * Normalize approximate format mix values to percentages.
 * @param {Array} formatMix — normalized format_mix rows
 * @returns {Array} rows with added `pct` field
 */
export function computeFormatProportions(formatMix) {
  const total = safeSum(formatMix.map(r => r.posts_approx));
  return formatMix.map(r => ({
    ...r,
    pct: safeDivide(r.posts_approx, total) * 100,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// LISTENING METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sentiment split from AI tags.
 * @param {Array} tags — [{ mention_id, dimension, value }]
 * @returns {{ positive: number, neutral: number, negative: number, total: number, net_score: number }}
 */
export function computeSentimentSplit(tags) {
  const sentimentTags = (tags || []).filter(t => t.dimension === 'sentiment');
  let positive = 0, neutral = 0, negative = 0;

  for (const t of sentimentTags) {
    const v = (t.value || '').toLowerCase();
    if (v === 'positive')      positive++;
    else if (v === 'negative') negative++;
    else                       neutral++;
  }

  const total = positive + neutral + negative;
  const net_score = total > 0
    ? safeDivide(positive - negative, total) * 100
    : 0;

  return { positive, neutral, negative, total, net_score };
}

/**
 * Emotion mix — counts per emotion, plus dominant cluster.
 * @param {Array} tags
 * @returns {{ counts: Object, dominant: string, total: number }}
 */
export function computeEmotionMix(tags) {
  const emotionTags = (tags || []).filter(t => t.dimension === 'emotion');
  const counts = {};

  for (const t of emotionTags) {
    const v = (t.value || 'unknown').toLowerCase();
    counts[v] = (counts[v] || 0) + 1;
  }

  const total = emotionTags.length;
  let dominant = '';
  let maxCount = 0;
  for (const [emotion, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = emotion;
    }
  }

  return { counts, dominant, total };
}

/**
 * Topic ranking — ranked by volume, with sentiment breakdown per topic.
 * @param {Array} tags
 * @returns {Array} [{ topic, volume, sentiment: { positive, neutral, negative } }]
 */
export function computeTopicRanking(tags) {
  const topicTags = (tags || []).filter(t => t.dimension === 'topic');
  const sentimentByMention = new Map();

  // Build a mention_id → sentiment lookup
  for (const t of (tags || [])) {
    if (t.dimension === 'sentiment') {
      sentimentByMention.set(t.mention_id, (t.value || '').toLowerCase());
    }
  }

  // Group topics
  const topicMap = new Map();
  for (const t of topicTags) {
    const topic = (t.value || 'unknown').toLowerCase();
    if (!topicMap.has(topic)) {
      topicMap.set(topic, { topic, volume: 0, sentiment: { positive: 0, neutral: 0, negative: 0 } });
    }
    const entry = topicMap.get(topic);
    entry.volume++;

    const sent = sentimentByMention.get(t.mention_id) || 'neutral';
    if (sent === 'positive')      entry.sentiment.positive++;
    else if (sent === 'negative') entry.sentiment.negative++;
    else                          entry.sentiment.neutral++;
  }

  return Array.from(topicMap.values()).sort((a, b) => b.volume - a.volume);
}

/**
 * Sentiment split per platform.
 * @param {Array} mentions
 * @param {Array} tags
 * @returns {Object} { [platform]: { positive, neutral, negative, total } }
 */
export function computePlatformSentiment(mentions, tags) {
  // Build mention_id → platform lookup
  const platformByMention = new Map();
  for (const m of (mentions || [])) {
    platformByMention.set(m.mention_id, (m.platform || 'unknown').toLowerCase());
  }

  // Build mention_id → sentiment lookup
  const sentimentByMention = new Map();
  for (const t of (tags || [])) {
    if (t.dimension === 'sentiment') {
      sentimentByMention.set(t.mention_id, (t.value || '').toLowerCase());
    }
  }

  const result = {};
  for (const m of (mentions || [])) {
    const platform = platformByMention.get(m.mention_id) || 'unknown';
    if (!result[platform]) {
      result[platform] = { positive: 0, neutral: 0, negative: 0, total: 0 };
    }
    const sent = sentimentByMention.get(m.mention_id) || 'neutral';
    result[platform].total++;
    if (sent === 'positive')      result[platform].positive++;
    else if (sent === 'negative') result[platform].negative++;
    else                          result[platform].neutral++;
  }

  return result;
}

/**
 * Geographic distribution — volume by city/region from mention tags.
 * @param {Array} mentions — each may have a `city` or `region` field
 * @returns {Array} [{ location, volume }] sorted descending
 */
export function computeGeoDistribution(mentions) {
  const counts = new Map();

  for (const m of (mentions || [])) {
    const loc = (m.city || m.region || m.location || '').trim();
    if (!loc) continue;
    counts.set(loc, (counts.get(loc) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([location, volume]) => ({ location, volume }))
    .sort((a, b) => b.volume - a.volume);
}

/**
 * Weekly mention volume.
 * @param {Array} mentions
 * @returns {Array} [{ week: "YYYY-Www", count }] sorted chronologically
 */
export function computeWeeklyVolume(mentions) {
  const weeks = new Map();

  for (const m of (mentions || [])) {
    const wk = isoWeekKey(m.date);
    weeks.set(wk, (weeks.get(wk) || 0) + 1);
  }

  return Array.from(weeks.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Sentiment by language.
 * @param {Array} mentions — each may have a `language` field
 * @param {Array} tags
 * @returns {Object} { [language]: { positive, neutral, negative, total } }
 */
export function computeLanguageSentiment(mentions, tags) {
  const langByMention = new Map();
  for (const m of (mentions || [])) {
    langByMention.set(m.mention_id, (m.language || 'unknown').toLowerCase());
  }

  const sentimentByMention = new Map();
  for (const t of (tags || [])) {
    if (t.dimension === 'sentiment') {
      sentimentByMention.set(t.mention_id, (t.value || '').toLowerCase());
    }
  }

  const result = {};
  for (const m of (mentions || [])) {
    const lang = langByMention.get(m.mention_id) || 'unknown';
    if (!result[lang]) {
      result[lang] = { positive: 0, neutral: 0, negative: 0, total: 0 };
    }
    const sent = sentimentByMention.get(m.mention_id) || 'neutral';
    result[lang].total++;
    if (sent === 'positive')      result[lang].positive++;
    else if (sent === 'negative') result[lang].negative++;
    else                          result[lang].neutral++;
  }

  return result;
}

/**
 * Extract and weight keywords/hashtags from mention captions.
 * @param {Array} mentions
 * @returns {Array} [{ keyword, count, type: 'hashtag'|'keyword' }] sorted by count desc
 */
export function computeKeywords(mentions) {
  const hashtagCounts = new Map();
  const wordCounts    = new Map();

  for (const m of (mentions || [])) {
    const caption = m.caption_excerpt || '';

    // Extract hashtags
    const hashtags = caption.match(/#[\w\u00C0-\u024F]+/g) || [];
    for (const ht of hashtags) {
      const lower = ht.toLowerCase();
      hashtagCounts.set(lower, (hashtagCounts.get(lower) || 0) + 1);
    }

    // Extract significant words (3+ chars, not stopwords)
    const words = caption
      .replace(/#[\w\u00C0-\u024F]+/g, '')  // remove hashtags
      .replace(/https?:\/\/\S+/g, '')        // remove URLs
      .replace(/[^\w\s\u00C0-\u024F]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
  }

  const results = [];

  for (const [keyword, count] of hashtagCounts) {
    results.push({ keyword, count, type: 'hashtag' });
  }
  for (const [keyword, count] of wordCounts) {
    if (count >= 2) { // only include words appearing 2+ times
      results.push({ keyword, count, type: 'keyword' });
    }
  }

  return results.sort((a, b) => b.count - a.count);
}

/** Common English/Filipino stop words to exclude from keyword extraction. */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'from',
  'that', 'this', 'with', 'they', 'will', 'each', 'make', 'like',
  'into', 'just', 'over', 'such', 'than', 'them', 'very', 'some',
  'only', 'come', 'its', 'also', 'more', 'who', 'what', 'when',
  'where', 'which', 'their', 'there', 'about', 'would', 'these',
  'other', 'could', 'those', 'after', 'being', 'does', 'were',
  'ang', 'mga', 'nang', 'para', 'lang', 'din', 'rin', 'naman',
  'yung', 'kung', 'may', 'nga', 'dito', 'siya', 'ito', 'niya',
]);

/**
 * Top 10 non-LANU accounts by reach + engagement.
 * @param {Array} mentions
 * @param {Array} tags
 * @returns {Array} top 10 [{ profile, total_reach, total_engagement, mention_count }]
 */
export function computeTopVoices(mentions, tags) {
  const profileMap = new Map();

  for (const m of (mentions || [])) {
    const profile = (m.profile || '').trim();
    if (!profile) continue;

    if (!profileMap.has(profile)) {
      profileMap.set(profile, { profile, total_reach: 0, total_engagement: 0, mention_count: 0 });
    }
    const entry = profileMap.get(profile);
    entry.mention_count++;
    entry.total_reach      += Number.isFinite(m.reach)      ? m.reach      : 0;
    entry.total_engagement += Number.isFinite(m.engagement)  ? m.engagement : 0;
  }

  return Array.from(profileMap.values())
    .sort((a, b) => (b.total_reach + b.total_engagement) - (a.total_reach + a.total_engagement))
    .slice(0, 10);
}

/**
 * Share of voice — comparative metrics between ZYN and Ploom.
 * @param {Array} zynMentions
 * @param {Array} ploomMentions
 * @param {Array} zynTags
 * @param {Array} ploomTags
 * @returns {Object} { zyn: { volume, sentiment }, ploom: { volume, sentiment }, share_of_voice }
 */
export function computeShareOfVoice(zynMentions, ploomMentions, zynTags, ploomTags) {
  const zynVolume   = (zynMentions   || []).length;
  const ploomVolume = (ploomMentions || []).length;
  const totalVolume = zynVolume + ploomVolume;

  const zynSentiment   = computeSentimentSplit(zynTags);
  const ploomSentiment = computeSentimentSplit(ploomTags);

  return {
    zyn: {
      volume:    zynVolume,
      volume_pct: safeDivide(zynVolume, totalVolume) * 100,
      sentiment: zynSentiment,
    },
    ploom: {
      volume:    ploomVolume,
      volume_pct: safeDivide(ploomVolume, totalVolume) * 100,
      sentiment: ploomSentiment,
    },
    total_volume: totalVolume,
  };
}

/**
 * Top 5 viral posts by reach.
 * @param {Array} mentions
 * @param {Array} tags
 * @returns {Array} top 5 mentions sorted by reach desc
 */
export function computeViralPosts(mentions, tags) {
  const sentimentByMention = new Map();
  for (const t of (tags || [])) {
    if (t.dimension === 'sentiment') {
      sentimentByMention.set(t.mention_id, (t.value || '').toLowerCase());
    }
  }

  return (mentions || [])
    .filter(m => Number.isFinite(m.reach) && m.reach > 0)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5)
    .map(m => ({
      ...m,
      sentiment: sentimentByMention.get(m.mention_id) || null,
    }));
}

/**
 * Identify peak weeks from weekly volume data.
 * A peak week has volume > mean + 1 standard deviation.
 * @param {Array} weeklyVolume — from computeWeeklyVolume()
 * @returns {Array} [{ week, count, z_score }] — only peak weeks
 */
export function computePeakWeeks(weeklyVolume) {
  if (!weeklyVolume || !weeklyVolume.length) return [];

  const counts = weeklyVolume.map(w => w.count);
  const mean = safeSum(counts) / counts.length;
  const variance = safeSum(counts.map(c => (c - mean) ** 2)) / counts.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  return weeklyVolume
    .map(w => ({
      week:    w.week,
      count:   w.count,
      z_score: safeDivide(w.count - mean, stdDev),
    }))
    .filter(w => w.z_score > 1)
    .sort((a, b) => b.count - a.count);
}

/**
 * Compute all headline strip numbers for the listening dashboard.
 * @param {Array} tags
 * @param {Array} mentions
 * @param {Array} weeklyVolume — from computeWeeklyVolume()
 * @returns {Object} all headline numbers
 */
export function computeHeadlineStrip(tags, mentions, weeklyVolume) {
  const sentiment   = computeSentimentSplit(tags);
  const emotionMix  = computeEmotionMix(tags);
  const totalVolume = (mentions || []).length;

  // Average weekly volume
  const avgWeekly = weeklyVolume && weeklyVolume.length
    ? safeSum(weeklyVolume.map(w => w.count)) / weeklyVolume.length
    : 0;

  // Peak week
  const peaks = computePeakWeeks(weeklyVolume || []);
  const peakWeek = peaks.length ? peaks[0] : null;

  // Platform breakdown
  const platformCounts = {};
  for (const m of (mentions || [])) {
    const p = (m.platform || 'unknown').toLowerCase();
    platformCounts[p] = (platformCounts[p] || 0) + 1;
  }

  return {
    total_mentions:    totalVolume,
    net_sentiment:     sentiment.net_score,
    sentiment_split:   sentiment,
    dominant_emotion:  emotionMix.dominant,
    avg_weekly_volume: Math.round(avgWeekly),
    peak_week:         peakWeek,
    platform_counts:   platformCounts,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATORS — used by the Express API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compose every metric the report view needs from the stored data files.
 * @param {Object} reportData — { kpis, lanus, campaign_posts, campaign_share, format_mix, ... }
 * @param {Object} report — report.json
 */
export function computeMetrics(reportData = {}, report = {}) {
  const out = { report_id: report.id || null };

  // ── KPI overview ──
  const kpis = reportData.kpis || [];
  const allTime = kpis.find(k => k.period === 'All time') || null;
  const ytd = kpis.find(k => k.period === '2026 YTD') || null;
  if (ytd && allTime) {
    out.kpi_deltas = computeKPIDeltas(ytd, {
      ...allTime,
      reach: allTime.reach - ytd.reach,
      views: allTime.views - ytd.views,
      emv_php: allTime.emv_php - ytd.emv_php,
      likes: allTime.likes - ytd.likes,
      comments: allTime.comments - ytd.comments,
      shares: allTime.shares - ytd.shares,
      saves: allTime.saves - ytd.saves,
      posts: allTime.posts - ytd.posts,
      lanus: allTime.lanus - ytd.lanus,
    });
  }
  if (ytd) {
    out.engagement_rate = computeEngagementRate(ytd.likes, ytd.comments, ytd.shares, ytd.saves, ytd.reach);
  }

  // ── LANU efficiency ──
  if (reportData.lanus?.length) {
    out.lanus = computeLANUEfficiency(reportData.lanus);
  }

  // ── Campaign metrics ──
  if (reportData.campaign_posts?.length) {
    out.campaigns = computeCampaignMetrics(reportData.campaign_posts);
  }

  // ── Format proportions ──
  if (reportData.format_mix?.length) {
    out.format_mix = computeFormatProportions(reportData.format_mix);
  }

  return out;
}

/** Section-specific metrics for /metrics/:section. */
export function computeSectionMetrics(section, data, report = {}) {
  switch (section) {
    case 'lanus':
      return computeLANUEfficiency(data || []);
    case 'campaign_posts':
    case 'campaigns':
      return computeCampaignMetrics(data || []);
    case 'format_mix':
      return computeFormatProportions(data || []);
    default:
      return { section, rows: Array.isArray(data) ? data.length : 0 };
  }
}

// ── Wide→long tag adapter ──────────────────────────────────────────────────
/** AI tags are stored wide ({sentiment, emotion, topic}); metrics expect long. */
export function toLongTags(tags = []) {
  const out = [];
  for (const t of tags) {
    if (t.sentiment) out.push({ mention_id: t.mention_id, dimension: 'sentiment', value: t.sentiment });
    if (t.emotion)   out.push({ mention_id: t.mention_id, dimension: 'emotion',   value: t.emotion });
    if (t.topic)     out.push({ mention_id: t.mention_id, dimension: 'topic',     value: t.topic });
  }
  return out;
}

/** Convenience bundle used by the report view. */
export function computeListeningMetrics(mentions = [], wideTags = []) {
  const longTags = toLongTags(wideTags);
  return {
    sentiment: computeSentimentSplit(longTags),
    emotions: computeEmotionMix(longTags),
    topics: computeTopicRanking(longTags),
    weekly: computeWeeklyVolume(mentions),
    platform_sentiment: computePlatformSentiment(mentions, longTags),
    language_sentiment: computeLanguageSentiment(mentions, longTags),
  };
}
