import { useState, useEffect } from 'react';
import { loadArticle } from './lib/api';
import { parseFrontmatter } from './lib/frontmatter';
import useConverterForm from './hooks/useConverterForm';
import useImageGeneration from './hooks/useImageGeneration';
import useAnalysis from './hooks/useAnalysis';
import TranslateView from './components/TranslateView';
import ImageLightbox from './components/ImageLightbox';
import ContentTab from './components/ContentTab';
import SeoMediaTab from './components/SeoMediaTab';
import PreviewPanel from './components/PreviewPanel';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('converter');

  // --- Domain hooks ---
  const form = useConverterForm();
  const images = useImageGeneration({
    slug: form.slug,
    setFeaturedImage: form.setFeaturedImage,
    setMarkdown: form.setMarkdown,
  });
  const analysis = useAnalysis({
    title: form.title,
    markdown: form.markdown,
    setMetaTitle: form.setMetaTitle,
    setMetaDescription: form.setMetaDescription,
    setSlug: form.setSlug,
    setSlugManual: form.setSlugManual,
    setFeaturedPrompt: images.setFeaturedPrompt,
    setFeaturedSeoName: images.setFeaturedSeoName,
    setFeaturedSeoManual: images.setFeaturedSeoManual,
    setSuggestedBodyImages: images.setSuggestedBodyImages,
  });

  // --- Cross-domain: unsaved work guard ---
  const hasUnsavedWork = !!(form.markdown || form.title || images.featuredPreview || images.bodyImages.length > 0);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedWork) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedWork]);

  // --- Cross-domain: Reset ---
  const handleReset = () => {
    if (hasUnsavedWork && !window.confirm('You have unsaved content. Are you sure you want to reset everything?')) {
      return;
    }
    form.setHtml('');
    form.setMarkdown('');
    form.setTitle('');
    form.setSlug('');
    form.setSlugManual(false);
    form.setStatus('draft');
    form.setExcerpt('');
    form.setCategories('');
    form.setTags('');
    form.setFeaturedImage('');
    form.setSaveStatus(null);
    form.setSaveMessage('');
    form.setMetaTitle('');
    form.setMetaDescription('');
    form.setActiveSubTab('content');

    images.setFeaturedPrompt('');
    images.setFeaturedSeoName('');
    images.setFeaturedPreview('');
    images.setFeaturedSeoManual(false);
    images.setBodyImages([]);
    images.setBodyImagePrompt('');
    images.setBodyImageSeoName('');
    images.setBodyImageSeoManual(false);
    images.setDraggedImage(null);
    images.setSuggestedBodyImages([]);
    images.setLightboxUrl(null);

    analysis.setLanguageCorrections([]);
    analysis.setDetectedLanguage('');
    analysis.setLangCheckOpen(false);

    if (form.pasteRef.current) {
      form.pasteRef.current.innerHTML = '';
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localDatetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    form.setDate(localDatetime);
  };

  // --- Cross-domain: Load Article ---
  const handleLoadArticle = async (articleSlug) => {
    const target = articleSlug || form.loadSlug;
    if (!target) return;
    if (hasUnsavedWork && !window.confirm('You have unsaved content. Loading an article will replace it. Continue?')) {
      return;
    }
    form.setLoadingArticle(true);
    try {
      const { content } = await loadArticle(target);
      const parsed = parseFrontmatter(content);

      // Populate form fields
      form.setTitle(parsed.title);
      form.setSlug(target);
      form.setLoadSlug(target);
      form.setSlugManual(true);
      form.setStatus(parsed.status || 'draft');
      form.setExcerpt(parsed.excerpt);
      form.setCategories(parsed.categories.join(', '));
      form.setTags(parsed.tags.join(', '));
      form.setFeaturedImage(parsed.featuredImage);
      form.setMetaTitle(parsed.metaTitle);
      form.setMetaDescription(parsed.metaDescription);
      form.setMarkdown(parsed.body);
      form.setHtml('');

      // Convert date
      if (parsed.date) {
        const dtMatch = parsed.date.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        form.setDate(dtMatch ? `${dtMatch[1]}T${dtMatch[2]}` : '');
      }

      // Set featured image preview
      if (parsed.featuredImage) {
        const parts = parsed.featuredImage.match(/^_images\/([^/]+)\/(.+)$/);
        if (parts) {
          images.setFeaturedPreview(`/api/images/${parts[1]}/${parts[2]}`);
        }
      } else {
        images.setFeaturedPreview('');
      }

      // Load existing images from disk
      try {
        const imgRes = await fetch(`/api/images/${encodeURIComponent(target)}`);
        if (imgRes.ok) {
          const { images: diskImages } = await imgRes.json();
          const featuredFile = parsed.featuredImage ? parsed.featuredImage.split('/').pop() : '';
          const bodyImgs = diskImages
            .filter(img => img.filename !== featuredFile)
            .map((img, i) => ({ id: Date.now() + i, ...img }));
          images.setBodyImages(bodyImgs);
        } else {
          images.setBodyImages([]);
        }
      } catch {
        images.setBodyImages([]);
      }

      // Clear AI/generation state
      images.setSuggestedBodyImages([]);
      images.setFeaturedPrompt('');
      images.setFeaturedSeoName('');
      images.setFeaturedSeoManual(false);
      analysis.setLanguageCorrections([]);
      analysis.setDetectedLanguage('');
      form.setSaveStatus(null);
      form.setSaveMessage('');

      if (form.pasteRef.current) {
        form.pasteRef.current.innerHTML = '<em style="color:#888">Content loaded from file (edit in markdown preview)</em>';
      }

      form.setActiveSubTab('content');
    } catch (err) {
      alert('Failed to load article: ' + err.message);
    } finally {
      form.setLoadingArticle(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Teapot Content Tools</h1>
        <nav className="tab-nav">
          <button
            className={activeTab === 'converter' ? 'active' : ''}
            onClick={() => { form.syncEditText(); setActiveTab('converter'); }}
          >
            Converter
          </button>
          <button
            className={activeTab === 'translate' ? 'active' : ''}
            onClick={() => { form.syncEditText(); setActiveTab('translate'); }}
          >
            Translate
          </button>
        </nav>
      </header>

      {activeTab === 'translate' && <TranslateView />}

      <ImageLightbox url={images.lightboxUrl} onClose={() => images.setLightboxUrl(null)} />

      {activeTab === 'converter' && (
        <div className="two-col-layout">
          {/* ===== LEFT COLUMN: Editor with sub-tabs ===== */}
          <div className="editor-column">
            {/* Load existing article bar */}
            <div className="load-article-bar">
              <select
                value={form.loadSlug}
                onChange={(e) => {
                  const val = e.target.value;
                  form.setLoadSlug(val);
                  if (val) handleLoadArticle(val);
                }}
                disabled={form.loadingArticle}
              >
                <option value="">{form.loadingArticle ? 'Loading...' : 'Load existing article...'}</option>
                {form.existingFiles
                  .filter((f) => f.slug !== 'index')
                  .map((f) => {
                    const dateStr = f.modified
                      ? new Date(f.modified).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })
                      : '';
                    const langs = f.languages?.length ? ` [${f.languages.join(',')}]` : '';
                    const statusIcon = f.status === 'publish' ? '' : ' (draft)';
                    return (
                      <option key={f.slug} value={f.slug}>
                        {dateStr} | {f.title}{statusIcon}{langs}
                      </option>
                    );
                  })}
              </select>
            </div>

            <div className="sub-tab-nav">
              <button
                className={form.activeSubTab === 'content' ? 'active' : ''}
                onClick={() => form.setActiveSubTab('content')}
              >
                Content
              </button>
              <button
                className={form.activeSubTab === 'seo' ? 'active' : ''}
                onClick={() => form.setActiveSubTab('seo')}
              >
                SEO & Media
                {analysis.languageCorrections.length > 0 && (
                  <span className="sub-tab-badge">{analysis.languageCorrections.length}</span>
                )}
              </button>
            </div>

            <div className="editor-panel">
              {/* ---- Content sub-tab ---- */}
              <div className="sub-tab-content" style={{ display: form.activeSubTab === 'content' ? 'block' : 'none' }}>
                <ContentTab
                  pasteRef={form.pasteRef}
                  handlePaste={form.handlePaste}
                  handleInput={form.handleInput}
                  handleClearPaste={form.handleClearPaste}
                  title={form.title}
                  setTitle={form.setTitle}
                  analyzing={analysis.analyzing}
                  markdown={form.markdown}
                  handleAnalyze={analysis.handleAnalyze}
                  slug={form.slug}
                  setSlug={form.setSlug}
                  slugManual={form.slugManual}
                  setSlugManual={form.setSlugManual}
                  existingFiles={form.existingFiles}
                  status={form.status}
                  setStatus={form.setStatus}
                  date={form.date}
                  setDate={form.setDate}
                  excerpt={form.excerpt}
                  setExcerpt={form.setExcerpt}
                />
              </div>

              {/* ---- SEO & Media sub-tab ---- */}
              <div className="sub-tab-content" style={{ display: form.activeSubTab === 'seo' ? 'block' : 'none' }}>
                <SeoMediaTab
                  languageCorrections={analysis.languageCorrections}
                  detectedLanguage={analysis.detectedLanguage}
                  langCheckOpen={analysis.langCheckOpen}
                  setLangCheckOpen={analysis.setLangCheckOpen}
                  handleAcceptCorrection={(idx) => analysis.handleAcceptCorrection(idx, form.setMarkdown, form.setTitle)}
                  handleDismissCorrection={analysis.handleDismissCorrection}
                  handleAcceptAllCorrections={() => analysis.handleAcceptAllCorrections(form.markdown, form.title, form.setMarkdown, form.setTitle)}
                  metaTitle={form.metaTitle}
                  setMetaTitle={form.setMetaTitle}
                  metaDescription={form.metaDescription}
                  setMetaDescription={form.setMetaDescription}
                  categories={form.categories}
                  setCategories={form.setCategories}
                  tags={form.tags}
                  setTags={form.setTags}
                  allCategories={form.allCategories}
                  existingTags={form.existingTags}
                  addCategory={form.addCategory}
                  addTag={form.addTag}
                  slug={form.slug}
                  featuredPrompt={images.featuredPrompt}
                  setFeaturedPrompt={images.setFeaturedPrompt}
                  featuredSeoName={images.featuredSeoName}
                  setFeaturedSeoName={images.setFeaturedSeoName}
                  featuredSeoManual={images.featuredSeoManual}
                  setFeaturedSeoManual={images.setFeaturedSeoManual}
                  featuredPreview={images.featuredPreview}
                  featuredPreviewRef={images.featuredPreviewRef}
                  featuredImage={form.featuredImage}
                  featuredImageLoading={images.featuredImageLoading}
                  handleGenerateFeaturedImage={images.handleGenerateFeaturedImage}
                  setLightboxUrl={images.setLightboxUrl}
                  suggestedBodyImages={images.suggestedBodyImages}
                  setSuggestedBodyImages={images.setSuggestedBodyImages}
                  handleGenerateSuggestedImage={images.handleGenerateSuggestedImage}
                  bodyImages={images.bodyImages}
                  bodyImagePrompt={images.bodyImagePrompt}
                  setBodyImagePrompt={images.setBodyImagePrompt}
                  bodyImageSeoName={images.bodyImageSeoName}
                  setBodyImageSeoName={images.setBodyImageSeoName}
                  bodyImageSeoManual={images.bodyImageSeoManual}
                  setBodyImageSeoManual={images.setBodyImageSeoManual}
                  bodyImageLoading={images.bodyImageLoading}
                  handleGenerateBodyImage={images.handleGenerateBodyImage}
                  setDraggedImage={images.setDraggedImage}
                  removeBodyImage={images.removeBodyImage}
                />
              </div>
            </div>
          </div>

          {/* ===== RIGHT COLUMN: Preview + Actions ===== */}
          <div className="preview-column">
            <PreviewPanel
              fullOutput={form.fullOutput}
              previewMode={form.previewMode}
              setPreviewMode={form.setPreviewMode}
              editText={form.editText}
              setEditText={form.setEditText}
              syncEditText={form.syncEditText}
              onInsertBodyImage={form.handleInsertBodyImage}
            />

            <div className="action-bar">
              <button
                onClick={() => form.handleSave(false)}
                className="btn btn-primary"
                disabled={!form.slug || !form.markdown || form.saveStatus === 'saving'}
              >
                {form.saveStatus === 'saving' ? 'Saving...' : 'Save to blog/'}
              </button>
              <button onClick={form.handleCopy} className="btn btn-secondary">
                {form.copyFeedback ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={handleReset} className="btn btn-secondary">
                Reset
              </button>
              {form.saveMessage && (
                <span className={`save-message ${form.saveStatus}`}>{form.saveMessage}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
