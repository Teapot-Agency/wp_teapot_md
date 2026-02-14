"""RTF to Markdown converter using striprtf for text extraction."""

import os
import re

from striprtf.striprtf import rtf_to_text


def convert_rtf(filepath: str) -> tuple[str, str, list[dict]]:
    """Convert an RTF file to markdown content.

    RTF structure is limited, so we extract plain text and apply
    heuristic formatting detection.

    Returns:
        (title, markdown_content, images)
        - title: first non-empty line
        - markdown_content: heuristically formatted markdown
        - images: empty list (RTF image extraction not supported)
    """
    # Read RTF with encoding fallback for Slovak/Czech documents
    raw = _read_rtf(filepath)

    # Convert RTF to plain text
    text = rtf_to_text(raw)

    # Extract title (first non-empty line)
    title = _extract_title(text, filepath)

    # Apply heuristic formatting
    markdown = _format_as_markdown(text, title)

    # RTF images are not extracted (too complex, rarely used)
    if '\\pict' in raw:
        print('  Warning: RTF contains embedded images that were not extracted.')
        print('           Please extract images manually and add them to _images/')

    return title, markdown, []


def _read_rtf(filepath: str) -> str:
    """Read RTF file with encoding detection for Central European text."""
    # Try UTF-8 first
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        pass

    # Fallback to cp1250 (Windows Central European - SK/CZ)
    try:
        with open(filepath, 'r', encoding='cp1250') as f:
            return f.read()
    except UnicodeDecodeError:
        pass

    # Last resort: latin-1 (reads any byte sequence)
    with open(filepath, 'r', encoding='latin-1') as f:
        return f.read()


def _extract_title(text: str, filepath: str) -> str:
    """Extract title from the first meaningful line of text."""
    for line in text.split('\n'):
        stripped = line.strip()
        if stripped and len(stripped) > 3:
            return stripped

    # Fallback to filename
    name = os.path.splitext(os.path.basename(filepath))[0]
    return name.replace('-', ' ').replace('_', ' ').title()


def _format_as_markdown(text: str, title: str) -> str:
    """Apply heuristic formatting to plain text from RTF.

    Detects:
    - Headings (short lines followed by blank lines, all-caps lines)
    - Lists (lines starting with bullets or numbers)
    - Paragraphs (text blocks separated by blank lines)
    """
    lines = text.split('\n')
    result = []
    title_removed = False

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines (we'll add our own spacing)
        if not stripped:
            if result and result[-1] != '':
                result.append('')
            i += 1
            continue

        # Remove first line if it matches the title
        if not title_removed and stripped == title:
            title_removed = True
            i += 1
            continue

        # Detect list items
        list_match = re.match(r'^[\u2022\u2023\u25e6\-*]\s+(.+)', stripped)
        num_match = re.match(r'^(\d+)[.)]\s+(.+)', stripped)

        if list_match:
            result.append(f'- {list_match.group(1)}')
        elif num_match:
            result.append(f'{num_match.group(1)}. {num_match.group(2)}')
        elif _is_heading_candidate(stripped, lines, i):
            # Determine heading level based on heuristics
            if stripped.isupper() and len(stripped) < 80:
                result.append(f'## {stripped.title()}')
            else:
                result.append(f'## {stripped}')
            result.append('')
        else:
            result.append(stripped)

        i += 1

    return '\n'.join(result)


def _is_heading_candidate(text: str, lines: list[str], index: int) -> bool:
    """Heuristic: does this line look like a heading?

    Criteria:
    - Short line (< 80 chars) followed by a blank line
    - ALL CAPS text
    - Doesn't end with typical sentence endings like period, comma
    """
    if len(text) > 80:
        return False

    # ALL CAPS is a strong heading signal
    if text.isupper() and len(text) > 3:
        return True

    # Short line followed by blank line
    next_line = lines[index + 1].strip() if index + 1 < len(lines) else ''
    if next_line == '' and len(text) < 60:
        # But not if it ends with sentence punctuation
        if text[-1] in '.,:;!?)':
            return False
        return True

    return False
