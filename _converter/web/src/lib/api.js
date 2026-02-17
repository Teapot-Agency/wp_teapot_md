/**
 * Client-side fetch wrappers for the converter API endpoints.
 */

/**
 * Load an existing blog article by slug.
 *
 * @param {string} slug - The post slug (without .md extension).
 * @returns {Promise<{slug: string, content: string}>}
 */
export async function loadArticle(slug) {
  const res = await fetch(`/api/blog-files/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load article');
  }
  return res.json();
}

/**
 * Analyze an article with AI to get meta fields, slug, and image prompts.
 *
 * @param {string} title  - The post title.
 * @param {string} content - The markdown body content.
 * @returns {Promise<{metaTitle: string, metaDescription: string, slug: string, featuredImage: {prompt: string, seoFilename: string}, bodyImages: Array<{prompt: string, seoFilename: string, afterSection: string}>}>}
 */
export async function analyzeArticle(title, content) {
  const res = await fetch('/api/analyze-article', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Article analysis failed');
  }
  return res.json();
}

/**
 * Generate an image via Gemini for a given post.
 *
 * @param {string} slug        - The post slug (used for image directory).
 * @param {string} prompt      - The image generation prompt.
 * @param {string} seoFilename - SEO-friendly filename (without extension).
 * @param {Object} [options]   - Additional options (aspectRatio, resolution, etc.).
 * @returns {Promise<{success: boolean, image: {path: string, mdPath: string, alt: string, title: string, previewUrl: string, filename: string}}>}
 */
export async function generateImage(slug, prompt, seoFilename, options = {}) {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, prompt, seoFilename, ...options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Image generation failed');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Translation API wrappers
// ---------------------------------------------------------------------------

/**
 * Check translation status for an article.
 * @param {string} slug
 * @returns {Promise<{slug: string, sourceLang: string, defaultTargets: string[], translations: Object, charsEstimate: number}>}
 */
export async function getTranslationStatus(slug) {
  const res = await fetch(`/api/translation-status/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get translation status');
  }
  return res.json();
}

/**
 * Estimate character cost for translation.
 * @param {string} slug
 * @param {string[]} targetLangs
 * @returns {Promise<{charsPerLang: number, totalEstimate: number, quota: Object}>}
 */
export async function estimateTranslation(slug, targetLangs) {
  const res = await fetch('/api/estimate-translation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, targetLangs }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Estimation failed');
  }
  return res.json();
}

/**
 * Translate an article to one or more languages.
 * @param {string} slug
 * @param {string[]} targetLangs - Short codes like ['en', 'cs']
 * @param {Object} [options]
 * @param {string} [options.sourceLang]
 * @param {string} [options.formality]
 * @returns {Promise<{translations: Array<{lang: string, content: string, billedChars: number}>, totalBilledChars: number}>}
 */
export async function translateArticle(slug, targetLangs, options = {}) {
  const res = await fetch('/api/translate-article', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, targetLangs, ...options }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Translation failed');
  }
  return res.json();
}

/**
 * Save a translated article.
 * @param {string} slug
 * @param {string} lang - Short language code (e.g. 'en', 'cs')
 * @param {string} content - Full markdown content
 * @returns {Promise<{success: boolean, path: string}>}
 */
export async function saveTranslation(slug, lang, content) {
  const res = await fetch('/api/save-translation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, lang, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save translation');
  }
  return res.json();
}

/**
 * Get DeepL API usage statistics.
 * @returns {Promise<{count: number, limit: number, percent: number}>}
 */
export async function getDeeplUsage() {
  const res = await fetch('/api/deepl-usage');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get DeepL usage');
  }
  return res.json();
}
