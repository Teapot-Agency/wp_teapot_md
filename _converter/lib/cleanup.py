"""Markdown post-processing and cleanup for converted documents."""

import re


def cleanup_markdown(md: str) -> str:
    """Run all cleanup passes on converted markdown."""
    md = fix_heading_hierarchy(md)
    md = fix_czech_typography(md)
    md = fix_broken_headings(md)
    md = fix_list_formatting(md)
    md = collapse_blank_lines(md)
    md = strip_trailing_whitespace(md)
    md = ensure_final_newline(md)
    return md


def fix_heading_hierarchy(md: str) -> str:
    """Ensure no H1 in body content - demote all headings if H1 exists.

    The title field in front matter serves as H1, so body content
    must start at H2 (##).
    """
    if not re.search(r'^# [^#]', md, re.MULTILINE):
        return md

    lines = md.split('\n')
    result = []
    for line in lines:
        match = re.match(r'^(#{1,5}) (.+)$', line)
        if match:
            hashes = match.group(1)
            text = match.group(2)
            result.append(f'#{hashes} {text}')
        else:
            result.append(line)
    return '\n'.join(result)


def fix_czech_typography(md: str) -> str:
    """Normalize Czech/Slovak typography for clean markdown."""
    # „Czech quotes" (U+201E opening, U+201C closing) -> "
    md = md.replace('\u201e', '"').replace('\u201c', '"')
    # Left/right double quotes -> "
    md = md.replace('\u201d', '"')
    # Left/right single quotes -> '
    md = md.replace('\u2018', "'").replace('\u2019', "'")
    # Em dash -> --
    md = re.sub(r'\s*\u2014\s*', ' -- ', md)
    # En dash -> --
    md = re.sub(r'\s*\u2013\s*', ' -- ', md)
    # Ellipsis character -> ...
    md = md.replace('\u2026', '...')
    # Non-breaking space -> regular space
    md = md.replace('\u00a0', ' ')
    # Narrow no-break space (used in SK/CZ before %, units)
    md = md.replace('\u202f', ' ')
    return md


def fix_broken_headings(md: str) -> str:
    """Rejoin headings that were split across multiple lines.

    Detects patterns like:
        ## AI Overviews znizuju CTR o 58

        ## %: Aktualizovana analyza

    And merges them into a single heading.
    """
    lines = md.split('\n')
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        match = re.match(r'^(#{2,6}) (.+)$', line)
        if match:
            level = match.group(1)
            text = match.group(2)
            # Look ahead: blank line(s) followed by same-level heading
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            if j < len(lines):
                next_match = re.match(r'^(#{2,6}) (.+)$', lines[j])
                if (next_match and next_match.group(1) == level
                        and _looks_like_continuation(text, next_match.group(2))):
                    # Merge: the next heading is a continuation
                    result.append(f'{level} {text}{next_match.group(2)}')
                    i = j + 1
                    continue
            result.append(line)
        else:
            result.append(line)
        i += 1
    return '\n'.join(result)


def _looks_like_continuation(first: str, second: str) -> bool:
    """Heuristic: does the second heading look like a continuation of the first?

    Signs of continuation:
    - Second part starts with lowercase or punctuation
    - First part ends mid-word or with a number
    """
    if not second:
        return False
    # Starts with lowercase, punctuation, or percent sign
    if second[0].islower() or second[0] in ',:;%)-':
        return True
    # First part ends with a number (likely split number + unit)
    if first and first[-1].isdigit():
        return True
    return False


def fix_list_formatting(md: str) -> str:
    """Normalize bullet styles to consistent '-' markers."""
    # Replace * and + bullets with -
    md = re.sub(r'^(\s*)[*+] ', r'\1- ', md, flags=re.MULTILINE)
    return md


def collapse_blank_lines(md: str) -> str:
    """Replace 3+ consecutive blank lines with 2."""
    return re.sub(r'\n{4,}', '\n\n\n', md)


def strip_trailing_whitespace(md: str) -> str:
    """Remove trailing whitespace from each line."""
    return '\n'.join(line.rstrip() for line in md.split('\n'))


def ensure_final_newline(md: str) -> str:
    """Ensure file ends with exactly one newline."""
    return md.rstrip('\n') + '\n'
