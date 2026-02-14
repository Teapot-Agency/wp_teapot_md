"""Image extraction, conversion, and saving for _images/ directory."""

import hashlib
import os
import re
from io import BytesIO

from PIL import Image


# Max width for extracted images (preserves aspect ratio)
MAX_IMAGE_WIDTH = 1600


def save_images(
    images: list[dict],
    slug: str,
    images_base_dir: str,
) -> dict[str, str]:
    """Save extracted images to _images/{slug}/ and return placeholder mapping.

    Args:
        images: List of dicts with keys: data (bytes), ext (str), index (int)
        slug: Post slug for subdirectory naming
        images_base_dir: Absolute path to the _images/ directory

    Returns:
        Mapping of placeholder -> markdown image path
        e.g. {'__IMAGE_0__': '/_images/my-post/image-001.jpg'}
    """
    if not images:
        return {}

    output_dir = os.path.join(images_base_dir, slug)
    os.makedirs(output_dir, exist_ok=True)

    mapping = {}
    seen_hashes = {}

    for img_info in images:
        data = img_info['data']
        idx = img_info['index']
        placeholder = f'__IMAGE_{idx}__'

        # Deduplicate by content hash
        content_hash = hashlib.md5(data).hexdigest()[:12]
        if content_hash in seen_hashes:
            mapping[placeholder] = seen_hashes[content_hash]
            continue

        # Convert and save
        try:
            img, ext = _process_image(data)
            filename = f'image-{idx + 1:03d}.{ext}'
            filepath = os.path.join(output_dir, filename)
            img.save(filepath, quality=85 if ext == 'jpg' else None)

            md_path = f'/_images/{slug}/{filename}'
            mapping[placeholder] = md_path
            seen_hashes[content_hash] = md_path
        except Exception as e:
            print(f'  Warning: Could not save image {idx + 1}: {e}')

    return mapping


def replace_image_placeholders(md: str, mapping: dict[str, str]) -> str:
    """Replace __IMAGE_N__ placeholders with proper markdown image references."""
    for placeholder, path in mapping.items():
        # Replace both in img tags and raw placeholders
        md = md.replace(f'src="{placeholder}"', f'src="{path}"')
        md = md.replace(placeholder, f'![image]({path})')
    # Convert any remaining HTML img tags to markdown
    md = re.sub(
        r'<img[^>]*src="([^"]+)"[^>]*/?>',
        r'![image](\1)',
        md
    )
    return md


def _process_image(data: bytes) -> tuple['Image.Image', str]:
    """Open image bytes, resize if needed, determine output format.

    Returns (PIL Image, extension) where extension is 'jpg' or 'png'.
    """
    img = Image.open(BytesIO(data))

    # Convert RGBA/palette to RGB for JPEG output
    has_transparency = img.mode in ('RGBA', 'LA', 'PA') or (
        img.mode == 'P' and 'transparency' in img.info
    )

    if has_transparency:
        ext = 'png'
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
    else:
        ext = 'jpg'
        if img.mode != 'RGB':
            img = img.convert('RGB')

    # Resize if too large
    if img.width > MAX_IMAGE_WIDTH:
        ratio = MAX_IMAGE_WIDTH / img.width
        new_height = int(img.height * ratio)
        img = img.resize((MAX_IMAGE_WIDTH, new_height), Image.LANCZOS)

    return img, ext


def get_first_image_path(mapping: dict[str, str]) -> str | None:
    """Get the path of the first image (for use as featured_image)."""
    if not mapping:
        return None
    # Return the first image by index
    first_key = min(mapping.keys(), key=lambda k: int(k.split('_')[2].rstrip('_')))
    path = mapping[first_key]
    # featured_image uses _images/ prefix without leading slash
    return path.lstrip('/')
