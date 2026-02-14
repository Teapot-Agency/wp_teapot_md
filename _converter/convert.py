#!/usr/bin/env python3
"""Document-to-Markdown converter for Git it Write WordPress content.

Converts PDF, DOCX, and RTF files into clean Markdown with YAML front matter,
optimized for Slovak/Czech content.

Usage:
    python _converter/convert.py                          # Convert all files in input/
    python _converter/convert.py input/article.pdf        # Convert specific file
    python _converter/convert.py --output-dir blog/seo/   # Specify output location
    python _converter/convert.py --dry-run                # Preview without writing
"""

import argparse
import os
import sys

# Add the converter directory to Python path
CONVERTER_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CONVERTER_DIR)

from lib.cleanup import cleanup_markdown
from lib.docx_converter import convert_docx
from lib.frontmatter import build_frontmatter, extract_excerpt
from lib.images import get_first_image_path, replace_image_placeholders, save_images
from lib.pdf_converter import convert_pdf
from lib.rtf_converter import convert_rtf
from lib.slug import generate_slug, unique_slug

# Project root (one level up from _converter/)
PROJECT_ROOT = os.path.dirname(CONVERTER_DIR)
INPUT_DIR = os.path.join(PROJECT_ROOT, 'input')
IMAGES_DIR = os.path.join(PROJECT_ROOT, '_images')

SUPPORTED_EXTENSIONS = {
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.doc': 'docx',  # Try mammoth on .doc files too
    '.rtf': 'rtf',
}


