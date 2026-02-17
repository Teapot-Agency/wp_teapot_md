import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import {
  createClient as createDeepLClient,
  translateTexts,
  getUsage as getDeepLUsage,
  getDefaultTargets,
  LANG_NAMES,
  DEEPL_TO_DIR,
  DISPLAY_TO_DEEPL,
} from './src/lib/deepl.js';
import {
  extractTranslatableSegments,
  reassembleTranslation,
  countTranslatableChars,
  humanizeSlug,
} from './src/lib/translation.js';
import { generateSlug } from './src/lib/slug.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const app = express();
const PORT = 3001;

const blogDir = path.resolve(__dirname, '..', '..', 'blog');
const imagesDir = path.resolve(__dirname, '..', '..', '_images');

// Initialize Gemini AI client (null if no API key — AI endpoints return 503)
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Initialize DeepL client (null if no API key — translation endpoints return 503)
const deeplClient = process.env.DEEPL_API_KEY
  ? createDeepLClient(process.env.DEEPL_API_KEY)
  : null;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// Constants (ported from Python lib/gemini.py)
// ---------------------------------------------------------------------------

const MODEL_IMAGE = 'gemini-3-pro-image-preview';
const MODEL_TEXT = 'gemini-2.5-flash-lite';
const MODEL_THINKING = 'gemini-2.5-flash'; // thinking model for language quality analysis
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const MAX_IMAGE_WIDTH = 1600;
const DEFAULT_STYLE_PREFIX =
  'Photorealistic, real-world photography style. Professional editorial photo ' +
  'for a healthcare and pharmaceutical marketing blog. Looks like a real ' +
  'photograph taken with a high-end camera. Natural lighting, realistic ' +
  'textures and materials. DO NOT include any text, words, letters, numbers, ' +
  'typography, watermarks, or logos in the image. ';

// ---------------------------------------------------------------------------
// Helper functions (ported from Python generate_images.py)
// ---------------------------------------------------------------------------

function promptToFilename(prompt, maxLen = 60) {
  let slug = prompt.toLowerCase().trim();
  slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length > maxLen) {
    slug = slug.slice(0, maxLen).replace(/-[^-]*$/, '');
  }
  return slug || 'gen-001';
}

function promptToAlt(prompt, maxLen = 125) {
  let alt = prompt.trim().replace(/\.+$/, '');
  if (alt && alt[0] === alt[0].toLowerCase()) {
    alt = alt[0].toUpperCase() + alt.slice(1);
  }
  if (alt.length > maxLen) {
    alt = alt.slice(0, maxLen - 3).replace(/\s+\S*$/, '') + '...';
  }
  return alt;
}

function promptToTitle(prompt, maxLen = 200) {
  let title = prompt.trim().replace(/\.+$/, '');
  if (title && title[0] === title[0].toLowerCase()) {
    title = title[0].toUpperCase() + title.slice(1);
  }
  if (title.length > maxLen) {
    title = title.slice(0, maxLen - 3).replace(/\s+\S*$/, '') + '...';
  }
  return title;
}

// ---------------------------------------------------------------------------
// Image generation with retry (ported from Python lib/gemini.py)
// ---------------------------------------------------------------------------

