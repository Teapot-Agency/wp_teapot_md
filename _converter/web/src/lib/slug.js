/**
 * Slovak/Czech slug generation.
 * Ported from Python converter — transliterates diacritics and normalises to URL-safe slug.
 */

const SK_CZ_MAP = {
  'á': 'a', 'č': 'c', 'ď': 'd', 'é': 'e', 'ě': 'e',
  'í': 'i', 'ĺ': 'l', 'ľ': 'l', 'ň': 'n', 'ó': 'o',
  'ô': 'o', 'ŕ': 'r', 'ř': 'r', 'š': 's', 'ť': 't',
  'ú': 'u', 'ů': 'u', 'ý': 'y', 'ž': 'z', 'ä': 'a',
  // uppercase
  'Á': 'a', 'Č': 'c', 'Ď': 'd', 'É': 'e', 'Ě': 'e',
  'Í': 'i', 'Ĺ': 'l', 'Ľ': 'l', 'Ň': 'n', 'Ó': 'o',
  'Ô': 'o', 'Ŕ': 'r', 'Ř': 'r', 'Š': 's', 'Ť': 't',
  'Ú': 'u', 'Ů': 'u', 'Ý': 'y', 'Ž': 'z', 'Ä': 'a',
};

/**
 * Generate a URL-safe slug from a title string.
 *
 * @param {string} title  - The human-readable title.
 * @param {number} [maxLength=60] - Maximum slug length (truncates on word boundary).
 * @returns {string} Lowercase, hyphen-separated slug.
 */
export function generateSlug(title, maxLength = 60) {
  let slug = title.toLowerCase();

  // Transliterate Slovak/Czech diacritics
  slug = Array.from(slug)
    .map((c) => SK_CZ_MAP[c] || c)
    .join('');

  // Replace any non-alphanumeric run with a single hyphen
  slug = slug.replace(/[^a-z0-9]+/g, '-');

  // Strip leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Truncate on a word (hyphen) boundary if too long
  if (slug.length > maxLength) {
    slug = slug.slice(0, maxLength);
    const lastHyphen = slug.lastIndexOf('-');
    if (lastHyphen > 0) {
      slug = slug.slice(0, lastHyphen);
    }
  }

  return slug;
}
