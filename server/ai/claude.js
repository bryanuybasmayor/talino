/**
 * claude.js — Anthropic Claude provider for TALINO AI layer
 *
 * Uses plain fetch against the Anthropic Messages API.
 * Same interface as GeminiProvider so they're interchangeable.
 */

import { PROMPT_VERSION } from './prompts.js';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Small delay between calls to stay within rate limits
const CALL_DELAY_MS = 200;

// Retry config for 429 / 5xx
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

// Default max tokens for responses
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeProvider {
  constructor(apiKey, model = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.model = model;
    this.name = 'claude';
    this._lastCallTime = 0;
  }

  // ── Public methods ──────────────────────────────────────────────────────

  /**
   * Tag mentions — expects JSON array back.
   * Retries once on invalid JSON output.
   */
  async tagMentions(systemPrompt, userMessage) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this._call(systemPrompt, userMessage, true);
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        throw new Error('Response is not a JSON array');
      } catch (err) {
        if (attempt === 0) {
          console.warn('[claude] tagMentions: invalid JSON, retrying…', err.message);
          continue;
        }
        throw new Error(`[claude] tagMentions: invalid JSON after retry — ${err.message}`);
      }
    }
  }

  /**
   * Write a plain-text summary.
   */
  async writeSummary(systemPrompt, userMessage) {
    return this._call(systemPrompt, userMessage, false);
  }

  /**
   * Find narratives — expects { positive: [...], risk: [...] }.
   * Retries once on invalid structure.
   */
  async findNarratives(systemPrompt, userMessage) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this._call(systemPrompt, userMessage, true);
      try {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          Array.isArray(parsed.positive) &&
          Array.isArray(parsed.risk)
        ) {
          return parsed;
        }
        throw new Error('Response missing positive/risk arrays');
      } catch (err) {
        if (attempt === 0) {
          console.warn('[claude] findNarratives: invalid structure, retrying…', err.message);
          continue;
        }
        throw new Error(`[claude] findNarratives: invalid structure after retry — ${err.message}`);
      }
    }
  }

  // ── Core API call ───────────────────────────────────────────────────────

  /**
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @param {boolean} jsonMode — append JSON instruction to system prompt
   * @returns {string} raw text from the model
   */
  async _call(systemPrompt, userMessage, jsonMode = false) {
    // Rate-limit: wait at least CALL_DELAY_MS between calls
    const now = Date.now();
    const elapsed = now - this._lastCallTime;
    if (elapsed < CALL_DELAY_MS) {
      await sleep(CALL_DELAY_MS - elapsed);
    }

    const system = jsonMode
      ? `${systemPrompt}\n\nRespond with only valid JSON.`
      : systemPrompt;

    const body = {
      model: this.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userMessage }],
    };

    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      this._lastCallTime = Date.now();

      try {
        const res = await fetch(ANTHROPIC_BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
        });

        // Retry on rate-limit or server errors
        if (res.status === 429 || res.status >= 500) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`[claude] ${res.status} — retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(backoff);
          lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`[claude] HTTP ${res.status}: ${errBody}`);
        }

        const data = await res.json();

        // Extract text from response — Claude returns content[0].text
        const text = data?.content?.[0]?.text;
        if (text === undefined || text === null) {
          throw new Error('[claude] No text in response: ' + JSON.stringify(data).slice(0, 300));
        }

        return text.trim();
      } catch (err) {
        // Don't retry on non-retryable errors
        if (err.message.startsWith('[claude]')) throw err;
        lastError = err;
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`[claude] fetch error — retrying in ${backoff}ms:`, err.message);
          await sleep(backoff);
        }
      }
    }

    throw lastError || new Error('[claude] All retries exhausted');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
