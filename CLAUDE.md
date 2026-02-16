---
skip_file: yes
---

# Claude Instructions - Git it Write Content Repository

This repository is the content source for a WordPress site using the **Git it Write** plugin. Markdown files here are automatically converted to WordPress posts/pages.

## Before Creating or Editing Posts

1. **Read this file fully** before making any content changes
2. **Check existing structure** - run `ls -R` or use Glob to understand what content already exists
3. **Ask the user** about: post type, categories, tags, publish status, and where in the hierarchy the post belongs

## File & Folder Rules

### Naming
- **File name = post slug** (URL). Use lowercase, hyphens, no spaces: `my-new-post.md`
- Only `.md` files are published. All other files are ignored.
- Files/folders starting with `_` (underscore) or `.` (dot) are **never published**

### Folder Hierarchy
- Folders create parent-child post relationships
- A folder's own content comes from `index.md` inside it
- Example: `services/index.md` = the `/services/` page, `services/web-design.md` = `/services/web-design/`

### Images
- All images go in the `_images/` directory (can have subfolders)
- Reference in posts: `![alt text](/_images/my-image.jpg "Optional caption")`
- Images are uploaded to WordPress media library once and reused
- Remote/external image URLs are NOT supported for featured images

## Front Matter (YAML Header) - REQUIRED

Every `.md` file **must** start with YAML front matter between `---` delimiters. Field names are **case-sensitive**.

### Minimal Front Matter

```yaml
---
title: Post Title Here
post_status: publish
---
```

### Full Front Matter Reference

```yaml
---
title: Post Title Here
menu_order: 1
post_status: publish
post_excerpt: A short description of this post
post_date: 2025-01-15 10:00:00
comment_status: open
page_template: template-name
stick_post: no
featured_image: _images/hero.jpg
taxonomy:
    category:
        - category-slug-1
        - category-slug-2
    post_tag:
        - tag-1
        - tag-2
custom_fields:
    field1: value 1
    field2: value 2
skip_file: no
---
```

### Field Reference

| Field | Description | Values |
|-------|-------------|--------|
| `title` | Post title (displayed as H1) | Any string |
| `menu_order` | Sort order for pages | Integer |
| `post_status` | Publication status | `publish`, `draft`, `pending`, `future` |
| `post_excerpt` | Short summary/description | Any string |
| `post_date` | Publish date | `YYYY-MM-DD HH:MM:SS` |
| `comment_status` | Allow comments | `open`, `closed` |
| `page_template` | WordPress page template | Template filename |
| `stick_post` | Sticky post | `yes`, `no` |
| `featured_image` | Featured/hero image path | Path in `_images/` dir |
| `taxonomy` | Categories and tags | YAML mapping (see above) |
| `custom_fields` | Custom meta fields | YAML mapping |
| `skip_file` | Exclude from publishing | `yes` to skip |

## Writing Post Content

Content goes **after** the closing `---` of front matter.

### Markdown Syntax

Use standard markdown:

- `## Heading 2`, `### Heading 3` etc. (**NEVER use `#` H1** — the `title` field is H1; main sections MUST be `##` H2)
- `**bold**`, `*italic*`
- `[link text](url)` for links
- `![alt](/_images/file.jpg "caption")` for images
- `` `code` `` for inline code, triple backticks for code blocks
- `- item` or `1. item` for lists
- `> blockquote` for quotes
- `---` for horizontal rules (only outside front matter)

### Linking Between Posts

Use **relative links** to other `.md` files - the plugin converts them to proper WordPress URLs:

- Same directory: `[Link](./other-post.md)`
- Parent directory: `[Link](../other-post.md)`
- From root: `[Link](/folder/subfolder/post.md)`

### HTML and Shortcodes

- HTML can be used directly inside `.md` files
- WordPress shortcodes work as-is: `[shortcode_name attr="value"]`
- The `[giw_edit_link]` shortcode adds a "Edit this page" GitHub link

## Step-by-Step: Creating a New Post

1. **Determine location**: Where in the folder hierarchy does this post belong?
2. **Create the file**: `folder/post-slug.md` (or `folder/index.md` for folder page)
3. **Add front matter**: Always include at minimum `title` and `post_status`
4. **Write content**: Standard markdown after the front matter — main sections as `##` (H2)
5. **Add images**: Place images in `_images/`, reference with `/_images/filename.jpg`
6. **Run pre-push checks**: Validate before committing (see Pre-Push Validation below)

## Step-by-Step: Creating a New Section (Folder with Posts)

