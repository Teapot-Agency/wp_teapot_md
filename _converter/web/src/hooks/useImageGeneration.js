import { useState, useEffect, useRef } from 'react';
import { generateImage } from '../lib/api';

function promptToFilename(prompt, maxLen = 60) {
  let s = prompt
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-[^-]*$/, '');
  return s || 'gen-001';
}

export default function useImageGeneration({ slug, setFeaturedImage, setMarkdown }) {
  // Featured image
  const [featuredPrompt, setFeaturedPrompt] = useState('');
  const [featuredSeoName, setFeaturedSeoName] = useState('');
  const [featuredPreview, setFeaturedPreview] = useState('');
  const [featuredImageLoading, setFeaturedImageLoading] = useState(false);
  const [featuredSeoManual, setFeaturedSeoManual] = useState(false);

  // Body images
  const [bodyImages, setBodyImages] = useState([]);
  const [bodyImagePrompt, setBodyImagePrompt] = useState('');
  const [bodyImageSeoName, setBodyImageSeoName] = useState('');
  const [bodyImageSeoManual, setBodyImageSeoManual] = useState(false);
  const [bodyImageLoading, setBodyImageLoading] = useState(false);
  const [draggedImage, setDraggedImage] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Suggested body images from analyze
  const [suggestedBodyImages, setSuggestedBodyImages] = useState([]);

  const featuredPreviewRef = useRef(null);

  // Auto-generate featured SEO name when prompt changes
  useEffect(() => {
    if (!featuredSeoManual && featuredPrompt) {
      setFeaturedSeoName(promptToFilename(featuredPrompt));
    } else if (!featuredSeoManual && !featuredPrompt) {
      setFeaturedSeoName('');
    }
  }, [featuredPrompt, featuredSeoManual]);

  // Auto-generate body image SEO name when prompt changes
  useEffect(() => {
    if (!bodyImageSeoManual && bodyImagePrompt) {
      setBodyImageSeoName(promptToFilename(bodyImagePrompt));
    } else if (!bodyImageSeoManual && !bodyImagePrompt) {
      setBodyImageSeoName('');
    }
  }, [bodyImagePrompt, bodyImageSeoManual]);

  // Insert image markdown before a heading that matches the given text
  const insertImageBeforeHeading = (currentMarkdown, headingText, imageData) => {
    const mdLines = currentMarkdown.split('\n');
    const target = headingText.trim().toLowerCase();
    let targetIndex = -1;
    for (let i = 0; i < mdLines.length; i++) {
      const match = mdLines[i].match(/^#{1,6}\s+(.+)$/);
      if (match && match[1].trim().toLowerCase() === target) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex === -1) return null;
    mdLines.splice(targetIndex, 0, '', `![${imageData.alt}](${imageData.mdPath} "${imageData.title}")`, '');
    return mdLines.join('\n');
  };

  // Generate featured image
  const handleGenerateFeaturedImage = async () => {
    setFeaturedImageLoading(true);
    try {
      const result = await generateImage(slug, featuredPrompt, featuredSeoName);
      setFeaturedImage(result.image.path);
      setFeaturedPreview(result.image.previewUrl);
      setTimeout(() => {
        featuredPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      alert('Image generation failed: ' + err.message);
    } finally {
      setFeaturedImageLoading(false);
    }
  };

  // Generate body image
  const handleGenerateBodyImage = async () => {
    setBodyImageLoading(true);
    try {
      const seoName = bodyImageSeoName || promptToFilename(bodyImagePrompt);
      const result = await generateImage(slug, bodyImagePrompt, seoName);
      const newImage = {
        id: Date.now(),
        prompt: bodyImagePrompt,
        seoFilename: seoName,
        ...result.image,
      };
      setBodyImages(prev => [...prev, newImage]);
      setBodyImagePrompt('');
      setBodyImageSeoName('');
      setBodyImageSeoManual(false);
    } catch (err) {
      alert('Body image generation failed: ' + err.message);
    } finally {
      setBodyImageLoading(false);
    }
  };

  // Generate a suggested body image
  const handleGenerateSuggestedImage = async (suggestion, index) => {
    setSuggestedBodyImages(prev =>
      prev.map((s, i) => i === index ? { ...s, loading: true } : s)
    );
    try {
      const result = await generateImage(slug, suggestion.prompt, suggestion.seoFilename);
      const newImage = {
        id: Date.now() + index,
        prompt: suggestion.prompt,
        seoFilename: suggestion.seoFilename,
        ...result.image,
      };
      setBodyImages(prev => [...prev, newImage]);
      // Auto-insert before the target heading if specified
      if (suggestion.afterSection) {
        const imageData = { alt: result.image.alt, mdPath: result.image.mdPath, title: result.image.title };
        setMarkdown(prev => {
          const updated = insertImageBeforeHeading(prev, suggestion.afterSection, imageData);
          return updated !== null ? updated : prev;
        });
      }
      setSuggestedBodyImages(prev =>
        prev.map((s, i) => i === index ? { ...s, loading: false, generated: true } : s)
      );
    } catch (err) {
      alert('Image generation failed: ' + err.message);
      setSuggestedBodyImages(prev =>
        prev.map((s, i) => i === index ? { ...s, loading: false } : s)
      );
    }
  };

  // Remove a body image from the list
  const removeBodyImage = (id) => {
    setBodyImages(prev => prev.filter(img => img.id !== id));
  };

  return {
    // Featured image
    featuredPrompt, setFeaturedPrompt,
    featuredSeoName, setFeaturedSeoName,
    featuredPreview, setFeaturedPreview,
    featuredImageLoading,
    featuredSeoManual, setFeaturedSeoManual,
    featuredPreviewRef,
    handleGenerateFeaturedImage,
    // Body images
    bodyImages, setBodyImages,
    bodyImagePrompt, setBodyImagePrompt,
    bodyImageSeoName, setBodyImageSeoName,
    bodyImageSeoManual, setBodyImageSeoManual,
    bodyImageLoading,
    draggedImage, setDraggedImage,
    lightboxUrl, setLightboxUrl,
    // Suggested body images
    suggestedBodyImages, setSuggestedBodyImages,
    handleGenerateBodyImage,
    handleGenerateSuggestedImage,
    removeBodyImage,
  };
}
