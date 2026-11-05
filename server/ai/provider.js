/**
 * provider.js — AI provider factory + high-level AI functions
 *
 * This is the main entry point for the rest of the app.
 * It reads env vars, creates the right provider, and exposes
 * high-level functions that combine prompts + provider calls.
 */

import { GeminiProvider } from './gemini.js';
import { ClaudeProvider } from './claude.js';
import {
  tagMentionsPrompt,
  sectionSummaryPrompt,
  narrativesPrompt,
  PROMPT_VERSION,
  SENTIMENTS,
  EMOTIONS,
  NARRATIVE_STATUSES,
} from './prompts.js';

// ── Batch size for mention tagging ──────────────────────────────────────────

const TAG_BATCH_SIZE = 100;

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an AI provider from environment variables.
 * Returns null if no API key is configured (app runs without AI).
 */
export function createProvider() {
  const providerName = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const model = process.env.AI_MODEL;

  if (providerName === 'claude' || providerName === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.warn('[ai] ANTHROPIC_API_KEY not set — AI features disabled');
      return null;
    }
    return new ClaudeProvider(key, model || 'claude-sonnet-4-5');
  }

  // Default: gemini
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[ai] GEMINI_API_KEY not set — AI features disabled');
    return null;
  }
  return new GeminiProvider(key, model || 'gemini-3.5-flash-lite');
}

// ── High-level functions ────────────────────────────────────────────────────

/**
 * Tag a list of mentions with sentiment, emotion, topic, confidence.
 * Processes in batches of ~100 rows.
 *
 * @param {GeminiProvider|ClaudeProvider} provider
 * @param {object} clientConfig — must have .name and .topic_list
 * @param {Array} mentions — [{id, brand, platform, text}, ...]
 * @param {function} [onProgress] — called with { done, total } after each batch
 * @returns {{ tags, provider, model, prompt_version, generated_at }}
 */
export async function tagMentionsBatch(provider, clientConfig, mentions, onProgress) {
  const allTags = [];
  const total = mentions.length;
  let done = 0;

  for (let i = 0; i < total; i += TAG_BATCH_SIZE) {
    const batch = mentions.slice(i, i + TAG_BATCH_SIZE);
    const rows = batch.map((m) => ({
      id: m.id,
      brand: m.brand,
      platform: m.platform,
      text: m.text,
    }));

    const { system, user } = tagMentionsPrompt(
      clientConfig.name,
      clientConfig.topic_list,
      rows,
    );

    let tags = await provider.tagMentions(system, user);

    // Validate and fix each tag
    tags = validateTags(tags, clientConfig.topic_list);

    // If row count doesn't match, retry once
    if (tags.length !== batch.length) {
      console.warn(
        `[ai] Tag count mismatch (got ${tags.length}, expected ${batch.length}), retrying batch…`,
      );
      let retryTags = await provider.tagMentions(system, user);
      retryTags = validateTags(retryTags, clientConfig.topic_list);
      if (retryTags.length === batch.length) {
        tags = retryTags;
      }
      // If still mismatched, use what we got — downstream can handle it
    }

    allTags.push(...tags);
    done += batch.length;

    if (typeof onProgress === 'function') {
      onProgress({ done: Math.min(done, total), total });
    }
  }

  return {
    tags: allTags,
    provider: provider.name,
    model: provider.model,
    prompt_version: PROMPT_VERSION,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate a summary for a dashboard section.
 *
 * @param {GeminiProvider|ClaudeProvider} provider
 * @param {object} clientConfig — must have .name
 * @param {string} sectionName
 * @param {object} currentNumbers
 * @param {object} previousNumbers
 * @returns {{ draft, provider, model, prompt_version, generated_at }}
 */
export async function generateSummary(provider, clientConfig, sectionName, currentNumbers, previousNumbers) {
  const { system, user } = sectionSummaryPrompt(
    clientConfig.name,
    sectionName,
    currentNumbers,
    previousNumbers,
  );

  const draft = await provider.writeSummary(system, user);

  return {
    draft,
    provider: provider.name,
    model: provider.model,
    prompt_version: PROMPT_VERSION,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate positive and risk narratives from tagged mentions.
 *
 * @param {GeminiProvider|ClaudeProvider} provider
 * @param {object} clientConfig — must have .name
 * @param {object} taggedMentionsByTopic — { topicName: { count, samples: [...] }, ... }
 * @returns {{ positive, risk, provider, model, prompt_version, generated_at }}
 */
export async function generateNarratives(provider, clientConfig, taggedMentionsByTopic) {
  const { system, user } = narrativesPrompt(
    clientConfig.name,
    taggedMentionsByTopic,
  );

  let result = await provider.findNarratives(system, user);

  // Validate narrative statuses — retry once if invalid
  let valid = validateNarratives(result);
  if (!valid) {
    console.warn('[ai] Invalid narrative statuses, retrying…');
    result = await provider.findNarratives(system, user);
    valid = validateNarratives(result);
    if (!valid) {
      // Force-fix statuses to STEADY as fallback
      result.positive = fixNarrativeStatuses(result.positive);
      result.risk = fixNarrativeStatuses(result.risk);
    }
  }

  return {
    positive: result.positive,
    risk: result.risk,
    provider: provider.name,
    model: provider.model,
    prompt_version: PROMPT_VERSION,
    generated_at: new Date().toISOString(),
  };
}

// ── Validation helpers ──────────────────────────────────────────────────────

/**
 * Validate and clamp tag values to allowed lists.
 * Unknown values are replaced with safe defaults.
 */
function validateTags(tags, topicList) {
  if (!Array.isArray(tags)) return [];

  return tags.map((tag) => ({
    id: tag.id,
    sentiment: SENTIMENTS.includes(tag.sentiment) ? tag.sentiment : 'neutral',
    emotion: EMOTIONS.includes(tag.emotion) ? tag.emotion : 'neutral',
    topic: topicList.includes(tag.topic) ? tag.topic : topicList[0] || 'general',
    confidence: ['high', 'medium', 'low'].includes(tag.confidence) ? tag.confidence : 'low',
  }));
}

/**
 * Check that all narrative statuses are in the allowed list.
 */
function validateNarratives(result) {
  if (!result || !Array.isArray(result.positive) || !Array.isArray(result.risk)) {
    return false;
  }

  const allNarratives = [...result.positive, ...result.risk];
  return allNarratives.every((n) => NARRATIVE_STATUSES.includes(n.status));
}

/**
 * Force-fix narrative statuses to STEADY if they're not in the allowed list.
 */
function fixNarrativeStatuses(narratives) {
  if (!Array.isArray(narratives)) return [];
  return narratives.map((n) => ({
    ...n,
    status: NARRATIVE_STATUSES.includes(n.status) ? n.status : 'STEADY',
  }));
}
