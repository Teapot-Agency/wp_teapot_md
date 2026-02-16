/**
 * Client-side fetch wrappers for the converter API endpoints.
 */

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