1. Create the folder: `new-section/`
2. Create `new-section/index.md` with front matter and content for the section landing page
3. Create child posts: `new-section/child-post.md`
4. Add images to `_images/` if needed

## Common Mistakes to Avoid

- **No front matter** - every file needs `---` delimited YAML at the top
- **Using tabs in YAML** - use spaces only for indentation
- **Spaces in filenames** - use hyphens: `my-post.md` not `my post.md`
- **Wrong heading hierarchy** — the `title` field is H1; main article sections MUST use `##` (H2), sub-sections use `###` (H3). Never use `#` (H1) in content, and never skip levels (e.g., going straight to `###` without `##` above it)
- **External featured images** - `featured_image` must point to a file in `_images/`
- **Forgetting `post_status`** - without it the post may not be visible
- **Renaming files** - this creates a NEW post (old one remains, must be deleted manually in WP)
- **Deleting files** - the WordPress post is NOT deleted automatically; manual cleanup needed

## Pre-Push Validation Checklist

**ALWAYS run these checks before committing/pushing any `.md` content changes.** Fix all issues before pushing.

### Automated checks (run from repo root)

```bash
# 1. Heading hierarchy: No H1 in content, main sections must be H2
for f in blog/*.md; do
    slug=$(basename "$f" .md); [ "$slug" = "index" ] && continue
    h1=$(grep -c '^# [^#]' "$f")
    h2=$(grep -c '^## [^#]' "$f")
    if [ "$h1" -gt 0 ]; then echo "ERROR: $slug has $h1 H1 heading(s) — use ## instead"; fi
    if [ "$h2" -eq 0 ]; then echo "WARNING: $slug has no H2 headings — main sections should use ##"; fi
done

# 2. Front matter: Every published .md must have title and post_status
for f in blog/*.md; do
    slug=$(basename "$f" .md)
    grep -q '^skip_file: yes' "$f" && continue
    grep -q '^title:' "$f" || echo "ERROR: $slug missing 'title' in front matter"
    grep -q '^post_status:' "$f" || echo "ERROR: $slug missing 'post_status' in front matter"
done

# 3. Featured image exists on disk
for f in blog/*.md; do
    slug=$(basename "$f" .md); [ "$slug" = "index" ] && continue
    img=$(grep '^featured_image:' "$f" | sed 's/featured_image: *//')
    if [ -n "$img" ] && [ ! -f "$img" ]; then echo "ERROR: $slug featured_image '$img' not found"; fi
done

# 4. No non-image files in _images/
find _images -type f ! -name '*.jpg' ! -name '*.jpeg' ! -name '*.png' ! -name '*.gif' ! -name '*.webp' | while read f; do
    echo "ERROR: Non-image file in _images/: $f (will break Git it Write sync)"
done
```

### Manual review checklist

- [ ] Heading hierarchy: `title` = H1, content starts with `##` (H2), sub-sections `###` (H3) — no skipped levels
- [ ] Front matter has at least `title` and `post_status`
- [ ] `featured_image` path matches an actual file in `_images/`
- [ ] Body image references (`![alt](path "title")`) have descriptive alt text and valid paths
- [ ] No `#` (H1) headings in content body
- [ ] No non-image files (`.gitkeep`, `.DS_Store`, etc.) in `_images/`
- [ ] Filename is lowercase, hyphens only, no spaces
- [ ] YAML uses spaces (no tabs)

## Rich Text to Markdown Converter (Web App)

The `_converter/web/` directory contains a local React + Express web app for converting rich text (pasted from Google Docs, Word, web pages, etc.) into properly formatted Markdown with YAML front matter.

### Running the Converter

```bash
cd _converter/web
npm install          # first time only
npm run dev          # starts Vite (port 5173) + Express API (port 3001)
```

Open `http://localhost:5173` in your browser.

