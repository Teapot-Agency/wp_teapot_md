import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { blogDir, deeplClient, TRANSLATION_LANGS } from '../config.js';
import {
  translateTexts,
  getUsage as getDeepLUsage,
  getDefaultTargets,
  DEEPL_TO_DIR,
  DISPLAY_TO_DEEPL,
} from '../../src/lib/deepl.js';
import {
  extractTranslatableSegments,
  reassembleTranslation,
  countTranslatableChars,
  humanizeSlug,
} from '../../src/lib/translation.js';
import { generateSlug } from '../../src/lib/slug.js';

const router = Router();

// ---------------------------------------------------------------------------
// Translation helpers — paragraph splitting & image protection
// ---------------------------------------------------------------------------

const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g;

/**
 * Split markdown body into paragraph-level chunks at blank lines.
 * Preserves code blocks (triple backticks) as single chunks.
 */
function splitMarkdownParagraphs(body) {
  const chunks = [];
  let current = '';
  let inCodeBlock = false;

  for (const line of body.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      current += (current ? '\n' : '') + line;
    } else if (!inCodeBlock && line.trim() === '') {
      if (current.trim()) chunks.push(current);
      current = '';
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

/**
 * Replace image markdown references with placeholders (__IMG_0__, etc.)
 * so they are not sent to DeepL.
 */
function stripImageReferences(body) {
  const images = [];
  const stripped = body.replace(IMAGE_MD_RE, (match, alt, imgPath, title) => {
    const idx = images.length;
    images.push({ alt, path: imgPath, title: title || '' });
    return `__IMG_${idx}__`;
  });
  return { stripped, images };
}

/**
 * Replace __IMG_N__ placeholders with image markdown, using translated
 * alt texts and titles.
 */
function reinsertImages(body, images, translatedAlts, translatedTitles) {
  let altIdx = 0;
  let titleIdx = 0;
  return body.replace(/__IMG_(\d+)__/g, (_, idxStr) => {
    const img = images[parseInt(idxStr)];
    const alt = img.alt ? (translatedAlts[altIdx++] || img.alt) : '';
    const title = img.title ? (translatedTitles[titleIdx++] || img.title) : '';
    if (title) {
      return `![${alt}](${img.path} "${title}")`;
    }
    return `![${alt}](${img.path})`;
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/translation-status/:slug — check which translations exist
router.get('/api/translation-status/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const sourceFile = path.join(blogDir, `${slug}.md`);

    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: `Source article ${slug}.md not found` });
    }

    const sourceContent = fs.readFileSync(sourceFile, 'utf-8');
    const segments = extractTranslatableSegments(sourceContent);

    // Simple source language heuristic based on characters
    let sourceLang = 'EN';
    if (segments) {
      const text = segments.title + ' ' + (segments.excerpt || '');
      if (/[ôĺŕľ]/i.test(text)) sourceLang = 'SK';
      else if (/[ěřů]/i.test(text)) sourceLang = 'CS';
      else if (/[áčďéíňóšťúýž]/i.test(text)) sourceLang = 'SK';
    }

    const translations = {};
    for (const lang of TRANSLATION_LANGS) {
      const langFile = path.join(blogDir, lang, `${slug}.md`);
      if (fs.existsSync(langFile)) {
        const stat = fs.statSync(langFile);
        translations[lang] = { exists: true, modified: stat.mtime.toISOString() };
      } else {
        translations[lang] = { exists: false };
      }
    }

    res.json({
      slug,
      sourceLang,
      defaultTargets: getDefaultTargets(sourceLang).map((l) => DEEPL_TO_DIR[l] || l.toLowerCase()),
      translations,
      charsEstimate: segments ? countTranslatableChars(segments) : 0,
    });
  } catch (err) {
    console.error('Error checking translation status:', err.message);
    res.status(500).json({ error: 'Failed to check translation status' });
  }
});

