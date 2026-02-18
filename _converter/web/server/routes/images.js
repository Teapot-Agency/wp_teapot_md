import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { imagesDir, DEFAULT_STYLE_PREFIX } from '../config.js';
import {
  promptToFilename,
  promptToAlt,
  promptToTitle,
  generateImageWithRetry,
  processAndSaveImage,
} from '../image-utils.js';

const router = Router();

// POST /api/generate-image — generate an image with Gemini and save to _images/{slug}/
router.post('/api/generate-image', async (req, res) => {
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

// GET /api/images/:slug/:filename — serve an image from _images/{slug}/{filename}
router.get('/api/images/:slug/:filename', (req, res) => {
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

// GET /api/images/:slug — list all images in _images/{slug}/
router.get('/api/images/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    const slugDir = path.join(imagesDir, slug);
    if (!fs.existsSync(slugDir)) {
      return res.json({ images: [] });
    }
    const files = fs.readdirSync(slugDir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    const images = files.map(filename => ({
      filename,
      previewUrl: `/api/images/${slug}/${filename}`,
      path: `_images/${slug}/${filename}`,
      mdPath: `/_images/${slug}/${filename}`,
      alt: filename.replace(/\.[^.]+$/, '').replace(/-/g, ' '),
      title: '',
    }));
    res.json({ images });
  } catch (err) {
    console.error('Error listing images:', err.message);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

export default router;
