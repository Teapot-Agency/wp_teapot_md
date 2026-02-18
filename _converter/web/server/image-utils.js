import sharp from 'sharp';
import {
  ai,
  MODEL_IMAGE,
  MAX_RETRIES,
  RETRY_DELAYS,
  MAX_IMAGE_WIDTH,
  DEFAULT_STYLE_PREFIX,
} from './config.js';

// ---------------------------------------------------------------------------
// Prompt → filename / alt / title helpers
// ---------------------------------------------------------------------------

export function promptToFilename(prompt, maxLen = 60) {
  let slug = prompt.toLowerCase().trim();
  slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length > maxLen) {
    slug = slug.slice(0, maxLen).replace(/-[^-]*$/, '');
  }
  return slug || 'gen-001';
}

export function promptToAlt(prompt, maxLen = 125) {
  let alt = prompt.trim().replace(/\.+$/, '');
  if (alt && alt[0] === alt[0].toLowerCase()) {
    alt = alt[0].toUpperCase() + alt.slice(1);
  }
  if (alt.length > maxLen) {
    alt = alt.slice(0, maxLen - 3).replace(/\s+\S*$/, '') + '...';
  }
  return alt;
}

export function promptToTitle(prompt, maxLen = 200) {
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
// Image generation with retry
// ---------------------------------------------------------------------------

export async function generateImageWithRetry(prompt, { stylePrefix = DEFAULT_STYLE_PREFIX, aspectRatio = '16:9' } = {}) {
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
// Image processing with sharp
// ---------------------------------------------------------------------------

export async function processAndSaveImage(imageBuffer, outputPath) {
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
