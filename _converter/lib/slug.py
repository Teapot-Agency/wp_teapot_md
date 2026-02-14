"""Slovak/Czech-aware slug generation for post URLs."""

import re
from unidecode import unidecode

# Slovak/Czech specific transliterations (safety net before unidecode)
_SK_CZ_MAP = {
    'á': 'a', 'č': 'c', 'ď': 'd', 'é': 'e', 'ě': 'e',
    'í': 'i', 'ĺ': 'l', 'ľ': 'l', 'ň': 'n', 'ó': 'o',
    'ô': 'o', 'ŕ': 'r', 'ř': 'r', 'š': 's', 'ť': 't',
    'ú': 'u', 'ů': 'u', 'ý': 'y', 'ž': 'z', 'ä': 'a',
    'Á': 'a', 'Č': 'c', 'Ď': 'd', 'É': 'e', 'Ě': 'e',
    'Í': 'i', 'Ĺ': 'l', 'Ľ': 'l', 'Ň': 'n', 'Ó': 'o',
    'Ô': 'o', 'Ŕ': 'r', 'Ř': 'r', 'Š': 's', 'Ť': 't',
    'Ú': 'u', 'Ů': 'u', 'Ý': 'y', 'Ž': 'z', 'Ä': 'a',
}


def generate_slug(title: str, max_length: int = 60) -> str:
    """Convert a Slovak/Czech title to a URL-safe slug.

    Examples:
        'Budúcnosť medicíny v zajatí algoritmov' -> 'buducnost-mediciny-v-zajati-algoritmov'
        'AI Overviews drasticky znižujú CTR o 58 %' -> 'ai-overviews-drasticky-znizuju-ctr-o-58'
    """
    slug = title.lower()
    # Apply Slovak/Czech specific transliteration first
    slug = ''.join(_SK_CZ_MAP.get(c, c) for c in slug)
    # Then unidecode for any remaining non-ASCII
    slug = unidecode(slug)
    # Replace non-alphanumeric with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    # Strip leading/trailing hyphens
    slug = slug.strip('-')
    # Truncate at word boundary
    if len(slug) > max_length:
        slug = slug[:max_length].rsplit('-', 1)[0]
    return slug


def unique_slug(slug: str, existing_files: list[str]) -> str:
    """Ensure slug doesn't collide with existing files.

    Appends -2, -3, etc. if needed.
    """
    existing_slugs = {f.removesuffix('.md') for f in existing_files}
    if slug not in existing_slugs:
        return slug
    counter = 2
    while f'{slug}-{counter}' in existing_slugs:
        counter += 1
    return f'{slug}-{counter}'