### Features
- **Paste rich text** — HTML is converted to clean Markdown via Turndown.js
- **Front matter form** — fill in title, status, date, excerpt, categories, tags, featured image
- **Auto-slug generation** — Slovak/Czech diacritics are transliterated (á→a, č→c, š→s, etc.)
- **Slug collision detection** — warns if a `blog/{slug}.md` file already exists
- **Category/tag autocomplete** — shows existing values from blog posts as clickable chips + hardcoded defaults (PPC, SEO, Pharma, Rx, HCP, AI, OTC, Employer Branding)
- **AI-powered "Analyze Article"** — single-click analysis using Gemini 2.5 Flash-Lite that auto-fills: SEO meta title (60 chars), meta description (155 chars), slug, featured image prompt + SEO filename, and 2 body image prompts with target sections
- **Featured image generation** — generates photorealistic images via Gemini 3 Pro Image (Nano Banana Pro) with preview, editable SEO filename, and auto-set `featured_image` path
- **Body image generation & drag-drop** — generate section images from AI-suggested or custom prompts with editable SEO filenames, drag thumbnails into drop zones in the preview to insert markdown image references
- **SEO meta fields** — `custom_fields: meta_title` and `meta_description` in YAML front matter with character counters
- **Translation** — translate articles to multiple languages via DeepL API with formality control, quota tracking, and batch save
- **Unsaved changes protection** — browser warns before closing/navigating away when content is entered; Reset button requires confirmation
- **Save to disk** — writes directly to `blog/{slug}.md`
- **Copy to clipboard** — copies the full Markdown output
- **Heading hierarchy fix** — H1 headings in pasted content are automatically demoted to H2
- **Czech/Slovak typography cleanup** — normalizes typographic quotes, dashes, non-breaking spaces

### Architecture
- `_converter/web/server.js` — Express API (port 3001): blog file listing, categories/tags extraction, article analysis (Gemini), image generation (Gemini), image serving, file saving, translation (DeepL)
- `_converter/web/src/App.jsx` — React UI: tabbed layout (Converter + Translate) with 3-column converter (paste, form, preview) and drag-and-drop image insertion
- `_converter/web/src/lib/api.js` — Client-side fetch wrappers for AI, image, and translation endpoints
- `_converter/web/src/lib/slug.js` — SK/CZ-aware slug generation
- `_converter/web/src/lib/frontmatter.js` — YAML front matter builder (includes `custom_fields` for SEO meta)
- `_converter/web/src/lib/cleanup.js` — Markdown post-processing pipeline
- `_converter/web/src/lib/turndown-config.js` — Configured Turndown instance with GFM support
- `_converter/web/src/lib/deepl.js` — DeepL API client wrapper (translate, usage, language mapping)
- `_converter/web/src/lib/translation.js` — Article translation helpers (segment extraction, reassembly, slug humanization)

## AI Image Generation (Integrated in Web App)

Image generation is fully integrated into the web converter app. No separate CLI tools or Python scripts needed.

### Setup
- **API keys**: Set in `.env` file at repo root (gitignored):
  - `GEMINI_API_KEY` — for AI analysis and image generation
  - `DEEPL_API_KEY` — for article translation (optional)
- **Models**:
  - Text analysis: `gemini-2.5-flash-lite` (cheap, $0.10/$0.40 per 1M tokens)
  - Image generation: `gemini-3-pro-image-preview` (Nano Banana Pro — uses internal "Thinking" for high-fidelity output)

### Workflow

1. Paste article content into the web app
2. Click **"Analyze Article"** — AI returns: SEO meta title/description, slug, 1 featured image prompt, 2 body image prompts with target sections
3. Review and edit any AI-suggested values
4. Click **"Generate"** on each image prompt — Gemini 3 Pro creates the image
5. Featured image is auto-set in front matter; body images are dragged into drop zones in the preview

### Image Style
- All generated images are **photorealistic** (real-world photography style, not illustrations/cartoons)
- No text, words, letters, typography, watermarks, or logos in generated images
- Style prefix enforces natural lighting, realistic textures, high-end camera look

### Image Processing
- Images are processed via `sharp`: max 1600px width, JPEG quality 85
- Saved to `_images/{slug}/{seo-filename}.jpg`
- Alt text (max 125 chars) and title (max 200 chars) are auto-generated from the prompt
- SEO filenames are auto-generated from prompts (lowercase, hyphens, 3-5 keywords) — editable before generation

### API Endpoints (server.js)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/analyze-article` | AI analysis → meta, slug, image prompts |
| `POST` | `/api/generate-image` | Generate image via Gemini 3 Pro, save to disk |
| `GET` | `/api/images/:slug/:filename` | Serve generated images for preview |
| `GET` | `/api/blog-files` | List existing .md files |
| `GET` | `/api/categories` | Extract categories/tags from blog posts |
| `POST` | `/api/save` | Save markdown to `blog/{slug}.md` |
| `GET` | `/api/translation-status/:slug` | Check which translations exist |
| `POST` | `/api/estimate-translation` | Estimate DeepL character cost |
| `POST` | `/api/translate-article` | Translate article via DeepL |
| `POST` | `/api/save-translation` | Save translated article to `blog/{lang}/{slug}.md` |
| `GET` | `/api/deepl-usage` | Get DeepL API character usage stats |

## Template

Use `_templates/post-template.md` as a starting point for new posts. Copy it to the desired location and rename.
