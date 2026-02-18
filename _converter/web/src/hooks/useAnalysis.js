import { useState } from 'react';
import { analyzeArticle } from '../lib/api';

export default function useAnalysis({
  title,
  markdown,
  setMetaTitle,
  setMetaDescription,
  setSlug,
  setSlugManual,
  setFeaturedPrompt,
  setFeaturedSeoName,
  setFeaturedSeoManual,
  setSuggestedBodyImages,
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [languageCorrections, setLanguageCorrections] = useState([]);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [langCheckOpen, setLangCheckOpen] = useState(false);

  // Analyze article
  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeArticle(title, markdown);
      setMetaTitle(result.metaTitle || '');
      setMetaDescription(result.metaDescription || '');
      if (result.slug) {
        setSlug(result.slug);
        setSlugManual(true);
      }
      if (result.featuredImage) {
        setFeaturedPrompt(result.featuredImage.prompt || '');
        if (result.featuredImage.seoFilename) {
          setFeaturedSeoName(result.featuredImage.seoFilename);
          setFeaturedSeoManual(true);
        }
      }
      if (result.bodyImages && result.bodyImages.length > 0) {
        setSuggestedBodyImages(result.bodyImages);
      }
      if (result.languageCorrections?.length > 0) {
        setLanguageCorrections(result.languageCorrections);
        setLangCheckOpen(true);
      } else {
        setLanguageCorrections([]);
      }
      setDetectedLanguage(result.detectedLanguage || '');
    } catch (err) {
      alert('Article analysis failed: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Accept a single language correction
  const handleAcceptCorrection = (index, setMarkdown, setTitle) => {
    const correction = languageCorrections[index];
    setMarkdown(prev => prev.replaceAll(correction.original, correction.suggested));
    setTitle(prev => {
      if (prev.includes(correction.original)) {
        return prev.replaceAll(correction.original, correction.suggested);
      }
      return prev;
    });
    setLanguageCorrections(prev => prev.filter((_, i) => i !== index));
  };

  // Dismiss a single correction
  const handleDismissCorrection = (index) => {
    setLanguageCorrections(prev => prev.filter((_, i) => i !== index));
  };

  // Accept all remaining corrections
  const handleAcceptAllCorrections = (currentMarkdown, currentTitle, setMarkdown, setTitle) => {
    let updatedMarkdown = currentMarkdown;
    let updatedTitle = currentTitle;
    for (const correction of languageCorrections) {
      updatedMarkdown = updatedMarkdown.replaceAll(correction.original, correction.suggested);
      if (updatedTitle.includes(correction.original)) {
        updatedTitle = updatedTitle.replaceAll(correction.original, correction.suggested);
      }
    }
    setMarkdown(updatedMarkdown);
    setTitle(updatedTitle);
    setLanguageCorrections([]);
  };

  return {
    analyzing,
    languageCorrections, setLanguageCorrections,
    detectedLanguage, setDetectedLanguage,
    langCheckOpen, setLangCheckOpen,
    handleAnalyze,
    handleAcceptCorrection,
    handleDismissCorrection,
    handleAcceptAllCorrections,
  };
}
