import express from 'express';
import cors from 'cors';
import { PORT, blogDir, imagesDir } from './server/config.js';

import blogRoutes from './server/routes/blog.js';
import imageRoutes from './server/routes/images.js';
import analysisRoutes from './server/routes/analysis.js';
import translationRoutes from './server/routes/translation.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Mount route modules
app.use(blogRoutes);
app.use(imageRoutes);
app.use(analysisRoutes);
app.use(translationRoutes);

// Start server
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