def main():
    args = parse_args()

    # Collect input files
    files = collect_files(args.files)
    if not files:
        print('No supported files found. Drop PDF/DOCX/RTF files into input/ or specify paths.')
        sys.exit(2)

    print(f'Found {len(files)} file(s) to convert.\n')

    # Determine output directory
    output_dir = os.path.join(PROJECT_ROOT, args.output_dir) if args.output_dir else PROJECT_ROOT
    os.makedirs(output_dir, exist_ok=True)

    success = 0
    failed = 0

    for filepath in files:
        try:
            convert_file(filepath, output_dir, args)
            success += 1
        except Exception as e:
            print(f'  ERROR: {e}')
            if args.verbose:
                import traceback
                traceback.print_exc()
            failed += 1
        print()

    # Summary
    print('=' * 50)
    print(f'Done. {success} converted, {failed} failed.')

    sys.exit(1 if failed > 0 else 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Convert PDF, DOCX, and RTF files to Markdown for Git it Write.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python _converter/convert.py
  python _converter/convert.py input/article.pdf --output-dir blog/seo/ --category seo
  python _converter/convert.py input/*.docx --tag ai,marketing --status publish
  python _converter/convert.py --dry-run
        """,
    )
    parser.add_argument(
        'files', nargs='*', default=[],
        help='Input files to convert (default: all files in input/)',
    )
    parser.add_argument(
        '--output-dir', '-o',
        help='Output directory for .md files (relative to project root, default: root)',
    )
    parser.add_argument(
        '--category', '-c',
        help='Category slug(s), comma-separated (e.g., "seo,marketing")',
    )
    parser.add_argument(
        '--tag', '-t',
        help='Tag slug(s), comma-separated (e.g., "ai-overviews,ahrefs")',
    )
    parser.add_argument(
        '--status', '-s', default='draft',
        choices=['draft', 'publish', 'pending', 'future'],
        help='Post status (default: draft)',
    )
    parser.add_argument(
        '--date', '-d',
        help='Post date override (YYYY-MM-DD HH:MM:SS or DD.MM.YYYY)',
    )
    parser.add_argument(
        '--no-images', action='store_true',
        help='Skip image extraction',
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Preview output without writing files',
    )
    parser.add_argument(
        '--verbose', '-v', action='store_true',
        help='Show detailed processing info',
    )
    return parser.parse_args()


def collect_files(file_args: list[str]) -> list[str]:
    """Collect and validate input files."""
    files = []

    if file_args:
        for path in file_args:
            abs_path = os.path.abspath(path)
            ext = os.path.splitext(abs_path)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                if os.path.isfile(abs_path):
                    files.append(abs_path)
                else:
                    print(f'Warning: File not found: {path}')
            else:
                print(f'Warning: Unsupported format: {path} (supported: {", ".join(SUPPORTED_EXTENSIONS)})')
    else:
        # Scan input/ directory
        if not os.path.isdir(INPUT_DIR):
            os.makedirs(INPUT_DIR, exist_ok=True)
            return []

        for filename in sorted(os.listdir(INPUT_DIR)):
            ext = os.path.splitext(filename)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                files.append(os.path.join(INPUT_DIR, filename))

    return files


def parse_date(date_str: str) -> str:
    """Parse various date formats into YYYY-MM-DD HH:MM:SS."""
    from dateutil import parser as dateparser

    try:
        # Parse with dayfirst=True for CZ/SK format (DD.MM.YYYY)
        dt = dateparser.parse(date_str, dayfirst=True)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError):
        print(f'  Warning: Could not parse date "{date_str}", using current time')
        from datetime import datetime
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def convert_file(filepath: str, output_dir: str, args: argparse.Namespace):
    """Convert a single file to markdown."""
    filename = os.path.basename(filepath)
    ext = os.path.splitext(filename)[1].lower()
    fmt = SUPPORTED_EXTENSIONS[ext]

    print(f'Converting: {filename} ({fmt.upper()})')

    # Run format-specific converter
    if fmt == 'pdf':
        title, content, images = convert_pdf(filepath)
    elif fmt == 'docx':
        title, content, images = convert_docx(filepath)
    elif fmt == 'rtf':
        title, content, images = convert_rtf(filepath)
    else:
        raise ValueError(f'Unknown format: {fmt}')

    if args.verbose:
        print(f'  Title: {title}')
        print(f'  Content length: {len(content)} chars')
        print(f'  Images found: {len(images)}')

    # Run markdown cleanup pipeline
    content = cleanup_markdown(content)

    # Generate slug
    slug = generate_slug(title)
    existing = os.listdir(output_dir) if os.path.isdir(output_dir) else []
    slug = unique_slug(slug, existing)

    # Handle images
    image_mapping = {}
    featured_image = None
    if images and not args.no_images:
        if args.dry_run:
            print(f'  [DRY RUN] Would extract {len(images)} image(s) to _images/{slug}/')
        else:
            image_mapping = save_images(images, slug, IMAGES_DIR)
            content = replace_image_placeholders(content, image_mapping)
            featured_image = get_first_image_path(image_mapping)
            print(f'  Saved {len(image_mapping)} image(s) to _images/{slug}/')

    # Parse categories and tags
    categories = [c.strip() for c in args.category.split(',')] if args.category else None
    tags = [t.strip() for t in args.tag.split(',')] if args.tag else None

    # Parse date
    date = parse_date(args.date) if args.date else None

    # Auto-generate excerpt
    excerpt = extract_excerpt(content)

    # Build front matter
    frontmatter = build_frontmatter(
        title=title,
        status=args.status,
        excerpt=excerpt,
        date=date,
        categories=categories,
        tags=tags,
        featured_image=featured_image,
    )

    # Assemble final markdown
    final_md = frontmatter + '\n' + content

    # Output
    output_path = os.path.join(output_dir, f'{slug}.md')

    if args.dry_run:
        print(f'  [DRY RUN] Would create: {os.path.relpath(output_path, PROJECT_ROOT)}')
        print(f'  Slug: {slug}')
        print(f'  ---')
        # Show front matter preview
        for line in frontmatter.split('\n')[:15]:
            print(f'  {line}')
        print(f'  ---')
        # Show first 300 chars of content
        preview = content[:300].replace('\n', '\n  ')
        print(f'  {preview}...')
    else:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_md)
        rel_path = os.path.relpath(output_path, PROJECT_ROOT)
        print(f'  Created: {rel_path}')
        print(f'  Status: {args.status}')


if __name__ == '__main__':
    main()
