#!/usr/bin/env python3
"""Generate AI images for blog posts using Nano Banana Pro (Gemini 3 Pro Image).

Claude Code reads the .md file, crafts context-aware prompts, and invokes this
script to generate images, save them, and insert references into the markdown.

Usage:
    python _converter/generate_images.py blog/my-post.md \
        -p "Modern pharmacy with digital analytics screens" \
           "Doctor reviewing patient data on tablet" \
           "Abstract visualization of drug molecules"

    # Preview without API calls or file changes:
    python _converter/generate_images.py blog/my-post.md -p "..." --dry-run

    # Save images only, don't modify the .md file:
    python _converter/generate_images.py blog/my-post.md -p "..." --placement manual
"""

import argparse
import os
import re
import sys
from io import BytesIO

CONVERTER_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CONVERTER_DIR)

PROJECT_ROOT = os.path.dirname(CONVERTER_DIR)
IMAGES_DIR = os.path.join(PROJECT_ROOT, '_images')


def main():
    args = parse_args()

    # 1. Read and parse the .md file
    filepath = os.path.abspath(args.file)
    if not os.path.isfile(filepath):
        print(f"Error: File not found: {args.file}")
        sys.exit(2)

    md_content = read_file(filepath)
    frontmatter, body = split_frontmatter(md_content)
    slug = extract_slug(filepath)

    prompts = args.prompts

    if args.verbose:
        print(f"File: {args.file}")
        print(f"Slug: {slug}")
        print(f"Prompts ({len(prompts)}):")
        for i, p in enumerate(prompts, 1):
            print(f"  {i}. {p}")
        print(f"Placement: {args.placement}")
        print(f"Aspect ratio: {args.aspect_ratio}")
        print(f"Resolution: {args.resolution}")
        print()

    # 2. Dry run check
    if args.dry_run:
        style = resolve_style(args)
        print("=== DRY RUN ===")
        print(f"Would generate {len(prompts)} image(s) for '{slug}'")
        print(f"Style prefix: {style[:60]}..." if style else "Style prefix: (none)")
        for i, p in enumerate(prompts):
            if args.image_names and i < len(args.image_names):
                name = args.image_names[i]
            else:
                name = _prompt_to_filename(p, i)
            print(f"  {i + 1}. _images/{slug}/{name}.jpg")
        print(f"Placement: {args.placement}")
        if args.featured:
            first_name = args.image_names[0] if args.image_names else _prompt_to_filename(prompts[0], 0)
            print(f"Featured image: _images/{slug}/{first_name}.jpg")
        sys.exit(0)

    # 3. Generate images via Gemini API
    from lib.gemini import create_client, generate_images

    style = resolve_style(args)

    print(f"Generating {len(prompts)} image(s) for '{slug}'...")
    client = create_client(args.api_key)
    results = generate_images(
        client, prompts,
        style_prefix=style,
        aspect_ratio=args.aspect_ratio,
        resolution=args.resolution,
    )

    if not results:
        print("ERROR: All image generations failed.")
        sys.exit(1)

    print(f"\n{len(results)}/{len(prompts)} image(s) generated successfully.")

    # 4. Save images to _images/{slug}/
    images = save_generated_images(results, slug, image_names=args.image_names)

    # 5. Insert image references into markdown
    if args.placement != 'manual':
        body = insert_images(body, images, args.placement)
        print(f"Inserted {len(images)} image reference(s) ({args.placement}).")

    # 6. Update featured_image in front matter
    if args.featured and images:
        frontmatter = update_featured_image(frontmatter, images[0]['path'])

    # 7. Write updated .md file
    if args.placement != 'manual' or (args.featured and images):
        write_file(filepath, frontmatter + '\n' + body)
        print(f"Updated: {args.file}")
    else:
        print("\nImage references for manual insertion:")
        for img in images:
            print(f"  {_image_markdown(img)}")

    print("\nDone.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Generate AI images for blog posts using Nano Banana Pro.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python _converter/generate_images.py blog/pharma01.md \\
      -p "Modern digital pharmacy" "Doctor with tablet" "Molecular visualization"
  python _converter/generate_images.py blog/my-post.md -p "prompt" --dry-run
  python _converter/generate_images.py blog/my-post.md -p "prompt" --placement manual
        """,
    )
    parser.add_argument(
        'file',
        help='Path to the .md file to add images to',
    )
    parser.add_argument(
        '--prompts', '-p', nargs='+', required=True,
        help='Image generation prompts (Claude Code provides these)',
    )
    parser.add_argument(
        '--placement', default='before-sections',
        choices=['before-sections', 'after-intro', 'manual'],
        help='Where to insert images (default: before-sections)',
    )
    parser.add_argument(
        '--style',
        help='Custom style prefix prepended to each prompt',
    )
    parser.add_argument(
        '--no-style', action='store_true',
        help='Disable the default style prefix',
    )
    parser.add_argument(
        '--aspect-ratio', default='16:9',
        help='Image aspect ratio (default: 16:9)',
    )
    parser.add_argument(
        '--resolution', default='1K',
        choices=['1K', '2K', '4K'],
        help='Image resolution (default: 1K)',
    )
    parser.add_argument(
        '--featured', action='store_true', default=True,
        help='Set first image as featured_image in front matter (default)',
    )
    parser.add_argument(
        '--no-featured', dest='featured', action='store_false',
        help='Do not set featured_image',
    )
    parser.add_argument(
        '--force-featured', action='store_true',
        help='Overwrite existing featured_image',
    )
    parser.add_argument(
        '--image-names', '-n', nargs='+',
        help='Custom SEO-friendly filenames (without extension), one per prompt',
    )
    parser.add_argument(
        '--api-key',
        help='Gemini API key (overrides GEMINI_API_KEY env var)',
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Preview without API calls or file changes',
    )
    parser.add_argument(
        '--verbose', '-v', action='store_true',
        help='Show detailed output',
    )
    return parser.parse_args()


def read_file(filepath: str) -> str:
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()


def write_file(filepath: str, content: str):
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)


def split_frontmatter(content: str) -> tuple[str, str]:
    """Split .md file into front matter block and body content."""
    match = re.match(r'^(---\n.*?\n---)\n?(.*)', content, re.DOTALL)
    if not match:
        print("Error: No valid YAML front matter found in file.")
        sys.exit(2)
    return match.group(1), match.group(2)


def extract_slug(filepath: str) -> str:
    """Extract slug from .md filename (minus extension)."""
    basename = os.path.basename(filepath)
    return os.path.splitext(basename)[0]


def resolve_style(args: argparse.Namespace) -> str:
    """Determine the style prefix to use."""
    from lib.gemini import DEFAULT_STYLE_PREFIX

    if args.no_style:
        return ""
    if args.style:
        return args.style + " "
    return DEFAULT_STYLE_PREFIX


def save_generated_images(
    results: list[tuple],
    slug: str,
    image_names: list[str] | None = None,
) -> list[dict]:
    """Save generated PIL images to _images/{slug}/ with processing.

    Filename priority: explicit image_names → auto-generated from prompt → gen-NNN fallback.
    Returns list of dicts with keys: path, alt, title.
    """
    from lib.images import _process_image

    output_dir = os.path.join(IMAGES_DIR, slug)
    os.makedirs(output_dir, exist_ok=True)

    images = []
    for i, (img, prompt) in enumerate(results):
        # Convert PIL Image to bytes for _process_image()
        buf = BytesIO()
        img.save(buf, format='PNG')
        raw_bytes = buf.getvalue()

        processed_img, ext = _process_image(raw_bytes)

        # Filename priority: explicit name → auto from prompt → gen-NNN
        if image_names and i < len(image_names):
            filename = f'{image_names[i]}.{ext}'
        else:
            filename = f'{_prompt_to_filename(prompt, i)}.{ext}'
        filepath = os.path.join(output_dir, filename)
        processed_img.save(filepath, quality=85 if ext == 'jpg' else None)

        md_path = f'/_images/{slug}/{filename}'
        alt = _prompt_to_alt(prompt)
        title = _prompt_to_title(prompt)
        images.append({'path': md_path, 'alt': alt, 'title': title})
        print(f"  Saved: {md_path}")

    return images


def _prompt_to_filename(prompt: str, index: int, max_length: int = 60) -> str:
    """Convert a generation prompt into an SEO-friendly filename slug.

    Examples:
        "Modern pharmacy with digital analytics" → "modern-pharmacy-with-digital-analytics"
        "Doctor reviewing patient data on tablet" → "doctor-reviewing-patient-data-on-tablet"
    """
    slug = prompt.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    if len(slug) > max_length:
        slug = slug[:max_length].rsplit('-', 1)[0]
    if not slug:
        slug = f'gen-{index + 1:03d}'
    return slug


def _prompt_to_alt(prompt: str) -> str:
    """Convert a generation prompt into concise SEO alt text (max 125 chars)."""
    # Strip trailing periods, capitalize first letter
    alt = prompt.strip().rstrip('.')
    if alt and alt[0].islower():
        alt = alt[0].upper() + alt[1:]
    if len(alt) > 125:
        alt = alt[:122].rsplit(' ', 1)[0] + '...'
    return alt


def _prompt_to_title(prompt: str) -> str:
    """Convert a generation prompt into an image title/caption (max 200 chars)."""
    title = prompt.strip().rstrip('.')
    if title and title[0].islower():
        title = title[0].upper() + title[1:]
    if len(title) > 200:
        title = title[:197].rsplit(' ', 1)[0] + '...'
    return title


def _image_markdown(img: dict) -> str:
    """Build markdown image tag with alt text and title for SEO.

    Output: ![Alt text](path "Title caption")
    """
    return f'![{img["alt"]}]({img["path"]} "{img["title"]}")'


def insert_images(body: str, images: list[dict], placement: str) -> str:
    """Insert image markdown references into the article body."""
    if placement == 'before-sections':
        return _place_before_sections(body, images)
    elif placement == 'after-intro':
        return _place_after_intro(body, images)
    return body


def _place_before_sections(body: str, images: list[dict]) -> str:
    """Insert images before evenly-distributed ## headings.

    Image 1: hero position (top of body, before first content).
    Remaining images: distributed before evenly-spaced ## headings.
    """
    if not images:
        return body

    lines = body.split('\n')
    heading_indices = [i for i, line in enumerate(lines) if re.match(r'^## ', line)]

    # Build insertion map: line_number -> image dict
    insertions = {}

    # First image: hero position at top of body
    insertions[0] = images[0]

    # Distribute remaining images across headings
    remaining = images[1:]
    if remaining and heading_indices:
        # Skip first heading (hero image is already before it)
        available_headings = heading_indices[1:] if len(heading_indices) > 1 else heading_indices
        step = max(1, len(available_headings) // (len(remaining) + 1))
        for j, img in enumerate(remaining):
            idx = min((j + 1) * step, len(available_headings) - 1)
            line_num = available_headings[idx]
            insertions[line_num] = img

    # Insert in reverse order to preserve line numbers
    for line_num in sorted(insertions.keys(), reverse=True):
        img_line = f'\n{_image_markdown(insertions[line_num])}\n'
        lines.insert(line_num, img_line)

    return '\n'.join(lines)


def _place_after_intro(body: str, images: list[dict]) -> str:
    """Insert all images between intro text and first ## heading."""
    if not images:
        return body

    match = re.search(r'^## ', body, re.MULTILINE)
    img_block = '\n\n'.join(_image_markdown(img) for img in images)

    if not match:
        return body + '\n\n' + img_block

    insert_pos = match.start()
    return body[:insert_pos] + img_block + '\n\n' + body[insert_pos:]


def update_featured_image(frontmatter: str, image_path: str, force: bool = False) -> str:
    """Add or update featured_image in YAML front matter."""
    # featured_image uses _images/ prefix without leading slash
    featured_path = image_path.lstrip('/')

    existing = re.search(r'^featured_image:\s*.+$', frontmatter, re.MULTILINE)
    if existing and not force:
        print(f"  featured_image already set, skipping (use --force-featured to override)")
        return frontmatter

    if existing:
        return re.sub(
            r'^featured_image:\s*.+$',
            f'featured_image: {featured_path}',
            frontmatter,
            flags=re.MULTILINE,
        )

    # Insert before closing ---
    return frontmatter.replace(
        '\n---',
        f'\nfeatured_image: {featured_path}\n---',
        1,
    )


if __name__ == '__main__':
    main()
