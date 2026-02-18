import { MODEL_TEXT, MODEL_THINKING } from './config.js';

/**
 * Build the SEO / image-prompt analysis request config.
 */
export function buildSeoPrompt(ai, title, contentTrimmed) {
  return ai.models.generateContent({
    model: MODEL_TEXT,
    contents: `You are an SEO and content specialist for a healthcare/pharmaceutical marketing blog.
Analyze the following article and generate:

1. metaTitle — SEO meta title, max 60 characters, compelling, includes primary keyword
2. metaDescription — SEO meta description, max 155 characters, includes call to action
3. slug — URL-friendly slug, lowercase, hyphens only, max 60 chars, transliterate diacritics (á→a, č→c, š→s, ž→z, ť→t, ď→d, ň→n, ľ→l, ĺ→l, ŕ→r, ô→o, ä→a, ř→r, ě→e, ů→u)
4. featuredImage — object with:
   - prompt: visual description for a FEATURED/HERO image (broad, thematic, blog header style), max 200 chars
   - seoFilename: SEO-friendly filename (lowercase, hyphens, 3-5 keywords, no extension)
5. bodyImages — array of exactly 2 objects, each with:
   - prompt: visual description for a SECTION image illustrating a specific concept from the article, max 200 chars
   - seoFilename: SEO-friendly filename
   - afterSection: the heading text this image should appear after

Image prompts MUST describe photorealistic, real-world photography scenes (like stock photos taken with a real camera).
Do NOT describe illustrations, cartoons, or animated styles.
Do NOT mention any text, words, letters, typography, or logos in prompts.
Focus on: real people, real objects, real environments, natural lighting, realistic textures.

Respond in the same language as the article for metaTitle, metaDescription, and slug.

Article title: ${title}
Article content (first 2500 chars):
${contentTrimmed}

Return ONLY valid JSON with no markdown formatting:
{"metaTitle": "...", "metaDescription": "...", "slug": "...", "featuredImage": {"prompt": "...", "seoFilename": "..."}, "bodyImages": [{"prompt": "...", "seoFilename": "...", "afterSection": "..."}, {"prompt": "...", "seoFilename": "...", "afterSection": "..."}]}`,
    config: { temperature: 0.7 },
  });
}

/**
 * Build the language quality check request config (thinking model).
 */
export function buildLanguageCheckPrompt(ai, title, headingsBlock, content) {
  return ai.models.generateContent({
    model: MODEL_THINKING,
    contents: `You are a professional proofreader and native-level language expert.
Analyze the following blog article. Check the title and ALL headings for language quality issues.

Read the full article to understand context, then evaluate each title/heading for naturalness.
Flag any phrase that:
- Is awkward, unnatural, or sounds like a bad machine translation
- Uses words in unusual collocations that don't make sense together
- Has grammatical errors (wrong case, wrong preposition, wrong word order)
- Is overly literal translation from another language
- Uses metaphors or expressions that don't work in the detected language

Think carefully about each phrase. Consider whether a native speaker would actually write this in a professional blog post.

Title: ${title}

Headings (with markdown hierarchy):
${headingsBlock}

Full article content:
${content}

Return ONLY valid JSON with no markdown formatting:
{"detectedLanguage": "sk|cs|en|...", "languageCorrections": [{"original": "exact text as it appears", "suggested": "corrected natural version", "reason": "brief explanation in English", "type": "heading|title"}]}

If everything sounds natural, return an empty languageCorrections array.`,
    config: {
      temperature: 0.2,
      thinkingConfig: { includeThoughts: true },
    },
  });
}
