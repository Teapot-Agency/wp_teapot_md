/**
 * DeepL API client wrapper for article translation.
 * Server-side only — imported by server.js.
 */

import * as deepl from 'deepl-node';

// ---------------------------------------------------------------------------
// Language configuration
// ---------------------------------------------------------------------------

/** Default target languages based on detected source language. */
export const LANG_DEFAULTS = {
  SK: ['EN-US', 'CS'],
  EN: ['SK', 'CS'],
  CS: ['SK', 'EN-US'],
};

/** Human-readable language names for UI display. */
export const LANG_NAMES = {
  SK: 'Slovak',
  CS: 'Czech',
  'EN-US': 'English (US)',
  'EN-GB': 'English (UK)',
  DE: 'German',
  FR: 'French',
  ES: 'Spanish',
  PL: 'Polish',
  HU: 'Hungarian',
  IT: 'Italian',
  PT: 'Portuguese',
};

/** All supported target language codes (subset most relevant to this project). */
export const ALL_TARGET_LANGS = ['SK', 'CS', 'EN-US', 'EN-GB', 'DE', 'FR', 'ES', 'PL', 'HU'];

/** Map short display codes to DeepL target codes (EN → EN-US). */
export const DISPLAY_TO_DEEPL = {
  en: 'EN-US',
  sk: 'SK',
  cs: 'CS',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  pl: 'PL',
  hu: 'HU',
};

/** Map DeepL codes to short directory codes used for file paths. */
export const DEEPL_TO_DIR = {
  SK: 'sk',
  CS: 'cs',
  'EN-US': 'en',
  'EN-GB': 'en',
  DE: 'de',
  FR: 'fr',
  ES: 'es',
  PL: 'pl',
  HU: 'hu',
};

// ---------------------------------------------------------------------------
// Client management
// ---------------------------------------------------------------------------

let cachedClient = null;

/**
 * Create (or return cached) DeepL client.
 * @param {string} apiKey - DeepL API authentication key.
 * @returns {deepl.DeepLClient}
 */
export function createClient(apiKey) {
  if (!cachedClient) {
    cachedClient = new deepl.Translator(apiKey);
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/**
 * Translate an array of texts to the given target language.
 * DeepL batches them in a single API call.
 *
 * @param {deepl.Translator} client
 * @param {string[]} texts - Array of strings to translate.
 * @param {string} targetLang - DeepL target language code (e.g. 'EN-US', 'SK', 'CS').
 * @param {string|null} [sourceLang=null] - Source language code, or null for auto-detect.
 * @param {Object} [options] - Additional DeepL options.
 * @param {string} [options.formality] - 'less', 'more', 'default', or 'prefer_less'/'prefer_more'.
 * @returns {Promise<{texts: string[], detectedLang: string, billedChars: number}>}
 */
export async function translateTexts(client, texts, targetLang, sourceLang = null, options = {}) {
  const deeplOpts = {};
  if (options.formality && options.formality !== 'default') {
    deeplOpts.formality = options.formality;
  }

  const results = await client.translateText(texts, sourceLang, targetLang, deeplOpts);

  // translateText returns a single result for a single string, array for array
  const resultArray = Array.isArray(results) ? results : [results];

  return {
    texts: resultArray.map((r) => r.text),
    detectedLang: resultArray[0]?.detectedSourceLang || '',
    billedChars: resultArray.reduce((sum, r) => sum + (r.billedCharacters || 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Usage / quota
// ---------------------------------------------------------------------------

/**
 * Get DeepL API character usage statistics.
 * @param {deepl.Translator} client
 * @returns {Promise<{count: number, limit: number, percent: number}>}
 */
export async function getUsage(client) {
  const usage = await client.getUsage();
  const count = usage.character?.count ?? 0;
  const limit = usage.character?.limit ?? 500000;
  return {
    count,
    limit,
    percent: limit > 0 ? Math.round((count / limit) * 1000) / 10 : 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get default target languages for a given source language.
 * Normalizes source code (e.g. 'EN-US' → 'EN') before lookup.
 * @param {string} sourceLang - Detected source language code.
 * @returns {string[]} Array of DeepL target language codes.
 */
export function getDefaultTargets(sourceLang) {
  const normalized = sourceLang.toUpperCase().replace(/-.*/, '');
  return LANG_DEFAULTS[normalized] || ['EN-US'];
}
