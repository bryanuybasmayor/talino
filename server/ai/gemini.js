/**
 * gemini.js — Google Gemini provider for TALINO AI layer
 *
 * Uses plain fetch against the Gemini REST API.
 * No SDK dependency required.
 */

import { PROMPT_VERSION } from './prompts.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Small delay between calls to stay within rate limits
const CALL_DELAY_MS = 200;

// Retry config for 429 / 5xx
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

export class GeminiProvider {
  constructor(apiKey, model = 'gemini-2.0-flash') {
    this.apiKey = apiKey;
    this.model = model;
    this.name = 'gemini';
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
          console.warn('[gemini] tagMentions: invalid JSON, retrying…', err.message);
          continue;
        }
        throw new Error(`[gemini] tagMentions: invalid JSON after retry — ${err.message}`);
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
          console.warn('[gemini] findNarratives: invalid structure, retrying…', err.message);
          continue;
        }
        throw new Error(`[gemini] findNarratives: invalid structure after retry — ${err.message}`);
      }
    }
  }

  // ── Core API call ───────────────────────────────────────────────────────

  /**
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @param {boolean} jsonMode — request application/json response
   * @returns {string} raw text from the model
   */
  async _call(systemPrompt, userMessage, jsonMode = false) {
    // Rate-limit: wait at least CALL_DELAY_MS between calls
    const now = Date.now();
    const elapsed = now - this._lastCallTime;
    if (elapsed < CALL_DELAY_MS) {
      await sleep(CALL_DELAY_MS - elapsed);
    }

    const url = `${GEMINI_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
    };

    if (jsonMode) {
      body.generationConfig = { response_mime_type: 'application/json' };
    }

    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      this._lastCallTime = Date.now();

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        // Retry on rate-limit or server errors
        if (res.status === 429 || res.status >= 500) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`[gemini] ${res.status} — retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(backoff);
          lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`[gemini] HTTP ${res.status}: ${errBody}`);
        }

        const data = await res.json();

        // Extract text from response
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text === undefined || text === null) {
          throw new Error('[gemini] No text in response: ' + JSON.stringify(data).slice(0, 300));
        }

        return text.trim();
      } catch (err) {
        // Don't retry on non-retryable errors
        if (err.message.startsWith('[gemini]')) throw err;
        lastError = err;
        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`[gemini] fetch error — retrying in ${backoff}ms:`, err.message);
          await sleep(backoff);
        }
      }
    }

    throw lastError || new Error('[gemini] All retries exhausted');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