// POST /api/estimate-translation — estimate character cost
router.post('/api/estimate-translation', async (req, res) => {
  try {
    const { slug, targetLangs } = req.body;

    if (!slug) return res.status(400).json({ error: 'slug is required' });
    if (!deeplClient) return res.status(503).json({ error: 'DEEPL_API_KEY is not configured' });

    const sourceFile = path.join(blogDir, `${slug}.md`);
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: `Source article ${slug}.md not found` });
    }

    const content = fs.readFileSync(sourceFile, 'utf-8');
    const segments = extractTranslatableSegments(content);
    if (!segments) return res.status(400).json({ error: 'Failed to parse article front matter' });

    const charsPerLang = countTranslatableChars(segments);
    const numLangs = (targetLangs || []).length || 2;
    const totalEstimate = charsPerLang * numLangs;

    const usage = await getDeepLUsage(deeplClient);

    res.json({
      slug,
      charsPerLang,
      numLangs,
      totalEstimate,
      quota: {
        used: usage.count,
        limit: usage.limit,
        remaining: usage.limit - usage.count,
        sufficient: (usage.limit - usage.count) >= totalEstimate,
        percent: usage.percent,
      },
    });
  } catch (err) {
    console.error('Error estimating translation:', err.message);
    res.status(500).json({ error: `Estimation failed: ${err.message}` });
  }
});

