/**
 * Translation orchestration — extracts translatable segments from a markdown
 * article, reassembles the translated version, and handles front matter.
 *
 * Used server-side (imported by server.js endpoints).
 */

import { generateSlug } from './slug.js';

// ---------------------------------------------------------------------------
// Front matter parsing
// ---------------------------------------------------------------------------

const FM_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * Split a markdown file into raw YAML front matter and body.
 * @param {string} raw - Full file contents.
 * @returns {{ yaml: string, body: string } | null}
 */
export function splitFrontmatter(raw) {
  const m = raw.match(FM_RE);
  if (!m) return null;
  return { yaml: m[1], body: m[2] };
}

/**
 * Primitive YAML field extractor — good enough for our flat/shallow YAML.
 * Returns the string value of a top-level scalar field.
 * @param {string} yaml
 * @param {string} field
 * @returns {string}
 */
function yamlField(yaml, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const m = yaml.match(re);
  if (!m) return '';
  let val = m[1].trim();
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return val;
}

/**
 * Extract taxonomy terms (categories and tags) from YAML.
 * Returns arrays of slug strings.
 */
function yamlTaxonomy(yaml) {
  const categories = [];
  const tags = [];

  const catMatch = yaml.match(/category:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (catMatch) {
    for (const line of catMatch[1].split('\n')) {
      const m = line.match(/^\s+-\s+(.+)/);
      if (m) categories.push(m[1].trim());
    }
  }

  const tagMatch = yaml.match(/post_tag:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (tagMatch) {
    for (const line of tagMatch[1].split('\n')) {
      const m = line.match(/^\s+-\s+(.+)/);
      if (m) tags.push(m[1].trim());
    }
  }

  return { categories, tags };
}

// ---------------------------------------------------------------------------
// Image reference extraction
// ---------------------------------------------------------------------------

const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g;

/**
 * Extract all image references from markdown body.
 * @param {string} body
 * @returns {{ alt: string, path: string, title: string, fullMatch: string }[]}
 */
export function extractImageRefs(body) {
  const refs = [];
  let m;
  const re = new RegExp(IMAGE_RE.source, IMAGE_RE.flags);
  while ((m = re.exec(body)) !== null) {
    refs.push({
      alt: m[1] || '',
      path: m[2],
      title: m[3] || '',
      fullMatch: m[0],
    });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Extract translatable segments
// ---------------------------------------------------------------------------

/**
 * Extract all translatable text segments from a markdown article.
 *
 * @param {string} raw - Full markdown file content (with front matter).
 * @returns {{ title: string, excerpt: string, body: string, categories: string[], tags: string[], imageAlts: string[], imageTitles: string[], featuredImage: string, postStatus: string, postDate: string, yaml: string } | null}
 */
export function extractTranslatableSegments(raw) {
  const split = splitFrontmatter(raw);
  if (!split) return null;

  const { yaml, body } = split;
  const title = yamlField(yaml, 'title');
  const excerpt = yamlField(yaml, 'post_excerpt');
  const featuredImage = yamlField(yaml, 'featured_image');
  const postStatus = yamlField(yaml, 'post_status') || 'publish';
  const postDate = yamlField(yaml, 'post_date');
  const { categories, tags } = yamlTaxonomy(yaml);

  const imageRefs = extractImageRefs(body);
  const imageAlts = imageRefs.map((r) => r.alt).filter(Boolean);
  const imageTitles = imageRefs.map((r) => r.title).filter(Boolean);

  return {
    title,
    excerpt,
    body,
    categories,
    tags,
    imageAlts,
    imageTitles,
    featuredImage,
    postStatus,
    postDate,
    yaml,
  };
}

// ---------------------------------------------------------------------------
// Reassemble translated article
// ---------------------------------------------------------------------------

/**
 * Wrap value in YAML double quotes if it contains colons or special chars.
 */
function yamlValue(value) {
  if (value.includes(':') || value.includes('#') || value.includes('"')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Build translated front matter.
 */
function buildTranslatedFrontmatter({
  title,
  postStatus,
  postDate,
  excerpt,
  categories,
  tags,
  featuredImage,
  translationGroup,
  translationLang,
}) {
  const lines = ['---'];

  lines.push(`title: ${yamlValue(title)}`);
  lines.push(`post_status: ${postStatus}`);
  if (postDate) lines.push(`post_date: ${postDate}`);
  if (excerpt) lines.push(`post_excerpt: ${yamlValue(excerpt)}`);
  if (featuredImage) lines.push(`featured_image: ${featuredImage}`);

  if (categories.length || tags.length) {
    lines.push('taxonomy:');
    if (categories.length) {
      lines.push('    category:');
      for (const cat of categories) lines.push(`        - ${cat}`);
    }
    if (tags.length) {
      lines.push('    post_tag:');
      for (const tag of tags) lines.push(`        - ${tag}`);
    }
  }

  lines.push('custom_fields:');
  lines.push(`    _translation_group: ${translationGroup}`);
  lines.push(`    _translation_lang: ${translationLang}`);

  lines.push('---');
  return lines.join('\n') + '\n';
}

/**
 * Replace image alt texts and titles in the markdown body with translated versions.
 *
 * @param {string} body - Original markdown body.
 * @param {string[]} translatedAlts - Translated alt texts (same order as extractImageRefs).
 * @param {string[]} translatedTitles - Translated title texts.
 * @returns {string}
 */
export function replaceImageAltTitle(body, translatedAlts, translatedTitles) {
  let altIdx = 0;
  let titleIdx = 0;

  return body.replace(
    new RegExp(IMAGE_RE.source, IMAGE_RE.flags),
    (match, origAlt, path, origTitle) => {
      const newAlt = origAlt ? (translatedAlts[altIdx++] || origAlt) : '';
      let newTitle = '';
      if (origTitle) {
        newTitle = translatedTitles[titleIdx++] || origTitle;
      }
      if (newTitle) {
        return `![${newAlt}](${path} "${newTitle}")`;
      }
      return `![${newAlt}](${path})`;
    },
  );
}

/**
 * Humanize a slug: replace hyphens with spaces.
 * @param {string} slug
 * @returns {string}
 */
export function humanizeSlug(slug) {
  return slug.replace(/-/g, ' ');
}

/**
 * Reassemble a fully translated markdown file.
 *
 * @param {Object} original - Output from extractTranslatableSegments().
 * @param {Object} translated - Object with translated strings.
 * @param {string} translated.title
 * @param {string} translated.excerpt
 * @param {string} translated.body
 * @param {string[]} translated.categories - Translated category slugs.
 * @param {string[]} translated.tags - Translated tag slugs.
 * @param {string[]} translated.imageAlts
 * @param {string[]} translated.imageTitles
 * @param {string} targetLangDir - Short language dir code (e.g. 'en', 'cs').
 * @param {string} sourceSlug - Original article slug (for _translation_group).
 * @returns {string} Full translated markdown file content.
 */
export function reassembleTranslation(original, translated, targetLangDir, sourceSlug) {
  const frontmatter = buildTranslatedFrontmatter({
    title: translated.title,
    postStatus: original.postStatus,
    postDate: original.postDate,
    excerpt: translated.excerpt,
    categories: translated.categories,
    tags: translated.tags,
    featuredImage: original.featuredImage,
    translationGroup: sourceSlug,
    translationLang: targetLangDir,
  });

  const body = replaceImageAltTitle(
    translated.body,
    translated.imageAlts,
    translated.imageTitles,
  );

  return frontmatter + '\n' + body;
}

/**
 * Count total characters across all translatable segments.
 * Used for estimation before calling the API.
 *
 * @param {Object} segments - Output from extractTranslatableSegments().
 * @returns {number}
 */
export function countTranslatableChars(segments) {
  let total = 0;
  total += (segments.title || '').length;
  total += (segments.excerpt || '').length;
  total += (segments.body || '').length;
  for (const term of [...segments.categories, ...segments.tags]) {
    total += humanizeSlug(term).length;
  }
  for (const alt of segments.imageAlts) total += alt.length;
  for (const title of segments.imageTitles) total += title.length;
  return total;
}
