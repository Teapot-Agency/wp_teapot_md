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

- `## Heading 2`, `### Heading 3` etc. (don't use `# H1` - the title serves as H1)
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
4. **Write content**: Standard markdown after the front matter
5. **Add images**: Place images in `_images/`, reference with `/_images/filename.jpg`
6. **Verify**: Check that front matter YAML is valid (proper indentation, no tabs)

## Step-by-Step: Creating a New Section (Folder with Posts)

1. Create the folder: `new-section/`
2. Create `new-section/index.md` with front matter and content for the section landing page
3. Create child posts: `new-section/child-post.md`
4. Add images to `_images/` if needed

## Common Mistakes to Avoid

- **No front matter** - every file needs `---` delimited YAML at the top
- **Using tabs in YAML** - use spaces only for indentation
- **Spaces in filenames** - use hyphens: `my-post.md` not `my post.md`
- **Using H1 (`#`)** - the `title` field is the H1, start content with H2 (`##`)
- **External featured images** - `featured_image` must point to a file in `_images/`
- **Forgetting `post_status`** - without it the post may not be visible
- **Renaming files** - this creates a NEW post (old one remains, must be deleted manually in WP)
- **Deleting files** - the WordPress post is NOT deleted automatically; manual cleanup needed

## Generating Images with Gemini (Nano Banana Pro)

The `_converter/` directory contains tools for AI image generation using Google's Gemini 3 Pro Image model.

### Setup
- **API key**: Set `GEMINI_API_KEY` environment variable (or pass `--api-key`)
- **Python venv**: `_converter/venv/` has all dependencies pre-installed (`google-genai`, `Pillow`)
- **Model**: `gemini-3-pro-image-preview` (Nano Banana Pro)

### Single Article Image Generation

```bash
GEMINI_API_KEY="your-key" _converter/venv/bin/python _converter/generate_images.py \
    blog/my-post.md \
    -p "Descriptive prompt for the image" \
    -n "seo-friendly-filename" \
    --featured
```

**Key options:**
- `-p "prompt1" "prompt2"` — one or more image prompts (required)
- `-n "name1" "name2"` — SEO-friendly filenames without extension (one per prompt). If omitted, auto-generates from prompt text
- `--placement before-sections` — insert images before evenly-distributed headings (default)
- `--placement manual` — save images only, don't modify the .md file
- `--featured` — set first image as `featured_image` in front matter (default)
- `--no-featured` — skip featured_image update
- `--dry-run` — preview without API calls or file changes
- `--aspect-ratio 16:9` — image aspect ratio (default: 16:9)
- `--resolution 1K` — image resolution: 1K, 2K, or 4K (default: 1K)

### Batch Image Generation

```bash
GEMINI_API_KEY="your-key" _converter/batch_generate.sh
```

Generates one featured image per blog article. Edit `batch_generate.sh` to update prompts and filenames.

### Image SEO Process

When generating images for articles, **always follow this process**:

1. **Choose a descriptive filename** (`-n`) — WordPress uses the filename as the default image title/slug in the media library. Use lowercase, hyphens, 3-5 keywords describing the image content
   - Good: `pharma-ai-analytics-dashboard`, `supplement-compliance-ftc-balance`
   - Bad: `gen-001`, `image1`, `hero`
2. **Write a detailed visual prompt** (`-p`) — the prompt is automatically converted to:
   - **Alt text** (max 125 chars) — used for accessibility and SEO `alt` attribute
   - **Title/caption** (max 200 chars) — used for image `title` hover text
3. **Use `--dry-run`** first to preview filenames before generating
4. Images are saved to `_images/{slug}/{seo-name}.jpg` (processed, max 1600px width, quality 85)

**Filename priority:** explicit `-n` name > auto-generated from prompt > `gen-NNN` fallback

### Image Prompt Guidelines
- Write descriptive, visual prompts — the script prepends a default style prefix about healthcare/pharma editorial aesthetics
- Use `--no-style` to disable the default prefix
- Use `--style "Custom prefix"` for a different style
- Keep prompts focused on visual elements: composition, colors, subjects, mood

### Architecture
- `_converter/lib/gemini.py` — Gemini API client with retry logic
- `_converter/lib/images.py` — image processing (resize, format conversion)
- `_converter/generate_images.py` — CLI tool for per-article image generation (supports `-n` for SEO filenames)
- `_converter/batch_generate.sh` — batch runner for all blog articles

## Template

Use `_templates/post-template.md` as a starting point for new posts. Copy it to the desired location and rename.