async function generateImageWithRetry(prompt, { stylePrefix = DEFAULT_STYLE_PREFIX, aspectRatio = '16:9' } = {}) {
  const fullPrompt = stylePrefix ? `${stylePrefix}${prompt}` : prompt;
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_IMAGE,
        contents: fullPrompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio, imageSize: '1K' },
        },
      });
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
      throw new Error('No image data in API response');
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }
  throw new Error(`Image generation failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

// ---------------------------------------------------------------------------
// Image processing with sharp (ported from Python lib/images.py)
// ---------------------------------------------------------------------------

async function processAndSaveImage(imageBuffer, outputPath) {
  const metadata = await sharp(imageBuffer).metadata();
  let pipeline = sharp(imageBuffer);
  if (metadata.width > MAX_IMAGE_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_IMAGE_WIDTH });
  }
  if (metadata.hasAlpha) {
    const pngPath = outputPath.replace(/\.jpg$/, '.png');
    await pipeline.png().toFile(pngPath);
    return pngPath;
  }
  await pipeline.jpeg({ quality: 85 }).toFile(outputPath);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Existing endpoints
// ---------------------------------------------------------------------------

// GET /api/blog-files — list .md filenames in blog/
app.get('/api/blog-files', (req, res) => {
  try {
    const files = fs.readdirSync(blogDir)
      .filter(f => f.endsWith('.md'));
    res.json(files);
  } catch (err) {
    console.error('Error reading blog directory:', err.message);
    res.status(500).json({ error: 'Failed to read blog directory' });
  }
});

// GET /api/categories — extract unique categories and tags from all blog .md files
app.get('/api/categories', (req, res) => {
  try {
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

    const categories = new Set();
    const tags = new Set();

    for (const file of files) {
      const content = fs.readFileSync(path.join(blogDir, file), 'utf-8');

      // Extract front matter between first --- and second ---
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const frontMatter = fmMatch[1];

      // Extract categories: lines matching "        - slug" under "    category:"
      const catMatch = frontMatter.match(/^ {4}category:\n((?:^ {8}- .+\n?)*)/m);
      if (catMatch) {
        const catLines = catMatch[1].matchAll(/^ {8}- (.+)$/gm);
        for (const m of catLines) {
          categories.add(m[1].trim());
        }
      }

      // Extract tags: lines matching "        - slug" under "    post_tag:"
      const tagMatch = frontMatter.match(/^ {4}post_tag:\n((?:^ {8}- .+\n?)*)/m);
      if (tagMatch) {
        const tagLines = tagMatch[1].matchAll(/^ {8}- (.+)$/gm);
        for (const m of tagLines) {
          tags.add(m[1].trim());
        }
      }
    }

    res.json({
      categories: [...categories].sort(),
      tags: [...tags].sort()
    });
  } catch (err) {
    console.error('Error extracting categories:', err.message);
    res.status(500).json({ error: 'Failed to extract categories' });
  }
});

// GET /api/blog-files/:slug — read a single blog .md file content
app.get('/api/blog-files/:slug', (req, res) => {
  try {
    const { slug } = req.params;

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid slug format' });
    }

    const filePath = path.join(blogDir, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File ${slug}.md not found` });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ slug, content });
  } catch (err) {
    console.error('Error reading blog file:', err.message);
    res.status(500).json({ error: 'Failed to read blog file' });
  }
});

// POST /api/save — save markdown content to blog/{slug}.md
app.post('/api/save', (req, res) => {
  try {
    const { slug, content } = req.body;
    const overwrite = req.query.overwrite === 'true';

    // Validate slug
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'slug is required' });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'slug must contain only lowercase letters, numbers, and hyphens' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const filePath = path.join(blogDir, `${slug}.md`);

    // Check for existing file unless overwrite is requested
    if (!overwrite && fs.existsSync(filePath)) {
      return res.status(409).json({ error: 'File already exists' });
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    res.json({ success: true, path: `blog/${slug}.md` });
  } catch (err) {
    console.error('Error saving file:', err.message);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// ---------------------------------------------------------------------------
// New endpoints
// ---------------------------------------------------------------------------

// POST /api/generate-image — generate an image with Gemini and save to _images/{slug}/
app.post('/api/generate-image', async (req, res) => {
  try {
    const { slug, prompt, seoFilename, aspectRatio, useStylePrefix } = req.body;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'slug is required' });
    }
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const filename = seoFilename || promptToFilename(prompt);
    const stylePrefix = useStylePrefix === false ? '' : DEFAULT_STYLE_PREFIX;

    const imageBuffer = await generateImageWithRetry(prompt, {
      stylePrefix,
      aspectRatio: aspectRatio || '16:9',
    });

    // Create directory if needed
    const slugDir = path.join(imagesDir, slug);
    if (!fs.existsSync(slugDir)) {
      fs.mkdirSync(slugDir, { recursive: true });
    }

    const outputPath = path.join(slugDir, `${filename}.jpg`);
    const savedPath = await processAndSaveImage(imageBuffer, outputPath);
    const savedFilename = path.basename(savedPath);

    res.json({
      success: true,
      image: {
        path: `_images/${slug}/${savedFilename}`,
        mdPath: `/_images/${slug}/${savedFilename}`,
        alt: promptToAlt(prompt),
        title: promptToTitle(prompt),
        filename: savedFilename,
        previewUrl: `/api/images/${slug}/${savedFilename}`,
      },
    });
  } catch (err) {
    console.error('Error generating image:', err.message);
    res.status(500).json({ error: `Image generation failed: ${err.message}` });
  }
});

