/**
 * prompts.js — AI prompt templates for TALINO dashboard
 *
 * Each function returns { system, user } so the provider layer
 * can slot them into the right API fields.
 */

export const PROMPT_VERSION = '1.0';

// ── Allowed value lists (shared with validation) ────────────────────────────

export const SENTIMENTS = ['positive', 'neutral', 'negative'];

export const EMOTIONS = [
  'joy', 'excitement', 'trust', 'surprise', 'neutral',
  'sadness', 'anger', 'disgust', 'fear',
];

export const NARRATIVE_STATUSES = ['ANCHOR', 'ESCALATING', 'STEADY', 'RED FLAG'];

// ── Prompt 1 — row tagging (per mention) ────────────────────────────────────

export function tagMentionsPrompt(clientName, topicList, rows) {
  const system = [
    `You are a social media analyst for ${clientName}.`,
    'You receive social mentions as JSON (id, brand, platform, text).',
    'Text may be English, Filipino, Taglish or Cebuano, with slang and emojis.',
    'For every row return: id, sentiment (positive | neutral | negative),',
    'emotion (joy | excitement | trust | surprise | neutral | sadness | anger | disgust | fear),',
    `topic (one value from the client's topic list), confidence (high | medium | low).`,
    `Judge the author's attitude toward the brand.`,
    'Brand-owned promotional posts are neutral unless they quote audience reaction.',
    'Sarcasm counts as negative.',
    'Return only the JSON array, same number of rows as the input.',
  ].join(' ');

  const user = [
    `Topic list: ${JSON.stringify(topicList)}`,
    '',
    'Mentions:',
    JSON.stringify(rows, null, 2),
  ].join('\n');

  return { system, user };
}

// ── Prompt 2 — section summary ──────────────────────────────────────────────

export function sectionSummaryPrompt(clientName, sectionName, currentNumbers, previousNumbers) {
  const hasPrevious = previousNumbers !== null && previousNumbers !== undefined;
  const system = [
    `You are a senior social analyst writing the "${sectionName}" section of ${clientName}'s report.`,
    'Write 2–3 sentences of plain, confident analysis: what the numbers show and one concrete recommended action.',
    hasPrevious
      ? 'Compare the current and previous periods, and name the likely driver of the change.'
      : 'Only describe the current period. Do not mention a previous period, missing data, nulls, or gaps unless the numbers show a genuine data problem.',
    'Use the exact display strings for money, reach and counts (e.g. "₱241.9M", "46.5M reach"). Never invent, estimate or recalculate figures.',
    'Do not start with "This section" or restate the section name. No bullet points. No hype.',
    'Do not characterize post content or strategy beyond the captions supplied in the numbers.',
    'If the numbers contain a real integrity issue, say so plainly and name the affected IDs.',
  ].join(' ');

  const user = [
    `Section: ${sectionName}`,
    '',
    'Current period numbers:',
    JSON.stringify(currentNumbers, null, 2),
    ...(hasPrevious
      ? ['', 'Previous period numbers:', JSON.stringify(previousNumbers, null, 2)]
      : ['', 'No previous period is available. Do not refer to one.']),
  ].join('\n');

  return { system, user };
}

// ── Prompt 3 — narratives ───────────────────────────────────────────────────

export function narrativesPrompt(clientName, taggedMentionsByTopic) {
  const system = [
    `From these tagged mentions (grouped by topic, with counts and sample texts),`,
    'identify up to 5 brand-positive narratives and up to 5 risk/pressure narratives.',
    'For each: a short title (Taglish is fine), a 1–2 sentence description,',
    'the topic it belongs to, and a status (ANCHOR | ESCALATING | STEADY | RED FLAG).',
    'Do not output volumes; the app calculates those from the topic counts.',
    '',
    'Return JSON: { "positive": [...], "risk": [...] }',
    'Each item: { "title": "...", "description": "...", "topic": "...", "status": "..." }',
  ].join(' ');

  const user = [
    `Client: ${clientName}`,
    '',
    'Tagged mentions by topic:',
    JSON.stringify(taggedMentionsByTopic, null, 2),
  ].join('\n');

  return { system, user };
}
