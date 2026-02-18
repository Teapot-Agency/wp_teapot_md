import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient as createDeepLClient } from '../src/lib/deepl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Absolute anchor: repo root is three levels up from server/
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// Load .env from repo root
dotenv.config({ path: path.join(repoRoot, '.env') });

export const PORT = 3001;
export const blogDir = path.join(repoRoot, 'blog');
export const imagesDir = path.join(repoRoot, '_images');

// AI model identifiers
export const MODEL_IMAGE = 'gemini-3-pro-image-preview';
export const MODEL_TEXT = 'gemini-2.5-flash-lite';
export const MODEL_THINKING = 'gemini-2.5-flash';

// Retry / image processing
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [1000, 2000, 4000];
export const MAX_IMAGE_WIDTH = 1600;

export const DEFAULT_STYLE_PREFIX =
  'Photorealistic, real-world photography style. Professional editorial photo ' +
  'for a healthcare and pharmaceutical marketing blog. Looks like a real ' +
  'photograph taken with a high-end camera. Natural lighting, realistic ' +
  'textures and materials. DO NOT include any text, words, letters, numbers, ' +
  'typography, watermarks, or logos in the image. ';

export const TRANSLATION_LANGS = ['en', 'cs', 'sk'];

// Initialize Gemini AI client (null if no API key — AI endpoints return 503)
export const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Initialize DeepL client (null if no API key — translation endpoints return 503)
export const deeplClient = process.env.DEEPL_API_KEY
  ? createDeepLClient(process.env.DEEPL_API_KEY)
  : null;