// POST /api/analyze-article — analyze article and return meta, slug, image prompts
app.post('/api/analyze-article', async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const contentTrimmed = content.slice(0, 2500);

    // Extract all headings (keep # marks for hierarchy context)
    const headings = content.match(/^#{1,6} .+$/gm) || [];
    const headingsBlock = headings.join('\n');

    // --- Call 1: SEO + Images (cheap flash-lite model) ---
    const seoPromise = ai.models.generateContent({
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

    // --- Call 2: Language Quality Check (thinking model for deep analysis) ---
    const langPromise = ai.models.generateContent({
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

    // Run both calls in parallel
    const [seoResponse, langResponse] = await Promise.all([
      seoPromise,
      langPromise.catch((err) => {
        console.error('[analyze] Language check failed:', err.message);
        return null; // Don't fail the whole analysis if language check errors
      }),
    ]);

    // Parse SEO result (critical path)
    let seoText = seoResponse.text.trim();
    seoText = seoText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    const parsed = JSON.parse(seoText);

    if (!parsed.metaTitle || !parsed.metaDescription || !parsed.slug || !parsed.featuredImage || !parsed.bodyImages) {
      throw new Error('Incomplete response from AI model');
    }

    // Parse language check result (optional — graceful fallback)
    let detectedLanguage = '';
    let languageCorrections = [];
    if (langResponse) {
      try {
        // Log thinking parts from the reasoning model
        const parts = langResponse.candidates?.[0]?.content?.parts || [];
        console.log('[analyze] Response parts:', parts.length);
        for (const part of parts) {
          if (part.thought) {
            console.log('[analyze] 🧠 Thinking:\n' + part.text);
          }
        }

        let langText = langResponse.text.trim();
        console.log('[analyze] 📝 Language check output:\n' + langText);
        langText = langText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        const langParsed = JSON.parse(langText);
        detectedLanguage = langParsed.detectedLanguage || '';
        languageCorrections = Array.isArray(langParsed.languageCorrections) ? langParsed.languageCorrections : [];
      } catch (langErr) {
        console.error('[analyze] Failed to parse language check response:', langErr.message);
      }
    }

    parsed.detectedLanguage = detectedLanguage;
    parsed.languageCorrections = languageCorrections;

    console.log('[analyze] lang:', detectedLanguage, 'corrections:', languageCorrections.length);

    res.json(parsed);
  } catch (err) {
    console.error('Error analyzing article:', err.message);
    res.status(500).json({ error: `Article analysis failed: ${err.message}` });
  }
});

// GET /api/images/:slug/:filename — serve an image from _images/{slug}/{filename}
app.get('/api/images/:slug/:filename', (req, res) => {
  try {
    const { slug, filename } = req.params;
    const resolvedPath = path.resolve(imagesDir, slug, filename);

    // Prevent directory traversal
    if (!resolvedPath.startsWith(imagesDir)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Error serving image:', err.message);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// ---------------------------------------------------------------------------
// Translation endpoints (DeepL)
// ---------------------------------------------------------------------------

const TRANSLATION_LANGS = ['en', 'cs', 'sk'];

// GET /api/translation-status/:slug — check which translations exist
app.get('/api/translation-status/:slug', (req, res) => {
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
      else if (/[áčďéíňóšťúýž]/i.test(text)) sourceLang = 'SK'; // Slovak more likely for this project
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
app.post('/api/estimate-translation', async (req, res) => {
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
app.post('/api/translate-article', async (req, res) => {
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
      // Convert short codes to DeepL codes
      const deeplTarget = DISPLAY_TO_DEEPL[targetLang.toLowerCase()] || targetLang.toUpperCase();
      const dirCode = DEEPL_TO_DIR[deeplTarget] || targetLang.toLowerCase();

      // Build batch of all translatable texts
      const batch = [];
      const indices = { title: -1, excerpt: -1, bodyStart: -1, bodyEnd: -1, catsStart: -1, catsEnd: -1, tagsStart: -1, tagsEnd: -1, altsStart: -1, altsEnd: -1, titlesStart: -1, titlesEnd: -1 };

      // Title
      if (segments.title) {
        indices.title = batch.length;
        batch.push(segments.title);
      }

      // Excerpt
      if (segments.excerpt) {
        indices.excerpt = batch.length;
        batch.push(segments.excerpt);
      }

      // Body
      if (segments.body) {
        indices.bodyStart = batch.length;
        batch.push(segments.body);
        indices.bodyEnd = batch.length;
      }

      // Taxonomy terms (humanized)
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

      // Image alt texts
      if (segments.imageAlts.length) {
        indices.altsStart = batch.length;
        for (const alt of segments.imageAlts) batch.push(alt);
        indices.altsEnd = batch.length;
      }

      // Image titles
      if (segments.imageTitles.length) {
        indices.titlesStart = batch.length;
        for (const title of segments.imageTitles) batch.push(title);
        indices.titlesEnd = batch.length;
      }

      if (batch.length === 0) {
        results.push({ lang: dirCode, deeplLang: deeplTarget, content: '', billedChars: 0, error: 'No translatable content' });
        continue;
      }

      // Translate the batch
      const deeplSource = sourceLang ? (DISPLAY_TO_DEEPL[sourceLang.toLowerCase()] || sourceLang.toUpperCase()) : null;
      const translated = await translateTexts(deeplClient, batch, deeplTarget, deeplSource, { formality });

      totalBilledChars += translated.billedChars;

      // Extract results back into structure
      const translatedTitle = indices.title >= 0 ? translated.texts[indices.title] : segments.title;
      const translatedExcerpt = indices.excerpt >= 0 ? translated.texts[indices.excerpt] : '';
      const translatedBody = indices.bodyStart >= 0 ? translated.texts[indices.bodyStart] : segments.body;

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

      // Reassemble full translated article
      const fullContent = reassembleTranslation(
        segments,
        {
          title: translatedTitle,
          excerpt: translatedExcerpt,
          body: translatedBody,
          categories: translatedCats,
          tags: translatedTags,
          imageAlts: translatedAlts,
          imageTitles: translatedTitles,
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
app.post('/api/save-translation', (req, res) => {
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
app.get('/api/deepl-usage', async (req, res) => {
  try {
    if (!deeplClient) return res.status(503).json({ error: 'DEEPL_API_KEY is not configured' });
    const usage = await getDeepLUsage(deeplClient);
    res.json(usage);
  } catch (err) {
    console.error('Error fetching DeepL usage:', err.message);
    res.status(500).json({ error: `Failed to fetch usage: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Blog directory: ${blogDir}`);
  console.log(`Images directory: ${imagesDir}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. Image generation and AI features will be unavailable.');
  }
  if (!process.env.DEEPL_API_KEY) {
    console.warn('WARNING: DEEPL_API_KEY is not set. Translation features will be unavailable.');
  }
});
