"""PDF to Markdown converter using PyMuPDF for text and image extraction."""

import os
import re
import statistics

import fitz  # pymupdf


def convert_pdf(filepath: str) -> tuple[str, str, list[dict]]:
    """Convert a PDF file to markdown content.

    Uses get_text(sort=True) for proper text extraction with spacing,
    and font size analysis via get_text("dict") for heading detection.

    Returns:
        (title, markdown_content, images)
        - title: from PDF metadata or first large-text line
        - markdown_content: extracted and structured markdown
        - images: list of dicts with keys: data, ext, index
    """
    doc = fitz.open(filepath)

    # Extract title from metadata first
    title = _extract_title_from_metadata(doc)

    # Build font size lookup from dict extraction (for heading detection)
    font_info = _build_font_info(doc)
    body_size = font_info['body_size']

    # Extract text using sort=True (preserves spaces and reading order)
    raw_text = ''
    for page_num in range(len(doc)):
        page = doc[page_num]
        page_text = page.get_text(sort=True)
        if page_text:
            raw_text += page_text + '\n\n'

    # Convert to structured markdown using font info for headings
    markdown = _text_to_markdown(raw_text, font_info, body_size)

    # Extract title from content if metadata didn't have one
    if not title:
        title = _extract_first_heading(markdown)
    if not title:
        # Try first non-empty line
        for line in raw_text.split('\n'):
            stripped = line.strip()
            if stripped and len(stripped) > 3:
                title = stripped
                break
    if not title:
        name = os.path.splitext(os.path.basename(filepath))[0]
        title = name.replace('-', ' ').replace('_', ' ').title()

    # Remove title from content body (it goes into front matter)
    markdown = _remove_title_from_content(markdown, title)

    # Extract images
    images = _extract_images(doc)

    doc.close()
    return title, markdown, images


def _extract_title_from_metadata(doc: fitz.Document) -> str | None:
    """Try to get title from PDF metadata."""
    meta = doc.metadata
    if meta and meta.get('title'):
        title = meta['title'].strip()
        if title and title.lower() not in ('untitled', 'microsoft word', ''):
            return title
    return None


def _build_font_info(doc: fitz.Document) -> dict:
    """Analyze font sizes across the document using dict extraction.

    Returns a dict with:
        - body_size: most common font size
        - line_sizes: mapping of normalized text -> (avg_size, is_bold)
    """
    all_sizes = []
    line_sizes = {}

    for page_num in range(len(doc)):
        page = doc[page_num]
        page_dict = page.get_text('dict')

        for block in page_dict.get('blocks', []):
            if block.get('type') != 0:
                continue

            for line in block.get('lines', []):
                text_parts = []
                sizes = []
                is_bold = False

                for span in line.get('spans', []):
                    text = span.get('text', '')
                    if text.strip():
                        text_parts.append(text.strip())
                        sizes.append(span.get('size', 12))
                        font = span.get('font', '').lower()
                        if 'bold' in font or 'heavy' in font or 'black' in font:
                            is_bold = True

                if text_parts and sizes:
                    # Build a normalized key from the text content
                    full_text = ' '.join(text_parts).strip()
                    # Use first 60 chars as lookup key
                    key = _normalize_for_lookup(full_text)
                    avg_size = statistics.mean(sizes)
                    all_sizes.append(avg_size)
                    line_sizes[key] = (avg_size, is_bold)

    # Determine body size (mode of all sizes)
    body_size = 12.0
    if all_sizes:
        size_counts = {}
        for s in all_sizes:
            rounded = round(s, 1)
            size_counts[rounded] = size_counts.get(rounded, 0) + 1
        body_size = max(size_counts, key=size_counts.get)

    return {'body_size': body_size, 'line_sizes': line_sizes}


def _normalize_for_lookup(text: str) -> str:
    """Normalize text for font size lookup matching."""
    # Remove extra whitespace, lowercase, take first 60 chars
    normalized = re.sub(r'\s+', ' ', text).strip().lower()
    return normalized[:60]


