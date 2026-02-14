---
skip_file: yes
---

# Teapot.md - WordPress Content via Git it Write

This repository serves as the content source for the [teapot.sk](https://teapot.sk) WordPress site using the [Git it Write](https://github.com/vaakash/git-it-write) plugin.

Markdown files (`.md`) in this repo are automatically published as WordPress posts/pages whenever changes are pushed.

## How It Works

1. Write content in `.md` files with YAML front matter
2. Push to GitHub
3. The Git it Write plugin detects changes (via webhook) and publishes/updates posts automatically

## Repository Structure

```
wp_teapot_md/
├── README.md                  # This file (not published)
├── CLAUDE.md                  # Instructions for Claude AI (not published)
├── WRITING-GUIDE.md           # How to write posts (not published)
├── _images/                   # Images used in posts (uploaded to WP media library)
│   └── (put images here)
├── _templates/                # Templates for new posts (not published)
│   └── post-template.md
├── _converter/                # Document conversion & image generation tools
│   ├── convert.py             # PDF/DOCX/RTF → Markdown converter
│   ├── generate_images.py     # AI image generation (Nano Banana Pro)
│   ├── requirements.txt       # Python dependencies
│   └── lib/                   # Shared library modules
├── input/                     # Drop documents here for conversion
├── .gitignore
└── (your content folders and .md files go here)
```

### Key conventions

- **Files/folders starting with `_` or `.`** are ignored by the plugin (not published)
- **File name = post slug**: `getting-started.md` becomes `/getting-started/`
- **Folders create hierarchy**: `services/web-design.md` becomes `/services/web-design/`
- **Folder content**: Use `index.md` inside a folder to set that folder's post content
- **Images**: Store all images in `_images/` and reference them as `/_images/filename.jpg`

## Plugin Setup (WordPress)

1. Install and activate **Git it Write** from WordPress plugins
2. Go to **Settings > Git it Write**
3. Click **"Add a new repository to publish posts from"**
4. Configure:
   - **Repository owner**: your GitHub username
   - **Repository name**: `wp_teapot_md`
   - **Branch**: `main`
   - **Folder**: leave empty to use root, or specify a subfolder
   - **Post type**: Select your target post type (pages recommended for hierarchy)
5. Save settings

### Webhook Setup (automatic publishing)

1. In Git it Write settings, set a **webhook secret key**
2. In GitHub repo **Settings > Webhooks**, add a webhook:
   - **Payload URL**: as shown in Git it Write settings
   - **Content type**: `application/json`
   - **Secret**: same secret key from step 1
   - **Events**: "Just the push event"
3. Save - now pushes automatically trigger post updates

## Tools

### Document Converter (`_converter/convert.py`)

Converts PDF, DOCX, and RTF files into Markdown with YAML front matter. Optimized for Slovak/Czech content.

```bash
python _converter/convert.py                          # Convert all files in input/
python _converter/convert.py input/article.pdf        # Convert specific file
python _converter/convert.py --output-dir blog/seo/   # Specify output location
```

### AI Image Generator (`_converter/generate_images.py`)

Generates images for blog posts using Nano Banana Pro (Gemini 3 Pro Image Preview). Claude Code reads the article, crafts context-aware prompts, and invokes this tool.

```bash
python _converter/generate_images.py blog/my-post.md \
    -p "Prompt 1" "Prompt 2" "Prompt 3"
```

Requires `GEMINI_API_KEY` environment variable. Images are saved to `_images/{slug}/` and inserted into the Markdown file.

### Setup

```bash
cd _converter
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Guides

- **[WRITING-GUIDE.md](./WRITING-GUIDE.md)** - How to write and format posts
- **[CLAUDE.md](./CLAUDE.md)** - Instructions for Claude AI to create/edit posts
