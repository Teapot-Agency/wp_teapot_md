function promptToFilename(prompt, maxLen = 60) {
  let s = prompt
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-[^-]*$/, '');
  return s || 'gen-001';
}

export default function SeoMediaTab({
  // Language quality check
  languageCorrections,
  detectedLanguage,
  langCheckOpen,
  setLangCheckOpen,
  handleAcceptCorrection,
  handleDismissCorrection,
  handleAcceptAllCorrections,
  // SEO meta
  metaTitle,
  setMetaTitle,
  metaDescription,
  setMetaDescription,
  // Categories & Tags
  categories,
  setCategories,
  tags,
  setTags,
  allCategories,
  existingTags,
  addCategory,
  addTag,
  // Featured image
  slug,
  featuredPrompt,
  setFeaturedPrompt,
  featuredSeoName,
  setFeaturedSeoName,
  featuredSeoManual,
  setFeaturedSeoManual,
  featuredPreview,
  featuredPreviewRef,
  featuredImage,
  featuredImageLoading,
  handleGenerateFeaturedImage,
  setLightboxUrl,
  // Body images
  suggestedBodyImages,
  setSuggestedBodyImages,
  handleGenerateSuggestedImage,
  bodyImages,
  bodyImagePrompt,
  setBodyImagePrompt,
  bodyImageSeoName,
  setBodyImageSeoName,
  bodyImageSeoManual,
  setBodyImageSeoManual,
  bodyImageLoading,
  handleGenerateBodyImage,
  setDraggedImage,
  removeBodyImage,
}) {
  return (
    <>
      {/* Language Quality Check */}
      {(languageCorrections.length > 0 || detectedLanguage) && (
        <details className="collapsible" open={langCheckOpen} onToggle={(e) => setLangCheckOpen(e.currentTarget.open)}>
          <summary>
            Language Quality
            {detectedLanguage && (
              <span className="lang-chip-sm">{detectedLanguage.toUpperCase()}</span>
            )}
            {languageCorrections.length > 0 && (
              <span className="correction-count">{languageCorrections.length}</span>
            )}
          </summary>
          <div className="collapsible-content">
            {languageCorrections.length === 0 ? (
              <div className="lang-check-ok">No issues found.</div>
            ) : (
              <>
                {languageCorrections.map((c, idx) => (
                  <div key={idx} className="correction-card">
                    <div className="correction-type">{c.type}</div>
                    <div className="correction-original">{c.original}</div>
                    <div className="correction-arrow">&darr;</div>
                    <div className="correction-suggested">{c.suggested}</div>
                    <div className="correction-reason">{c.reason}</div>
                    <div className="correction-actions">
                      <button className="btn-tiny correction-accept" onClick={() => handleAcceptCorrection(idx)}>Accept</button>
                      <button className="btn-tiny" onClick={() => handleDismissCorrection(idx)}>Dismiss</button>
                    </div>
                  </div>
                ))}
                <button className="btn-tiny correction-accept-all" onClick={handleAcceptAllCorrections}>
                  Accept All ({languageCorrections.length})
                </button>
              </>
            )}
          </div>
        </details>
      )}

      {/* SEO Meta Fields */}
      <h3>SEO Meta Fields</h3>
      <label>
        SEO Meta Title{' '}
        <span className={`char-counter-textarea ${metaTitle.length > 60 ? 'over' : ''}`}>
          {metaTitle.length}/60
        </span>
      </label>
      <input
        type="text"
        value={metaTitle}
        onChange={(e) => setMetaTitle(e.target.value)}
        placeholder="SEO title (max 60 chars)"
      />

      <label>
        SEO Meta Description{' '}
        <span className={`char-counter-textarea ${metaDescription.length > 155 ? 'over' : ''}`}>
          {metaDescription.length}/155
        </span>
      </label>
      <textarea
        value={metaDescription}
        onChange={(e) => setMetaDescription(e.target.value)}
        rows={3}
        placeholder="Meta description (max 155 chars)"
      />

      {/* Categories & Tags */}
      <h3>Categories & Tags</h3>
      <div className="two-col-row">
        <div>
          <label>
            Categories <span className="hint">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="pharma, digital-health"
          />
          {allCategories.length > 0 && (
            <div className="suggestions">
              {allCategories.map((c) => (
                <button key={c.slug} className="chip" onClick={() => addCategory(c.label)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label>
            Tags <span className="hint">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ai, marketing"
          />
          {existingTags.length > 0 && (
            <div className="suggestions">
              {existingTags.map((t) => (
                <button key={t} className="chip" onClick={() => addTag(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Featured Image */}
      <h3>Featured Image</h3>
      <label>Image Prompt</label>
      <input
        type="text"
        value={featuredPrompt}
        onChange={(e) => setFeaturedPrompt(e.target.value)}
        placeholder="Describe the image to generate..."
      />

      <label>SEO Filename</label>
      <div className="slug-row">
        <input
          type="text"
          value={featuredSeoName}
          onChange={(e) => {
            setFeaturedSeoName(e.target.value);
            setFeaturedSeoManual(true);
          }}
          placeholder="seo-friendly-filename"
        />
        {featuredSeoManual && (
          <button
            onClick={() => {
              setFeaturedSeoManual(false);
              setFeaturedSeoName(promptToFilename(featuredPrompt));
            }}
            className="btn-tiny"
          >
            Auto
          </button>
        )}
      </div>

      {slug && featuredSeoName && (
        <div className="featured-path">
          _images/{slug}/{featuredSeoName}.jpg
        </div>
      )}

      {featuredImageLoading ? (
        <div className="loading-text">
          <span className="spinner" />
          Generating... (15-30s)
        </div>
      ) : (
        <button
          className="btn-generate"
          onClick={handleGenerateFeaturedImage}
          disabled={!slug || !featuredPrompt || featuredImageLoading}
        >
          {featuredPreview ? 'Regenerate Image' : 'Generate Image'}
        </button>
      )}

      {featuredPreview && (
        <div className="featured-preview-compact" ref={featuredPreviewRef}>
          <img
            src={featuredPreview}
            alt="Featured image preview"
            onClick={() => setLightboxUrl(featuredPreview)}
            style={{ cursor: 'zoom-in' }}
          />
          <div className="featured-info">
            <div className="featured-preview-label">Blog header / hero image</div>
            {featuredImage && (
              <div className="featured-path">{featuredImage}</div>
            )}
          </div>
        </div>
      )}

      {/* Body Images */}
      <h3>Body Images</h3>

      {/* Suggested image cards from Analyze */}
      {suggestedBodyImages.length > 0 && (
        <div className="suggested-images">
          {suggestedBodyImages.map((suggestion, idx) => (
            <div key={idx} className={`suggested-image-card ${suggestion.generated ? 'generated' : ''}`}>
              <div className="suggested-section">After: {suggestion.afterSection}</div>
              {suggestion.generated ? (
                <>
                  <div className="suggested-prompt">{suggestion.prompt}</div>
                  <span className="suggested-done">Generated</span>
                </>
              ) : (
                <>
                  <label className="suggested-label">Prompt</label>
                  <textarea
                    className="suggested-input"
                    value={suggestion.prompt}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSuggestedBodyImages(prev =>
                        prev.map((s, i) => i === idx ? { ...s, prompt: val } : s)
                      );
                    }}
                    rows={5}
                  />
                  <label className="suggested-label">SEO Filename</label>
                  <input
                    className="suggested-input"
                    type="text"
                    value={suggestion.seoFilename || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSuggestedBodyImages(prev =>
                        prev.map((s, i) => i === idx ? { ...s, seoFilename: val } : s)
                      );
                    }}
                    placeholder="seo-friendly-filename"
                  />
                  <button
                    className="btn-generate"
                    onClick={() => handleGenerateSuggestedImage(suggestion, idx)}
                    disabled={!slug || suggestion.loading}
                    style={{ marginTop: '0.3rem' }}
                  >
                    {suggestion.loading ? (
                      <>
                        <span className="spinner" />
                        Generating...
                      </>
                    ) : (
                      'Generate'
                    )}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual prompt input */}
      <label className="suggested-label" style={{ marginTop: '0.5rem' }}>Custom Image Prompt</label>
      <div className="prompt-row">
        <input
          type="text"
          value={bodyImagePrompt}
          onChange={(e) => setBodyImagePrompt(e.target.value)}
          placeholder="Describe a custom body image..."
        />
      </div>
      {bodyImagePrompt && (
        <>
          <label className="suggested-label">SEO Filename</label>
          <div className="slug-row" style={{ marginBottom: '0.3rem' }}>
            <input
              type="text"
              value={bodyImageSeoName}
              onChange={(e) => {
                setBodyImageSeoName(e.target.value);
                setBodyImageSeoManual(true);
              }}
              placeholder="seo-friendly-filename"
            />
            {bodyImageSeoManual && (
              <button
                onClick={() => {
                  setBodyImageSeoManual(false);
                  setBodyImageSeoName(promptToFilename(bodyImagePrompt));
                }}
                className="btn-tiny"
              >
                Auto
              </button>
            )}
          </div>
        </>
      )}
      <button
        className="btn-generate"
        onClick={handleGenerateBodyImage}
        disabled={!slug || !bodyImagePrompt || bodyImageLoading}
        style={{ marginTop: '0.3rem' }}
      >
        {bodyImageLoading ? (
          <>
            <span className="spinner" />
            Generating...
          </>
        ) : (
          'Generate'
        )}
      </button>

      {bodyImages.length > 0 && <p className="hint" style={{ marginTop: '0.4rem', marginBottom: '0.2rem' }}>Drag images into the preview to insert them.</p>}
      {bodyImages.length > 0 && (
        <div className="image-cards">
          {bodyImages.map((img) => (
            <div
              key={img.id}
              className="image-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    alt: img.alt,
                    mdPath: img.mdPath,
                    title: img.title,
                  })
                );
                setDraggedImage(img);
              }}
              onDragEnd={() => setDraggedImage(null)}
            >
              <button
                className="image-card-remove"
                onClick={() => removeBodyImage(img.id)}
              >
                &times;
              </button>
              <img
                src={img.previewUrl}
                alt={img.alt || img.seoFilename}
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(img.previewUrl); }}
                style={{ cursor: 'zoom-in' }}
              />
              <div className="image-card-name">{img.filename || img.seoFilename}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