def _text_to_markdown(raw_text: str, font_info: dict, body_size: float) -> str:
    """Convert extracted text to markdown, using font info for heading detection."""
    line_sizes = font_info['line_sizes']
    lines = raw_text.split('\n')
    result = []

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if result and result[-1] != '':
                result.append('')
            continue

        # Look up font size for this line
        lookup_key = _normalize_for_lookup(stripped)
        size_info = line_sizes.get(lookup_key)

        # Try partial matching if exact lookup fails
        if not size_info:
            size_info = _fuzzy_font_lookup(lookup_key, line_sizes)

        if size_info:
            avg_size, is_bold = size_info
            ratio = avg_size / body_size if body_size > 0 else 1

            if ratio >= 1.5:
                result.append(f'## {stripped}')
                result.append('')
                continue
            elif ratio >= 1.25:
                result.append(f'### {stripped}')
                result.append('')
                continue
            elif ratio >= 1.1 and is_bold:
                result.append(f'#### {stripped}')
                result.append('')
                continue
            elif is_bold and len(stripped) < 80:
                # Short bold line -> bold text
                result.append(f'**{stripped}**')
                result.append('')
                continue

        # Detect list items
        list_match = re.match(r'^[\u2022\u2023\u25e6\u25aa\u25ab\u2043\uf0b7\-]\s*(.+)', stripped)
        num_match = re.match(r'^(\d+)[.)]\s+(.+)', stripped)

        if list_match:
            result.append(f'- {list_match.group(1)}')
        elif num_match:
            result.append(f'{num_match.group(1)}. {num_match.group(2)}')
        else:
            result.append(stripped)

    return '\n'.join(result)


def _fuzzy_font_lookup(key: str, line_sizes: dict) -> tuple | None:
    """Try to find a font size match using partial text matching."""
    if len(key) < 5:
        return None
    # Try matching first 30 chars
    short_key = key[:30]
    for stored_key, info in line_sizes.items():
        if stored_key.startswith(short_key) or short_key.startswith(stored_key[:30]):
            return info
    return None


def _extract_first_heading(markdown: str) -> str | None:
    """Extract the first heading text from markdown."""
    match = re.search(r'^#{2,6}\s+(.+)$', markdown, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None


def _remove_title_from_content(markdown: str, title: str) -> str:
    """Remove the title line from markdown content (it goes in front matter)."""
    lines = markdown.split('\n')
    title_normalized = title.strip().lower()

    for i, line in enumerate(lines):
        stripped = line.strip()
        # Check for heading that matches title
        heading_match = re.match(r'^#{1,6}\s+(.+)$', stripped)
        if heading_match and heading_match.group(1).strip().lower() == title_normalized:
            lines[i] = ''
            if i + 1 < len(lines) and lines[i + 1].strip() == '':
                lines[i + 1] = ''
            break
        # Also check for plain text match at the start
        elif stripped.lower() == title_normalized and i < 5:
            lines[i] = ''
            if i + 1 < len(lines) and lines[i + 1].strip() == '':
                lines[i + 1] = ''
            break

    return '\n'.join(lines)


def _extract_images(doc: fitz.Document) -> list[dict]:
    """Extract all images from the PDF."""
    images = []
    seen_xrefs = set()

    for page_num in range(len(doc)):
        page = doc[page_num]
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                extracted = doc.extract_image(xref)
                if not extracted or not extracted.get('image'):
                    continue

                ext = extracted.get('ext', 'png')
                if ext == 'jpeg':
                    ext = 'jpg'

                # Skip very small images (likely icons/bullets)
                if extracted.get('width', 0) < 50 or extracted.get('height', 0) < 50:
                    continue

                images.append({
                    'data': extracted['image'],
                    'ext': ext,
                    'index': len(images),
                })
            except Exception as e:
                print(f'  Warning: Could not extract image (xref={xref}): {e}')

    return images
