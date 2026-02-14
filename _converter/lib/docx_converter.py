"""DOCX to Markdown converter using mammoth for semantic HTML extraction."""

import mammoth
from bs4 import BeautifulSoup
from markdownify import markdownify as md


# Mammoth style map: maps Word styles to HTML elements
STYLE_MAP = """
p[style-name='Heading 1'] => h1:fresh
p[style-name='Heading 2'] => h2:fresh
p[style-name='Heading 3'] => h3:fresh
p[style-name='Heading 4'] => h4:fresh
p[style-name='Heading 5'] => h5:fresh
p[style-name='Title'] => h1:fresh
p[style-name='Subtitle'] => h2:fresh
b => strong
i => em
u => em
""".strip()


def convert_docx(filepath: str) -> tuple[str, str, list[dict]]:
    """Convert a DOCX file to markdown content.

    Returns:
        (title, markdown_content, images)
        - title: extracted from first heading or filename
        - markdown_content: converted markdown text
        - images: list of dicts with keys: data, ext, index
    """
    images = []

    def handle_image(image):
        """Mammoth image handler: extract image data and return placeholder."""
        with image.open() as img_stream:
            data = img_stream.read()
        ext = image.content_type.split('/')[-1]
        # Normalize extension
        if ext == 'jpeg':
            ext = 'jpg'
        elif ext in ('x-wmf', 'x-emf', 'wmf', 'emf'):
            # Windows metafiles - skip with warning
            print(f'  Warning: Skipping Windows metafile image ({ext})')
            return {}
        idx = len(images)
        images.append({'data': data, 'ext': ext, 'index': idx})
        return {'src': f'__IMAGE_{idx}__'}

    # Convert DOCX to HTML via mammoth
    with open(filepath, 'rb') as f:
        result = mammoth.convert_to_html(
            f,
            style_map=STYLE_MAP,
            convert_image=mammoth.images.img_element(handle_image),
        )

    html = result.value

    # Log any conversion warnings
    for msg in result.messages:
        if msg.type == 'warning':
            print(f'  Warning: {msg.message}')

    # Clean up HTML before markdown conversion
    html = _clean_html(html)

    # Convert HTML to markdown
    markdown = md(
        html,
        heading_style='atx',
        bullets='-',
        strip=['span'],
        newline_style='backslash',
    )

    # Extract title from first heading
    title = _extract_title(html, filepath)

    # Remove the first heading from content (it becomes the front matter title)
    markdown = _remove_first_heading(markdown, title)

    return title, markdown, images


def _clean_html(html: str) -> str:
    """Clean up mammoth's HTML output before markdown conversion."""
    soup = BeautifulSoup(html, 'html.parser')

    # Remove empty paragraphs
    for p in soup.find_all('p'):
        if not p.get_text(strip=True) and not p.find('img'):
            p.decompose()

    # Remove empty spans
    for span in soup.find_all('span'):
        if not span.get_text(strip=True):
            span.unwrap() if span.parent else span.decompose()

    return str(soup)


def _extract_title(html: str, filepath: str) -> str:
    """Extract title from the first heading in HTML."""
    soup = BeautifulSoup(html, 'html.parser')

    # Try headings in order
    for tag in ['h1', 'h2', 'h3']:
        heading = soup.find(tag)
        if heading:
            return heading.get_text(strip=True)

    # Fall back to first bold text
    bold = soup.find(['strong', 'b'])
    if bold:
        text = bold.get_text(strip=True)
        if len(text) > 5:
            return text

    # Last resort: use filename
    import os
    name = os.path.splitext(os.path.basename(filepath))[0]
    return name.replace('-', ' ').replace('_', ' ').title()


def _remove_first_heading(markdown: str, title: str) -> str:
    """Remove the first heading from markdown if it matches the title.

    The title goes into front matter, so we don't want it duplicated in body.
    """
    lines = markdown.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('#'):
            # Extract heading text
            heading_text = stripped.lstrip('#').strip()
            if heading_text == title:
                lines[i] = ''
                # Also remove blank line after it
                if i + 1 < len(lines) and lines[i + 1].strip() == '':
                    lines[i + 1] = ''
                break
    return '\n'.join(lines)
