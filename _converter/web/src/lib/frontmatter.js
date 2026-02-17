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

/**
 * Strip surrounding double quotes from a YAML value if present.
 * @param {string} val
 * @returns {string}
 */
function stripQuotes(val) {
  if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
  if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
  return val;
}

/**
 * Parse a full markdown file (with YAML front matter) back into its component parts.
 * This is the reverse of buildFrontmatter() + body concatenation.
 *
 * @param {string} raw - Full file content including front matter.
 * @returns {{ title: string, status: string, date: string, excerpt: string, categories: string[], tags: string[], featuredImage: string, metaTitle: string, metaDescription: string, body: string }}
 */
export function parseFrontmatter(raw) {
  const result = {
    title: '',
    status: 'draft',
    date: '',
    excerpt: '',
    categories: [],
    tags: [],
    featuredImage: '',
    metaTitle: '',
    metaDescription: '',
    body: '',
  };

  // Split front matter from body
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    // No front matter — treat everything as body
    result.body = raw.trim();
    return result;
  }

  const fmBlock = fmMatch[1];
  const afterFm = raw.slice(fmMatch[0].length);
  // Body starts after front matter, trim leading blank line
  result.body = afterFm.replace(/^\r?\n/, '').trimEnd();

  // Parse simple key-value fields
  const titleMatch = fmBlock.match(/^title:\s*(.+)$/m);
  if (titleMatch) result.title = stripQuotes(titleMatch[1].trim());

  const statusMatch = fmBlock.match(/^post_status:\s*(.+)$/m);
  if (statusMatch) result.status = statusMatch[1].trim();

  const dateMatch = fmBlock.match(/^post_date:\s*(.+)$/m);
  if (dateMatch) result.date = stripQuotes(dateMatch[1].trim());

  const excerptMatch = fmBlock.match(/^post_excerpt:\s*(.+)$/m);
  if (excerptMatch) result.excerpt = stripQuotes(excerptMatch[1].trim());

  const imgMatch = fmBlock.match(/^featured_image:\s*(.+)$/m);
  if (imgMatch) result.featuredImage = imgMatch[1].trim();

  // Parse taxonomy -> category and post_tag lists
  const catMatch = fmBlock.match(/^ {4}category:\n((?:^ {8}- .+\n?)*)/m);
  if (catMatch) {
    result.categories = [...catMatch[1].matchAll(/^ {8}- (.+)$/gm)].map(m => m[1].trim());
  }

  const tagMatch = fmBlock.match(/^ {4}post_tag:\n((?:^ {8}- .+\n?)*)/m);
  if (tagMatch) {
    result.tags = [...tagMatch[1].matchAll(/^ {8}- (.+)$/gm)].map(m => m[1].trim());
  }

  // Parse custom_fields -> meta_title and meta_description
  const metaTitleMatch = fmBlock.match(/^ {4}meta_title:\s*(.+)$/m);
  if (metaTitleMatch) result.metaTitle = stripQuotes(metaTitleMatch[1].trim());

  const metaDescMatch = fmBlock.match(/^ {4}meta_description:\s*(.+)$/m);
  if (metaDescMatch) result.metaDescription = stripQuotes(metaDescMatch[1].trim());

  return result;
}
