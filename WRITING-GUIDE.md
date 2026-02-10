# Writing Guide - How to Create Posts

This guide explains how to write and manage content for the WordPress site using this Git repository and the Git it Write plugin.

## Quick Start

1. Create a `.md` file in the appropriate folder
2. Add YAML front matter at the top (title, status, etc.)
3. Write your content in markdown below the front matter
4. Commit and push - the post is published automatically

## File Naming

- The filename becomes the URL slug: `my-awesome-post.md` -> `/my-awesome-post/`
- Use **lowercase**, **hyphens** for spaces, **no special characters**
- Keep it short and descriptive
- Only `.md` files are published

## Front Matter

Every file must begin with YAML front matter enclosed in `---`:

```yaml
---
title: My Post Title
menu_order: 1
post_status: publish
post_excerpt: A brief description of what this post is about
featured_image: _images/post-hero.jpg
taxonomy:
    category:
        - my-category
    post_tag:
        - tag-one
        - tag-two
custom_fields:
    my_field: my value
---

Your content starts here...
```

### Required Fields

| Field | Description |
|-------|-------------|
| `title` | The post title displayed on the site |
| `post_status` | `publish` (live), `draft` (hidden), `pending` (review) |

### Optional Fields

| Field | Description | Example |
|-------|-------------|---------|
| `menu_order` | Sort order (lower = first) | `1` |
| `post_excerpt` | Short description / SEO snippet | `"A guide to..."` |
| `post_date` | Custom publish date | `2025-01-15 10:00:00` |
| `comment_status` | Enable/disable comments | `open` or `closed` |
| `page_template` | WordPress template to use | `template-full-width` |
| `stick_post` | Pin to top | `yes` or `no` |
| `featured_image` | Hero image from `_images/` | `_images/hero.jpg` |
| `taxonomy` | Categories and tags (see below) | YAML mapping |
| `custom_fields` | Custom WordPress fields | YAML mapping |
| `skip_file` | Don't publish this file | `yes` |

### Categories and Tags

```yaml
taxonomy:
    category:
        - category-slug
    post_tag:
        - tag-slug
```

Use the **slug** (lowercase, hyphenated version) of the category/tag, not the display name. The category/tag must already exist in WordPress.

## Content Formatting (Markdown)

### Headings

Start with `##` (H2) since the `title` field is used as H1:

```markdown
## Section Title
### Subsection
#### Sub-subsection
```

### Text Formatting

```markdown
**bold text**
*italic text*
~~strikethrough~~
`inline code`
```

### Links

```markdown
[External link](https://example.com)
[Link to another post](./other-post.md)
[Link to parent section post](../section/post.md)
[Link from root](/folder/post.md)
```

Relative links (starting with `./`, `../`, or `/`) to other `.md` files are automatically converted to proper WordPress URLs.

### Images

Place images in the `_images/` folder, then reference them:

```markdown
![Alt text describing the image](/_images/my-photo.jpg "Optional caption")
```

- Images are uploaded to WordPress media library automatically
- Uploaded only once, then reused across posts
- Organize with subfolders: `_images/blog/photo.jpg`

### Lists

```markdown
- Unordered item
- Another item
  - Nested item

1. Ordered item
2. Second item
   1. Nested ordered
```

### Blockquotes

```markdown
> This is a blockquote.
> It can span multiple lines.
```

### Code Blocks

````markdown
```javascript
const greeting = "Hello World";
console.log(greeting);
```
````

### Tables

```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

### Horizontal Rule

```markdown
---
```

(Only works outside the front matter section)

### HTML

You can use raw HTML directly in your markdown files:

```html
<div class="custom-box">
    <p>Custom HTML content</p>
</div>
```

### WordPress Shortcodes

Shortcodes work directly in the markdown content:

```
[gallery ids="1,2,3"]
[contact-form-7 id="123" title="Contact"]
[giw_edit_link]
```

## Folder Structure

Folders create a page hierarchy:

```
services/
├── index.md          -> /services/        (parent page)
├── web-design.md     -> /services/web-design/
├── seo.md            -> /services/seo/
└── consulting/
    ├── index.md      -> /services/consulting/
    └── pricing.md    -> /services/consulting/pricing/
```

- `index.md` in a folder = that folder's page content
- Without `index.md`, the folder's page will have blank content

## Special Directories

| Directory | Purpose |
|-----------|---------|
| `_images/` | Store images (uploaded to WP media library) |
| `_templates/` | Post templates (not published) |
| Any `_folder/` | Ignored by the plugin |
| Any `.folder/` | Ignored by the plugin |

## Workflow

### Creating a new post

1. Create `post-name.md` in the right folder
2. Copy front matter from `_templates/post-template.md`
3. Fill in title, status, and other fields
4. Write your content
5. Add images to `_images/` if needed
6. Commit and push

### Creating a new section

1. Create a new folder: `new-section/`
2. Add `new-section/index.md` for the section landing page
3. Add child posts as `.md` files in the folder
4. Commit and push

### Updating a post

1. Edit the `.md` file
2. Commit and push - the plugin updates the WordPress post automatically

### Important Notes

- **Renaming a file** creates a NEW post. The old post must be manually deleted in WordPress.
- **Deleting a file** does NOT delete the WordPress post. Manual cleanup is needed.
- **Editing in WordPress** is possible but will be overwritten on the next repository sync.
- **One-way sync**: Changes flow from GitHub -> WordPress only, never the reverse.

## Tips

- Use `post_status: draft` while working on content, change to `publish` when ready
- Keep filenames short and SEO-friendly
- Use descriptive alt text on images for accessibility
- Preview markdown locally in your editor or on GitHub before pushing
- Use the `_templates/post-template.md` as a starting point
