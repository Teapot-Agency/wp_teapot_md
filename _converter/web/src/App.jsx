import { useState, useEffect, useMemo, useRef } from 'react';
import htmlToMarkdown from './lib/turndown-config';
import { cleanupMarkdown } from './lib/cleanup';
import { generateSlug } from './lib/slug';
import { buildFrontmatter } from './lib/frontmatter';
import { analyzeArticle, generateImage } from './lib/api';
import './App.css';

const DEFAULT_CATEGORIES = [
  { slug: 'ppc', label: 'PPC' },
  { slug: 'seo', label: 'SEO' },
  { slug: 'pharma', label: 'Pharma' },
  { slug: 'rx', label: 'Rx' },
  { slug: 'hcp', label: 'HCP' },
  { slug: 'ai', label: 'AI' },
  { slug: 'otc', label: 'OTC' },
  { slug: 'employer-branding', label: 'Employer Branding' },
];

/**
 * Convert a prompt string to a safe SEO-friendly filename.
 * @param {string} prompt
 * @param {number} maxLen
 * @returns {string}
 */
function promptToFilename(prompt, maxLen = 60) {
  let s = prompt
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-[^-]*$/, '');
  return s || 'gen-001';
}

/**
 * Inline drop zone component for the interactive preview.
 */
function DropZone({ onDrop }) {
  const [isOver, setIsOver] = useState(false);
  return (
    <div
      className={`drop-zone ${isOver ? 'drop-zone-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json'));
          onDrop(data);
        } catch {
          // ignore invalid drops
        }
      }}
    >
      {isOver ? 'Drop image here' : ''}
    </div>
  );
}

function App() {
  // Existing state
  const [html, setHtml] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [status, setStatus] = useState('draft');
  const [date, setDate] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [existingFiles, setExistingFiles] = useState([]);
  const [existingCategories, setExistingCategories] = useState([]);
  const [existingTags, setExistingTags] = useState([]);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // New state: SEO meta fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  // Analyze state
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedBodyImages, setSuggestedBodyImages] = useState([]);

  // New state: Featured image generation
  const [featuredPrompt, setFeaturedPrompt] = useState('');
  const [featuredSeoName, setFeaturedSeoName] = useState('');
  const [featuredPreview, setFeaturedPreview] = useState('');
  const [featuredImageLoading, setFeaturedImageLoading] = useState(false);
  const [featuredSeoManual, setFeaturedSeoManual] = useState(false);

  // New state: Body images
  const [bodyImages, setBodyImages] = useState([]);
  const [bodyImagePrompt, setBodyImagePrompt] = useState('');
  const [bodyImageLoading, setBodyImageLoading] = useState(false);
  const [draggedImage, setDraggedImage] = useState(null);

  const pasteRef = useRef(null);

  // Merge default categories with fetched ones
  const allCategories = useMemo(() => {
    const defaultSlugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    const extras = existingCategories
      .filter((s) => !defaultSlugs.includes(s))
      .map((s) => ({ slug: s, label: s }));
    return [...DEFAULT_CATEGORIES, ...extras].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [existingCategories]);

  // On mount: fetch existing data and set default date
  useEffect(() => {
    fetch('/api/blog-files')
      .then(res => res.json())
      .then(data => setExistingFiles(data))
      .catch(() => setExistingFiles([]));

    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        setExistingCategories(data.categories || []);
        setExistingTags(data.tags || []);
      })
      .catch(() => {
        setExistingCategories([]);
        setExistingTags([]);
      });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localDatetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setDate(localDatetime);
  }, []);

  // Auto-generate slug when title changes
  useEffect(() => {
    if (!slugManual && title) {
      setSlug(generateSlug(title));
    } else if (!slugManual && !title) {
      setSlug('');
    }
  }, [title, slugManual]);

  // Auto-generate featured SEO name when prompt changes (unless manually edited)
  useEffect(() => {
    if (!featuredSeoManual && featuredPrompt) {
      setFeaturedSeoName(promptToFilename(featuredPrompt));
    } else if (!featuredSeoManual && !featuredPrompt) {
      setFeaturedSeoName('');
    }
  }, [featuredPrompt, featuredSeoManual]);

  // Paste handler
  const handlePaste = (e) => {
    e.preventDefault();
    let pastedHtml = e.clipboardData.getData('text/html');
    if (!pastedHtml) {
      pastedHtml = e.clipboardData.getData('text/plain');
    }
    setHtml(pastedHtml);

    const converted = cleanupMarkdown(htmlToMarkdown(pastedHtml));
    setMarkdown(converted);

    // Display the pasted content visually in the contenteditable div
    if (pasteRef.current) {
      pasteRef.current.innerHTML = pastedHtml || e.clipboardData.getData('text/plain');
    }

    // Auto-extract title from first H1 or H2
    if (!title) {
      const match = converted.match(/^#{1,2} (.+)$/m);
      if (match) {
        setTitle(match[1].trim());
      }
    }
  };

  // Build full output with front matter
  const fullOutput = useMemo(() => {
    const dateFormatted = date
      ? date.replace('T', ' ') + ':00'
      : '';

    const catArray = categories
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const tagArray = tags
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const fm = buildFrontmatter({
      title,
      status,
      date: dateFormatted,
      excerpt,
      categories: catArray,
      tags: tagArray,
      featuredImage,
      metaTitle,
      metaDescription,
    });

    return fm + '\n' + markdown;
  }, [title, status, date, excerpt, categories, tags, featuredImage, metaTitle, metaDescription, markdown]);

  // Split fullOutput into blocks for interactive preview with drop zones
  const previewBlocks = useMemo(() => {
    const lines = fullOutput.split('\n');
    // Find the end of front matter (second ---)
    let fmEnd = 0;
    let dashCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '---') dashCount++;
      if (dashCount === 2) {
        fmEnd = i;
        break;
      }
    }
    // Group lines into blocks: front matter is one block, then split body by blank lines
    const blocks = [];
    // Front matter block
    blocks.push({ type: 'frontmatter', text: lines.slice(0, fmEnd + 1).join('\n'), lineIndex: 0 });
    // Body blocks
    let currentBlock = [];
    let blockStart = fmEnd + 1;
    for (let i = fmEnd + 1; i < lines.length; i++) {
      if (lines[i].trim() === '' && currentBlock.length > 0) {
        blocks.push({ type: 'content', text: currentBlock.join('\n'), lineIndex: blockStart });
        currentBlock = [];
        blockStart = i + 1;
      } else {
        currentBlock.push(lines[i]);
      }
    }
    if (currentBlock.length > 0) {
      blocks.push({ type: 'content', text: currentBlock.join('\n'), lineIndex: blockStart });
    }
    return blocks;
  }, [fullOutput]);

  // Insert a body image into the markdown at a specific position
  const handleInsertBodyImage = (afterLine, imageData) => {
    const fmLines = fullOutput.split('\n');
    let fmEnd = 0;
    let dashCount = 0;
    for (let i = 0; i < fmLines.length; i++) {
      if (fmLines[i] === '---') dashCount++;
      if (dashCount === 2) {
        fmEnd = i + 1;
        break;
      }
    }
    // The markdown starts after front matter + blank line
    const mdLineIndex = afterLine - fmEnd - 1; // offset into markdown
    const mdLines = markdown.split('\n');
    const clampedIndex = Math.max(0, Math.min(mdLineIndex, mdLines.length));
    mdLines.splice(clampedIndex, 0, '', `![${imageData.alt}](${imageData.mdPath} "${imageData.title}")`, '');
    setMarkdown(mdLines.join('\n'));
  };

  // Save handler
  const handleSave = async (overwrite = false) => {
    setSaveStatus('saving');
    setSaveMessage('');

    try {
      const url = overwrite ? '/api/save?overwrite=true' : '/api/save';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, content: fullOutput }),
      });

      if (res.status === 409) {
        const confirmed = window.confirm(
          `File "blog/${slug}.md" already exists. Overwrite it?`
        );
        if (confirmed) {
          return handleSave(true);
        }
        setSaveStatus(null);
        setSaveMessage('');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      setSaveStatus('saved');
      setSaveMessage(`Saved to blog/${slug}.md`);

      // Refresh existing files list
      fetch('/api/blog-files')
        .then(r => r.json())
        .then(data => setExistingFiles(data))
        .catch(() => {});
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage(err.message || 'Save failed');
    }
  };

  // Copy handler
  const handleCopy = () => {
    navigator.clipboard.writeText(fullOutput).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  // Reset handler
  const handleReset = () => {
    setHtml('');
    setMarkdown('');
    setTitle('');
    setSlug('');
    setSlugManual(false);
    setStatus('draft');
    setExcerpt('');
    setCategories('');
    setTags('');
    setFeaturedImage('');
    setSaveStatus(null);
    setSaveMessage('');
    setMetaTitle('');
    setMetaDescription('');
    setAnalyzing(false);
    setSuggestedBodyImages([]);
    setFeaturedPrompt('');
    setFeaturedSeoName('');
    setFeaturedPreview('');
    setFeaturedImageLoading(false);
    setFeaturedSeoManual(false);
    setBodyImages([]);
    setBodyImagePrompt('');
    setBodyImageLoading(false);
    setDraggedImage(null);
    if (pasteRef.current) {
      pasteRef.current.innerHTML = '';
    }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localDatetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setDate(localDatetime);
  };

  // Clear paste area
  const handleClearPaste = () => {
    if (pasteRef.current) {
      pasteRef.current.innerHTML = '';
    }
    setHtml('');
    setMarkdown('');
  };

  // Add category if not already present
  const addCategory = (cat) => {
    const current = categories
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!current.includes(cat)) {
      const updated = [...current, cat].join(', ');
      setCategories(updated);
    }
  };

  // Add tag if not already present
  const addTag = (tag) => {
    const current = tags
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!current.includes(tag)) {
      const updated = [...current, tag].join(', ');
      setTags(updated);
    }
  };

  // Analyze article — single AI call to populate meta, slug, and image prompts
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
    } catch (err) {
      alert('Article analysis failed: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate featured image
  const handleGenerateFeaturedImage = async () => {
    setFeaturedImageLoading(true);
    try {
      const result = await generateImage(slug, featuredPrompt, featuredSeoName);
      setFeaturedImage(result.image.path);
      setFeaturedPreview(result.image.previewUrl);
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
      const seoName = promptToFilename(bodyImagePrompt);
      const result = await generateImage(slug, bodyImagePrompt, seoName);
      const newImage = {
        id: Date.now(),
        prompt: bodyImagePrompt,
        seoFilename: seoName,
        ...result.image,
      };
      setBodyImages(prev => [...prev, newImage]);
      setBodyImagePrompt('');
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Rich Text &rarr; Markdown</h1>
      </header>

      <div className="main-layout">
        {/* Left column: paste area */}
        <div className="column paste-column">
          <h2>Paste Rich Text</h2>
          <div
            className="paste-area"
            contentEditable
            onPaste={handlePaste}
            ref={pasteRef}
            data-placeholder="Paste rich text here..."
          />
          <button onClick={handleClearPaste} className="btn btn-secondary">
            Clear
          </button>
        </div>

        {/* Center column: front matter form */}
        <div className="column form-column">
          <h2>Front Matter</h2>

          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
          />

          <button
            className="btn-analyze"
            onClick={handleAnalyze}
            disabled={!title || !markdown || analyzing}
          >
            {analyzing ? (
              <>
                <span className="spinner" />
                Analyzing...
              </>
            ) : (
              'Analyze Article'
            )}
          </button>
          <span className="hint">Fills slug, SEO meta, and image prompts</span>

          <label>Slug</label>
          <div className="slug-row">
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManual(true);
              }}
              placeholder="post-slug"
            />
            {slugManual && (
              <button
                onClick={() => {
                  setSlugManual(false);
                  setSlug(generateSlug(title));
                }}
                className="btn-tiny"
              >
                Auto
              </button>
            )}
          </div>
          {existingFiles.includes(slug + '.md') && (
            <span className="warning">Slug already exists!</span>
          )}

          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="publish">Publish</option>
            <option value="pending">Pending</option>
          </select>

          <label>Date</label>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <label>Excerpt</label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={3}
            placeholder="Short description..."
          />

          {/* SEO Meta Fields */}
          <div className="meta-section">
            <h3>SEO Meta Fields</h3>

            <label>
              SEO Meta Title{' '}
              <span className={`char-counter-textarea ${metaTitle.length > 60 ? 'over' : ''}`}>
                {metaTitle.length}/60
              </span>
            </label>
            <div className="field-with-counter">
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="SEO title (max 60 chars)"
              />
            </div>

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
          </div>

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
                <button key={c.slug} className="chip" onClick={() => addCategory(c.slug)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

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

          {/* Featured Image Panel */}
          <div className="featured-image-panel">
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
              <div className="featured-preview">
                <img src={featuredPreview} alt="Featured image preview" />
                {featuredImage && (
                  <div className="featured-path">{featuredImage}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: body images + preview */}
        <div className="column preview-column">
          <h2>Output Preview</h2>

          {/* Body Image Toolbar */}
          <div className="body-image-toolbar">
            <h3>Body Images</h3>

            {/* Suggested image cards from Analyze */}
            {suggestedBodyImages.length > 0 && (
              <div className="suggested-images">
                {suggestedBodyImages.map((suggestion, idx) => (
                  <div key={idx} className={`suggested-image-card ${suggestion.generated ? 'generated' : ''}`}>
                    <div className="suggested-prompt">{suggestion.prompt}</div>
                    <div className="suggested-section">After: {suggestion.afterSection}</div>
                    {suggestion.generated ? (
                      <span className="suggested-done">Generated</span>
                    ) : (
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
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Manual prompt input */}
            <div className="prompt-row">
              <input
                type="text"
                value={bodyImagePrompt}
                onChange={(e) => setBodyImagePrompt(e.target.value)}
                placeholder="Or describe a custom body image..."
              />
              <button
                className="btn-generate"
                onClick={handleGenerateBodyImage}
                disabled={!slug || !bodyImagePrompt || bodyImageLoading}
                style={{ marginTop: 0 }}
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
            </div>

            {bodyImages.length > 0 && <p className="hint" style={{ marginTop: '0.4rem', marginBottom: '0.2rem' }}>Drag images into the preview below to insert them.</p>}
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
                    <img src={img.previewUrl} alt={img.alt || img.seoFilename} />
                    <div className="image-card-name">{img.filename || img.seoFilename}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactive preview with drop zones */}
          <div className="preview-scroll">
            {previewBlocks.map((block, i) => (
              <div key={i}>
                <pre className="preview-block">{block.text}</pre>
                {block.type === 'content' && (
                  <DropZone
                    onDrop={(imageData) =>
                      handleInsertBodyImage(
                        block.lineIndex + block.text.split('\n').length,
                        imageData
                      )
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="action-bar">
        <button
          onClick={() => handleSave(false)}
          className="btn btn-primary"
          disabled={!slug || !markdown || saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save to blog/'}
        </button>
        <button onClick={handleCopy} className="btn btn-secondary">
          {copyFeedback ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button onClick={handleReset} className="btn btn-secondary">
          Reset
        </button>
        {saveMessage && (
          <span className={`save-message ${saveStatus}`}>{saveMessage}</span>
        )}
      </div>
    </div>
  );
}

export default App;