// POST /api/translate-article — translate an article to one or more languages
router.post('/api/translate-article', async (req, res) => {
  try {
    const { slug, targetLangs, sourceLang, formality } = req.body;

    if (!slug) return res.status(400).json({ error: 'slug is required' });
    if (!targetLangs || !targetLangs.length) return res.status(400).json({ error: 'targetLangs is required' });
    if (!deeplClient) return res.status(503).json({ error: 'DEEPL_API_KEY is not configured' });

    const sourceFile = path.join(blogDir, `${slug}.md`);
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: `Source article ${slug}.md not found` });
    }

    const content = fs.readFileSync(sourceFile, 'utf-8');
    const segments = extractTranslatableSegments(content);
    if (!segments) return res.status(400).json({ error: 'Failed to parse article front matter' });

    const results = [];
    let totalBilledChars = 0;

    for (const targetLang of targetLangs) {
      const deeplTarget = DISPLAY_TO_DEEPL[targetLang.toLowerCase()] || targetLang.toUpperCase();
      const dirCode = DEEPL_TO_DIR[deeplTarget] || targetLang.toLowerCase();

      const batch = [];
      const indices = { title: -1, excerpt: -1, bodyStart: -1, bodyEnd: -1, catsStart: -1, catsEnd: -1, tagsStart: -1, tagsEnd: -1, altsStart: -1, altsEnd: -1, titlesStart: -1, titlesEnd: -1 };

      if (segments.title) {
        indices.title = batch.length;
        batch.push(segments.title);
      }

      if (segments.excerpt) {
        indices.excerpt = batch.length;
        batch.push(segments.excerpt);
      }

      let strippedImages = [];
      if (segments.body) {
        const { stripped, images } = stripImageReferences(segments.body);
        strippedImages = images;
        const bodyChunks = splitMarkdownParagraphs(stripped);
        indices.bodyStart = batch.length;
        for (const chunk of bodyChunks) {
          batch.push(chunk);
        }
        indices.bodyEnd = batch.length;
      }

      if (segments.categories.length) {
        indices.catsStart = batch.length;
        for (const cat of segments.categories) batch.push(humanizeSlug(cat));
        indices.catsEnd = batch.length;
      }

      if (segments.tags.length) {
        indices.tagsStart = batch.length;
        for (const tag of segments.tags) batch.push(humanizeSlug(tag));
        indices.tagsEnd = batch.length;
      }

      if (segments.imageAlts.length) {
        indices.altsStart = batch.length;
        for (const alt of segments.imageAlts) batch.push(alt);
        indices.altsEnd = batch.length;
      }

      if (segments.imageTitles.length) {
        indices.titlesStart = batch.length;
        for (const title of segments.imageTitles) batch.push(title);
        indices.titlesEnd = batch.length;
      }

      if (batch.length === 0) {
        results.push({ lang: dirCode, deeplLang: deeplTarget, content: '', billedChars: 0, error: 'No translatable content' });
        continue;
      }

      const deeplSource = sourceLang ? (DISPLAY_TO_DEEPL[sourceLang.toLowerCase()] || sourceLang.toUpperCase()) : null;
      const translated = await translateTexts(deeplClient, batch, deeplTarget, deeplSource, { formality });

      totalBilledChars += translated.billedChars;

      const translatedTitle = indices.title >= 0 ? translated.texts[indices.title] : segments.title;
      const translatedExcerpt = indices.excerpt >= 0 ? translated.texts[indices.excerpt] : '';
      let translatedBody = indices.bodyStart >= 0
        ? translated.texts.slice(indices.bodyStart, indices.bodyEnd).join('\n\n')
        : segments.body;

      const translatedCats = indices.catsStart >= 0
        ? translated.texts.slice(indices.catsStart, indices.catsEnd).map((t) => generateSlug(t))
        : segments.categories;

      const translatedTags = indices.tagsStart >= 0
        ? translated.texts.slice(indices.tagsStart, indices.tagsEnd).map((t) => generateSlug(t))
        : segments.tags;

      const translatedAlts = indices.altsStart >= 0
        ? translated.texts.slice(indices.altsStart, indices.altsEnd)
        : [];

      const translatedTitles = indices.titlesStart >= 0
        ? translated.texts.slice(indices.titlesStart, indices.titlesEnd)
        : [];

      if (strippedImages.length > 0) {
        translatedBody = reinsertImages(translatedBody, strippedImages, translatedAlts, translatedTitles);
      }

      const fullContent = reassembleTranslation(
        segments,
        {
          title: translatedTitle,
          excerpt: translatedExcerpt,
          body: translatedBody,
          categories: translatedCats,
          tags: translatedTags,
          imageAlts: [],
          imageTitles: [],
        },
        dirCode,
        slug,
      );

      results.push({
        lang: dirCode,
        deeplLang: deeplTarget,
        content: fullContent,
        billedChars: translated.billedChars,
        detectedSourceLang: translated.detectedLang,
      });
    }

    res.json({ translations: results, totalBilledChars });
  } catch (err) {
    console.error('Error translating article:', err.message);
    res.status(500).json({ error: `Translation failed: ${err.message}` });
  }
});

// POST /api/save-translation — save a translated article to blog/{lang}/{slug}.md
router.post('/api/save-translation', (req, res) => {
  try {
    const { slug, lang, content } = req.body;

    if (!slug || !lang || !content) {
      return res.status(400).json({ error: 'slug, lang, and content are required' });
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid slug format' });
    }
    if (!/^[a-z]{2,5}$/.test(lang)) {
      return res.status(400).json({ error: 'Invalid language code' });
    }

    const langDir = path.join(blogDir, lang);
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir, { recursive: true });
    }

    const filePath = path.join(langDir, `${slug}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    res.json({ success: true, path: `blog/${lang}/${slug}.md` });
  } catch (err) {
    console.error('Error saving translation:', err.message);
    res.status(500).json({ error: 'Failed to save translation' });
  }
});

// GET /api/deepl-usage — get DeepL API character usage
router.get('/api/deepl-usage', async (req, res) => {
  try {
    if (!deeplClient) return res.status(503).json({ error: 'DEEPL_API_KEY is not configured' });
    const usage = await getDeepLUsage(deeplClient);
    res.json(usage);
  } catch (err) {
    console.error('Error fetching DeepL usage:', err.message);
    res.status(500).json({ error: `Failed to fetch usage: ${err.message}` });
  }
});

export default router;
