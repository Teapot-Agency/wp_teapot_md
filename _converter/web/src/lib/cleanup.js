/**
 * Markdown post-processing / cleanup utilities.
 * Ported from Python converter.
 */

/**
 * If any H1 (`# ...`) exists in the body, demote every heading by one level.
 * @param {string} md
 * @returns {string}
 */
function fixHeadingHierarchy(md) {
  if (!/^# [^#]/m.test(md)) {
    return md;
  }
  return md
    .split('\n')
    .map((line) => {
      const match = line.match(/^(#{1,5}) (.+)$/);
      if (match) {
        return `#${match[1]} ${match[2]}`;
      }
      return line;
    })
    .join('\n');
}

/**
 * Replace Czech/Slovak typographic quotes, dashes, ellipses and non-breaking spaces
 * with their plain ASCII equivalents.
 * @param {string} md
 * @returns {string}
 */
function fixCzechTypography(md) {
  md = md.replace(/\u201e/g, '"').replace(/\u201c/g, '"');
  md = md.replace(/\u201d/g, '"');
  md = md.replace(/\u2018/g, "'").replace(/\u2019/g, "'");
  md = md.replace(/\s*\u2014\s*/g, ' -- ');
  md = md.replace(/\s*\u2013\s*/g, ' -- ');
  md = md.replace(/\u2026/g, '...');
  md = md.replace(/\u00a0/g, ' ');
  md = md.replace(/\u202f/g, ' ');
  return md;
}

/**
 * Normalise `*` and `+` list markers to `-`.
 * @param {string} md
 * @returns {string}
 */
function fixListFormatting(md) {
  return md.replace(/^(\s*)[*+] /gm, '$1- ');
}

/**
 * Collapse runs of 4+ consecutive newlines down to 3 (one blank line).
 * @param {string} md
 * @returns {string}
 */
function collapseBlankLines(md) {
  return md.replace(/\n{4,}/g, '\n\n\n');
}

/**
 * Remove unnecessary backslash escapes from headings.
 * Turndown escapes `1.` as `1\.` to prevent ordered-list interpretation,
 * but inside headings this is unnecessary and shows as a literal backslash.
 * @param {string} md
 * @returns {string}
 */
function fixHeadingEscapes(md) {
  return md.replace(/^(#{1,6} .*)\\(\.)/gm, '$1$2');
}

/**
 * Remove trailing whitespace from every line.
 * @param {string} md
 * @returns {string}
 */
function stripTrailingWhitespace(md) {
  return md
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

/**
 * Ensure the file ends with exactly one newline.
 * @param {string} md
 * @returns {string}
 */
function ensureFinalNewline(md) {
  return md.replace(/\n+$/, '') + '\n';
}

/**
 * Run the full cleanup pipeline on a markdown string.
 *
 * Order: heading hierarchy -> Czech typography -> list markers ->
 *        blank-line collapse -> trailing whitespace -> final newline.
 *
 * @param {string} md - Raw markdown text.
 * @returns {string} Cleaned-up markdown.
 */
export function cleanupMarkdown(md) {
  md = fixHeadingHierarchy(md);
  md = fixCzechTypography(md);
  md = fixListFormatting(md);
  md = fixHeadingEscapes(md);
  md = collapseBlankLines(md);
  md = stripTrailingWhitespace(md);
  md = ensureFinalNewline(md);
  return md;
}
