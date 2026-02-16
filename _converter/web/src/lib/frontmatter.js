/**
 * YAML front matter builder for Git it Write markdown posts.
 * Ported from Python converter.
 */

/**
 * Pad a number to two digits.
 * @param {number} n
 * @returns {string}
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Return current local date/time as "YYYY-MM-DD HH:MM:SS".
 * @returns {string}
 */
function nowDateString() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * If the value contains a colon, wrap it in double quotes for valid YAML.
 * @param {string} value
 * @returns {string}
 */
function yamlValue(value) {
  return value.includes(':') ? `"${value}"` : value;
}

/**
 * Build a YAML front matter block for a WordPress markdown post.
 *
 * @param {Object} options
 * @param {string}   options.title             - Post title (required).
 * @param {string}   [options.status='draft']  - Post status: publish | draft | pending | future.
 * @param {string}   [options.date]            - Publish date as "YYYY-MM-DD HH:MM:SS". Defaults to now.
 * @param {string}   [options.excerpt]         - Short post excerpt.
 * @param {string[]} [options.categories]      - Category slugs.
 * @param {string[]} [options.tags]            - Tag slugs.
 * @param {string}   [options.featuredImage]   - Path to featured image in _images/.
 * @param {string}   [options.metaTitle]       - SEO meta title (custom_fields.meta_title).
 * @param {string}   [options.metaDescription] - SEO meta description (custom_fields.meta_description).
 * @returns {string} Complete front matter string including surrounding --- delimiters and trailing newline.
 */
export function buildFrontmatter({
  title,
  status = 'draft',
  date,
  excerpt,
  categories,
  tags,
  featuredImage,
  metaTitle,
  metaDescription,
} = {}) {
  const lines = ['---'];

  lines.push(`title: ${yamlValue(title)}`);
  lines.push(`post_status: ${status}`);
  lines.push(`post_date: ${date || nowDateString()}`);

  if (excerpt) {
    lines.push(`post_excerpt: ${yamlValue(excerpt)}`);
  }

  if (featuredImage) {
    lines.push(`featured_image: ${featuredImage}`);
  }

  if ((categories && categories.length) || (tags && tags.length)) {
    lines.push('taxonomy:');
    if (categories && categories.length) {
      lines.push('    category:');
      for (const cat of categories) {
        lines.push(`        - ${cat}`);
      }
    }
    if (tags && tags.length) {
      lines.push('    post_tag:');
      for (const tag of tags) {
        lines.push(`        - ${tag}`);
      }
    }
  }

  if (metaTitle || metaDescription) {
    lines.push('custom_fields:');
    if (metaTitle) {
      lines.push(`    meta_title: ${yamlValue(metaTitle)}`);
    }
    if (metaDescription) {
      lines.push(`    meta_description: ${yamlValue(metaDescription)}`);
    }
  }

  lines.push('---');
  return lines.join('\n') + '\n';
}
