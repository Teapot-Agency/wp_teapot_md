"""Gemini 3 Pro Image (Nano Banana Pro) generation client."""

import os
import time
from io import BytesIO

from google import genai
from google.genai import types
from PIL import Image as PILImage

MODEL = "gemini-3-pro-image-preview"
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]

DEFAULT_STYLE_PREFIX = (
    "Professional editorial illustration for a healthcare and pharmaceutical "
    "marketing blog. Clean, modern aesthetic with subtle corporate colors. "
    "High quality, suitable as a blog header or section image. "
)


def create_client(api_key: str | None = None) -> genai.Client:
    """Create Gemini API client.

    Uses api_key if provided, otherwise falls back to
    GEMINI_API_KEY or GOOGLE_API_KEY environment variables.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise EnvironmentError(
            "No API key found. Set GEMINI_API_KEY or GOOGLE_API_KEY "
            "environment variable, or pass --api-key."
        )
    return genai.Client(api_key=key)


def generate_image(
    client: genai.Client,
    prompt: str,
    style_prefix: str = DEFAULT_STYLE_PREFIX,
    aspect_ratio: str = "16:9",
    resolution: str = "1K",
) -> PILImage.Image:
    """Generate a single image from a text prompt.

    Returns a PIL Image object.
    Raises RuntimeError if all retries fail.
    """
    full_prompt = f"{style_prefix}{prompt}" if style_prefix else prompt

    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=[full_prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect_ratio,
                        image_size=resolution,
                    ),
                ),
            )

            # Access parts via candidates (response.parts can be None)
            parts = response.candidates[0].content.parts if response.candidates else []
            for part in parts:
                if part.inline_data is not None:
                    # inline_data.data is already raw bytes
                    return PILImage.open(BytesIO(part.inline_data.data))

            raise RuntimeError("No image data in API response")

        except Exception as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                print(f"  Retry {attempt + 1}/{MAX_RETRIES} after {delay}s: {e}")
                time.sleep(delay)

    raise RuntimeError(f"Image generation failed after {MAX_RETRIES} attempts: {last_error}")


def generate_images(
    client: genai.Client,
    prompts: list[str],
    style_prefix: str = DEFAULT_STYLE_PREFIX,
    aspect_ratio: str = "16:9",
    resolution: str = "1K",
) -> list[tuple[PILImage.Image, str]]:
    """Generate multiple images from prompts.

    Returns list of (PIL Image, prompt) tuples for successful generations.
    Logs warnings for failures but continues with remaining prompts.
    """
    results = []
    for i, prompt in enumerate(prompts):
        print(f"  Generating image {i + 1}/{len(prompts)}...")
        try:
            img = generate_image(client, prompt, style_prefix, aspect_ratio, resolution)
            results.append((img, prompt))
            print(f"  Image {i + 1} generated successfully.")
        except RuntimeError as e:
            print(f"  WARNING: Image {i + 1} failed: {e}")
    return results
