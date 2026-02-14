"""YAML front matter generation for Git it Write posts."""

from datetime import datetime


def build_frontmatter(
    title: str,
    status: str = 'draft',
    excerpt: str = '',
    date: str = None,
    categories: list[str] = None,
    tags: list[str] = None,
    featured_image: str = None,
) -> str:
    """Build YAML front matter string matching Git it Write conventions.

    Output matches the style used in existing posts (e.g. pharma01.md).
    """
    lines = ['---']

    # Quote title if it contains colons (YAML special char)
    if ':' in title:
        lines.append(f'title: "{title}"')
    else:
        lines.append(f'title: {title}')

    lines.append(f'post_status: {status}')

    if date:
        lines.append(f'post_date: {date}')
    else:
        lines.append(f'post_date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')

    if excerpt:
        # Quote excerpt if it contains colons
        if ':' in excerpt:
            lines.append(f'post_excerpt: "{excerpt}"')
        else:
            lines.append(f'post_excerpt: {excerpt}')

    if featured_image:
        lines.append(f'featured_image: {featured_image}')

    if categories or tags:
        lines.append('taxonomy:')
        if categories:
            lines.append('    category:')
            for cat in categories:
                lines.append(f'        - {cat}')
        if tags:
            lines.append('    post_tag:')
            for tag in tags:
                lines.append(f'        - {tag}')

    lines.append('---')
    return '\n'.join(lines) + '\n'


def extract_excerpt(content: str, max_length: int = 200) -> str:
    """Extract first meaningful sentence(s) from content as an excerpt."""
    # Strip markdown headings and blank lines from the start
    lines = []
    for line in content.split('\n'):
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            lines.append(stripped)
            if len(' '.join(lines)) >= max_length:
                break

    text = ' '.join(lines)
    if len(text) <= max_length:
        return text

    # Truncate at sentence boundary
    truncated = text[:max_length]
    last_period = truncated.rfind('.')
    if last_period > max_length // 2:
        return truncated[:last_period + 1]
    return truncated.rsplit(' ', 1)[0] + '...'
