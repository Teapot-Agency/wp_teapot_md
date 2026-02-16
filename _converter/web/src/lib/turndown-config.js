/**
 * Configured Turndown (HTML-to-Markdown) instance with GFM support
 * and custom rules for cleaning up Google Docs / rich-text paste output.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Create a pre-configured TurndownService instance.
 * @returns {TurndownService}
 */
function createTurndownService() {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    blankReplacement(content, node) {
      // Keep blank lines between block-level elements
      if (node.isBlock) {
        return '\n\n';
      }
      return '';
    },
  });

  // GFM: tables, strikethrough, task lists
  td.use(gfm);

  // Strip Google Docs inline <span style="..."> wrappers — keep inner content
  td.addRule('stripGoogleSpans', {
    filter(node) {
      return (
        node.nodeName === 'SPAN' &&
        node.getAttribute('style') !== null
      );
    },
    replacement(content) {
      return content;
    },
  });

  // Remove <style> tags entirely
  td.addRule('removeStyleTags', {
    filter: ['style'],
    replacement() {
      return '';
    },
  });

  // Remove <meta> tags entirely
  td.addRule('removeMetaTags', {
    filter: ['meta'],
    replacement() {
      return '';
    },
  });

  return td;
}

// Singleton — created once per import
const turndownService = createTurndownService();

/**
 * Convert an HTML string to Markdown using the pre-configured Turndown instance.
 *
 * @param {string} html - The input HTML.
 * @returns {string} Markdown output.
 */
export default function htmlToMarkdown(html) {
  return turndownService.turndown(html);
}
