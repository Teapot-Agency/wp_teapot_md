import { Router } from 'express';
import { ai } from '../config.js';
import { buildSeoPrompt, buildLanguageCheckPrompt } from '../prompts.js';

const router = Router();

// POST /api/analyze-article — analyze article and return meta, slug, image prompts
router.post('/api/analyze-article', async (req, res) => {
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
    const seoPromise = buildSeoPrompt(ai, title, contentTrimmed);

    // --- Call 2: Language Quality Check (thinking model for deep analysis) ---
    const langPromise = buildLanguageCheckPrompt(ai, title, headingsBlock, content);

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

export default router;
