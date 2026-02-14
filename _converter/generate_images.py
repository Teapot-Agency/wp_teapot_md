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
        print(f"Save to: _images/{slug}/gen-001.jpg ... gen-{len(prompts):03d}.jpg")
        print(f"Placement: {args.placement}")
        if args.featured:
            print(f"Featured image: _images/{slug}/gen-001.jpg")
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
    image_paths = save_generated_images(results, slug)

    # 5. Insert image references into markdown
    if args.placement != 'manual':
        body = insert_images(body, image_paths, args.placement)
        print(f"Inserted {len(image_paths)} image reference(s) ({args.placement}).")

    # 6. Update featured_image in front matter
    if args.featured and image_paths:
        frontmatter = update_featured_image(frontmatter, image_paths[0])

    # 7. Write updated .md file
    if args.placement != 'manual' or (args.featured and image_paths):
        write_file(filepath, frontmatter + '\n' + body)
        print(f"Updated: {args.file}")
    else:
        print("\nImage paths for manual insertion:")
        for path in image_paths:
            print(f"  ![image]({path})")

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
) -> list[str]:
    """Save generated PIL images to _images/{slug}/ with processing.

    Returns list of markdown-ready paths like '/_images/slug/gen-001.jpg'.
    """
    from lib.images import _process_image

    output_dir = os.path.join(IMAGES_DIR, slug)
    os.makedirs(output_dir, exist_ok=True)

    paths = []
    for i, (img, prompt) in enumerate(results):
        # Convert PIL Image to bytes for _process_image()
        buf = BytesIO()
        img.save(buf, format='PNG')
        raw_bytes = buf.getvalue()

        processed_img, ext = _process_image(raw_bytes)

        filename = f'gen-{i + 1:03d}.{ext}'
        filepath = os.path.join(output_dir, filename)
        processed_img.save(filepath, quality=85 if ext == 'jpg' else None)

        md_path = f'/_images/{slug}/{filename}'
        paths.append(md_path)
        print(f"  Saved: {md_path}")

    return paths


def insert_images(body: str, image_paths: list[str], placement: str) -> str:
    """Insert image markdown references into the article body."""
    if placement == 'before-sections':
        return _place_before_sections(body, image_paths)
    elif placement == 'after-intro':
        return _place_after_intro(body, image_paths)
    return body


def _place_before_sections(body: str, image_paths: list[str]) -> str:
    """Insert images before evenly-distributed ## headings.

    Image 1: hero position (top of body, before first content).
    Remaining images: distributed before evenly-spaced ## headings.
    """
    if not image_paths:
        return body

    lines = body.split('\n')
    heading_indices = [i for i, line in enumerate(lines) if re.match(r'^## ', line)]

    # Build insertion map: line_number -> image markdown
    insertions = {}

    # First image: hero position at top of body
    insertions[0] = image_paths[0]

    # Distribute remaining images across headings
    remaining = image_paths[1:]
    if remaining and heading_indices:
        # Skip first heading (hero image is already before it)
        available_headings = heading_indices[1:] if len(heading_indices) > 1 else heading_indices
        step = max(1, len(available_headings) // (len(remaining) + 1))
        for j, img_path in enumerate(remaining):
            idx = min((j + 1) * step, len(available_headings) - 1)
            line_num = available_headings[idx]
            insertions[line_num] = img_path

    # Insert in reverse order to preserve line numbers
    for line_num in sorted(insertions.keys(), reverse=True):
        img_path = insertions[line_num]
        img_line = f'\n![image]({img_path})\n'
        lines.insert(line_num, img_line)

    return '\n'.join(lines)


def _place_after_intro(body: str, image_paths: list[str]) -> str:
    """Insert all images between intro text and first ## heading."""
    if not image_paths:
        return body

    match = re.search(r'^## ', body, re.MULTILINE)
    img_block = '\n\n'.join(f'![image]({p})' for p in image_paths)

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
