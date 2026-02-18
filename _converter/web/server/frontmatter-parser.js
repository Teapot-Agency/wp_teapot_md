import fs from 'fs';

// ---------------------------------------------------------------------------
// Blog listing helpers — parse front matter for /api/blog-files
// ---------------------------------------------------------------------------

/**
 * Extract listing-level metadata (title, status, date) from a blog file.
 * Returns { title, postStatus, postDate }.
 */
export function parseListingFields(filePath, fallbackSlug) {
  let title = fallbackSlug;
  let postStatus = '';
  let postDate = '';

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const titleMatch = fm.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        let t = titleMatch[1].trim();
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          t = t.slice(1, -1);
        }
        title = t;
      }
      const statusMatch = fm.match(/^post_status:\s*(.+)$/m);
      if (statusMatch) postStatus = statusMatch[1].trim();
      const dateMatch = fm.match(/^post_date:\s*(.+)$/m);
      if (dateMatch) {
        let d = dateMatch[1].trim();
        if ((d.startsWith('"') && d.endsWith('"')) || (d.startsWith("'") && d.endsWith("'"))) {
          d = d.slice(1, -1);
        }
        postDate = d;
      }
    }
  } catch { /* ignore read errors for individual files */ }

  return { title, postStatus, postDate };
}

// ---------------------------------------------------------------------------
// Category / tag extraction helpers — for /api/categories
// ---------------------------------------------------------------------------

/**
 * Extract categories and tags from the front matter of a single file's content string.
 * Mutates the provided Sets.
 */
export function extractTaxonomy(content, categoriesSet, tagsSet) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  const frontMatter = fmMatch[1];

  const catMatch = frontMatter.match(/^ {4}category:\n((?:^ {8}- .+\n?)*)/m);
  if (catMatch) {
    const catLines = catMatch[1].matchAll(/^ {8}- (.+)$/gm);
    for (const m of catLines) {
      categoriesSet.add(m[1].trim());
    }
  }

  const tagMatch = frontMatter.match(/^ {4}post_tag:\n((?:^ {8}- .+\n?)*)/m);
  if (tagMatch) {
    const tagLines = tagMatch[1].matchAll(/^ {8}- (.+)$/gm);
    for (const m of tagLines) {
      tagsSet.add(m[1].trim());
    }
  }
}
