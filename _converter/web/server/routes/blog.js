import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { blogDir } from '../config.js';
import { parseListingFields, extractTaxonomy } from '../frontmatter-parser.js';

const router = Router();

// GET /api/blog-files — list blog .md files with metadata, sorted by modification date (newest first)
router.get('/api/blog-files', (req, res) => {
  try {
    const filenames = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));
    const langDirs = ['en', 'cs', 'sk', 'de', 'fr', 'es', 'pl', 'hu'];

    const files = filenames.map(filename => {
      const slug = filename.replace(/\.md$/, '');
      const filePath = path.join(blogDir, filename);
      const stat = fs.statSync(filePath);

      const { title, postStatus, postDate } = parseListingFields(filePath, slug);

      // Check which translation subdirectories have this slug
      const languages = langDirs.filter(lang => {
        const langFile = path.join(blogDir, lang, `${slug}.md`);
        return fs.existsSync(langFile);
      });

      return {
        filename,
        slug,
        title,
        status: postStatus,
        postDate,
        modified: stat.mtime.toISOString(),
        languages,
      };
    });

    // Sort by file modification date, newest first
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    console.error('Error reading blog directory:', err.message);
    res.status(500).json({ error: 'Failed to read blog directory' });
  }
});

// GET /api/categories — extract unique categories and tags from all blog .md files
router.get('/api/categories', (req, res) => {
  try {
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

    const categories = new Set();
    const tags = new Set();

    for (const file of files) {
      const content = fs.readFileSync(path.join(blogDir, file), 'utf-8');
      extractTaxonomy(content, categories, tags);
    }

    res.json({
      categories: [...categories].sort(),
      tags: [...tags].sort(),
    });
  } catch (err) {
    console.error('Error extracting categories:', err.message);
    res.status(500).json({ error: 'Failed to extract categories' });
  }
});

// GET /api/blog-files/:slug — read a single blog .md file content
router.get('/api/blog-files/:slug', (req, res) => {
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

// GET /api/blog-files/:slug/:lang — read a translation file from blog/{lang}/{slug}.md
router.get('/api/blog-files/:slug/:lang', (req, res) => {
  try {
    const { slug, lang } = req.params;

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Invalid slug format' });
    }
    if (!/^[a-z]{2,5}$/.test(lang)) {
      return res.status(400).json({ error: 'Invalid language code' });
    }

    const filePath = path.join(blogDir, lang, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Translation not found: blog/${lang}/${slug}.md` });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ slug, lang, content });
  } catch (err) {
    console.error('Error reading translation:', err.message);
    res.status(500).json({ error: 'Failed to read translation' });
  }
});

// POST /api/save — save markdown content to blog/{slug}.md
router.post('/api/save', (req, res) => {
  try {
    const { slug, content } = req.body;
    const overwrite = req.query.overwrite === 'true';

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

export default router;
