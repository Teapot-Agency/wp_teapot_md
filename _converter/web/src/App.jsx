import { useState, useEffect, useMemo, useRef } from 'react';
import htmlToMarkdown from './lib/turndown-config';
import { cleanupMarkdown } from './lib/cleanup';
import { generateSlug } from './lib/slug';
import { buildFrontmatter } from './lib/frontmatter';
import { analyzeArticle, generateImage, getTranslationStatus, estimateTranslation, translateArticle, saveTranslation, getDeeplUsage } from './lib/api';
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

// ---------------------------------------------------------------------------
// Language config for TranslateView
// ---------------------------------------------------------------------------

const LANG_CONFIG = {
  sk: { name: 'Slovak', color: '#3B82F6' },
  cs: { name: 'Czech', color: '#EF4444' },
  en: { name: 'English', color: '#10B981' },
  de: { name: 'German', color: '#F59E0B' },
  fr: { name: 'French', color: '#8B5CF6' },
  es: { name: 'Spanish', color: '#EC4899' },
  pl: { name: 'Polish', color: '#F97316' },
  hu: { name: 'Hungarian', color: '#14B8A6' },
};

const DEFAULT_LANGS = ['sk', 'cs', 'en'];

// ---------------------------------------------------------------------------
// TranslateView component
// ---------------------------------------------------------------------------

function TranslateView() {
  const [files, setFiles] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [sourceLang, setSourceLang] = useState('');
  const [targetLangs, setTargetLangs] = useState({});
  const [translationStatus, setTranslationStatus] = useState({});
  const [estimate, setEstimate] = useState(null);
  const [translations, setTranslations] = useState({});
  const [translating, setTranslating] = useState(false);
  const [formality, setFormality] = useState('default');
  const [activePreviewLang, setActivePreviewLang] = useState('');
  const [deeplUsage, setDeeplUsage] = useState(null);
  const [saveStatuses, setSaveStatuses] = useState({});
  const [showExtra, setShowExtra] = useState(false);

  // Load file list on mount
  useEffect(() => {
    fetch('/api/blog-files')
      .then((r) => r.json())
      .then((data) => setFiles(data.filter((f) => f !== 'index.md')))
      .catch(() => setFiles([]));

    // Fetch initial DeepL usage
    getDeeplUsage()
      .then(setDeeplUsage)
      .catch(() => {});
  }, []);

  // When article is selected, fetch translation status
  useEffect(() => {
    if (!selectedSlug) {
      setSourceLang('');
      setTargetLangs({});
      setTranslationStatus({});
      setEstimate(null);
      setTranslations({});
      return;
    }

    getTranslationStatus(selectedSlug)
      .then((data) => {
        setSourceLang(data.sourceLang || '');
        setTranslationStatus(data.translations || {});
        setEstimate({ charsPerLang: data.charsEstimate });

        // Pre-check default targets
        const defaults = {};
        for (const lang of data.defaultTargets || []) {
          defaults[lang] = true;
        }
        setTargetLangs(defaults);
        setTranslations({});
        setSaveStatuses({});
      })
      .catch(() => {});
  }, [selectedSlug]);

  const toggleLang = (lang) => {
    setTargetLangs((prev) => ({ ...prev, [lang]: !prev[lang] }));
  };

  const selectedTargets = Object.entries(targetLangs)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const totalEstimate = (estimate?.charsPerLang || 0) * selectedTargets.length;

  const handleEstimate = async () => {
    if (!selectedSlug || !selectedTargets.length) return;
    try {
      const data = await estimateTranslation(selectedSlug, selectedTargets);
      setEstimate(data);
      setDeeplUsage({ count: data.quota.used, limit: data.quota.limit, percent: data.quota.percent });
    } catch (err) {
      alert('Estimation failed: ' + err.message);
    }
  };

  const handleTranslate = async () => {
    if (!selectedSlug || !selectedTargets.length) return;
    setTranslating(true);
    try {
      const result = await translateArticle(selectedSlug, selectedTargets, {
        formality: formality !== 'default' ? formality : undefined,
      });
      const translationMap = {};
      for (const t of result.translations) {
        translationMap[t.lang] = t;
      }
      setTranslations(translationMap);
      if (result.translations.length > 0) {
        setActivePreviewLang(result.translations[0].lang);
      }
      // Refresh usage
      getDeeplUsage().then(setDeeplUsage).catch(() => {});
      // Refresh status
      getTranslationStatus(selectedSlug)
        .then((data) => setTranslationStatus(data.translations || {}))
        .catch(() => {});
    } catch (err) {
      alert('Translation failed: ' + err.message);
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async (lang) => {
    const t = translations[lang];
    if (!t) return;
    setSaveStatuses((prev) => ({ ...prev, [lang]: 'saving' }));
    try {
      await saveTranslation(selectedSlug, lang, t.content);
      setSaveStatuses((prev) => ({ ...prev, [lang]: 'saved' }));
      // Refresh status
      getTranslationStatus(selectedSlug)
        .then((data) => setTranslationStatus(data.translations || {}))
        .catch(() => {});
    } catch (err) {
      setSaveStatuses((prev) => ({ ...prev, [lang]: 'error' }));
    }
  };

  const handleSaveAll = async () => {
    for (const lang of Object.keys(translations)) {
      await handleSave(lang);
    }
  };

  const translatedLangs = Object.keys(translations);

  return (
    <div className="translate-layout">
      {/* Left: Controls */}
      <div className="translate-controls">
        <h2>Translate Article</h2>

        <label>Select Article</label>
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
        >
          <option value="">-- Select an article --</option>
          {files.map((f) => {
            const s = f.replace(/\.md$/, '');
            return (
              <option key={s} value={s}>
                {f}
              </option>
            );
          })}
        </select>

        {sourceLang && (
          <div className="source-lang-badge">
            Source:{' '}
            <span
              className="lang-chip"
              style={{ background: LANG_CONFIG[sourceLang.toLowerCase()]?.color || '#888' }}
            >
              {LANG_CONFIG[sourceLang.toLowerCase()]?.name || sourceLang}
            </span>
          </div>
        )}

        {selectedSlug && (
          <>
            <h3>Target Languages</h3>
            <div className="lang-grid">
              {DEFAULT_LANGS.map((lang) => (
                <label key={lang} className="lang-option">
                  <input
                    type="checkbox"
                    checked={!!targetLangs[lang]}
                    onChange={() => toggleLang(lang)}
                  />
                  <span
                    className="lang-chip-sm"
                    style={{ background: LANG_CONFIG[lang]?.color || '#888' }}
                  >
                    {lang.toUpperCase()}
                  </span>
                  {LANG_CONFIG[lang]?.name}
                  {translationStatus[lang]?.exists && (
                    <span className="status-dot status-exists" title="Translation exists" />
                  )}
                  {!translationStatus[lang]?.exists && (
                    <span className="status-dot status-missing" title="No translation" />
                  )}
                </label>
              ))}
            </div>

            <button className="btn-tiny" onClick={() => setShowExtra(!showExtra)}>
              {showExtra ? 'Hide extra languages' : '+ More languages'}
            </button>

            {showExtra && (
              <div className="lang-grid extra-langs">
                {Object.entries(LANG_CONFIG)
                  .filter(([k]) => !DEFAULT_LANGS.includes(k))
                  .map(([lang, cfg]) => (
                    <label key={lang} className="lang-option">
                      <input
                        type="checkbox"
                        checked={!!targetLangs[lang]}
                        onChange={() => toggleLang(lang)}
                      />
                      <span className="lang-chip-sm" style={{ background: cfg.color }}>
                        {lang.toUpperCase()}
                      </span>
                      {cfg.name}
                    </label>
                  ))}
              </div>
            )}

            {/* Estimate */}
            <div className="estimate-panel">
              <h3>Character Estimate</h3>
              <div className="estimate-row">
                <span>Per language:</span>
                <strong>{(estimate?.charsPerLang || 0).toLocaleString()} chars</strong>
              </div>
              <div className="estimate-row">
                <span>Total ({selectedTargets.length} lang{selectedTargets.length !== 1 ? 's' : ''}):</span>
                <strong>{totalEstimate.toLocaleString()} chars</strong>
              </div>
              {deeplUsage && (
                <>
                  <div className="quota-bar-container">
                    <div className="quota-bar">
                      <div
                        className="quota-bar-fill"
                        style={{ width: `${Math.min(deeplUsage.percent, 100)}%` }}
                      />
                    </div>
                    <span className="quota-text">
                      {deeplUsage.count.toLocaleString()} / {deeplUsage.limit.toLocaleString()} ({deeplUsage.percent}%)
                    </span>
                  </div>
                  {deeplUsage.limit - deeplUsage.count < totalEstimate && (
                    <div className="quota-warning">Insufficient quota for this translation!</div>
                  )}
                </>
              )}
              <button className="btn btn-secondary" onClick={handleEstimate} disabled={!selectedTargets.length}>
                Refresh Estimate
              </button>
            </div>

            {/* Formality */}
            <label>Formality</label>
            <select value={formality} onChange={(e) => setFormality(e.target.value)}>
              <option value="default">Default</option>
              <option value="more">More formal</option>
              <option value="less">Less formal</option>
              <option value="prefer_more">Prefer more formal</option>
              <option value="prefer_less">Prefer less formal</option>
            </select>

            {/* Action buttons */}
            <div className="translate-actions">
              <button
                className="btn btn-primary"
                onClick={handleTranslate}
                disabled={!selectedTargets.length || translating}
              >
                {translating ? (
                  <>
                    <span className="spinner" /> Translating...
                  </>
                ) : (
                  `Translate to ${selectedTargets.length} language${selectedTargets.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right: Preview */}
      <div className="translate-preview">
        <h2>Translation Preview</h2>

        {translatedLangs.length > 0 ? (
          <>
            <div className="translation-tabs">
              {translatedLangs.map((lang) => (
                <button
                  key={lang}
                  className={`translation-tab ${activePreviewLang === lang ? 'active' : ''}`}
                  onClick={() => setActivePreviewLang(lang)}
                  style={{ borderColor: LANG_CONFIG[lang]?.color || '#888' }}
                >
                  <span className="lang-chip-sm" style={{ background: LANG_CONFIG[lang]?.color || '#888' }}>
                    {lang.toUpperCase()}
                  </span>
                  {LANG_CONFIG[lang]?.name || lang}
                  {translations[lang]?.billedChars && (
                    <span className="chars-badge">{translations[lang].billedChars.toLocaleString()} chars</span>
                  )}
                </button>
              ))}
            </div>

            {activePreviewLang && translations[activePreviewLang] && (
              <div className="preview-scroll">
                <pre className="preview-block">{translations[activePreviewLang].content}</pre>
              </div>
            )}

            <div className="save-row">
              {translatedLangs.map((lang) => (
                <button
                  key={lang}
                  className={`btn ${saveStatuses[lang] === 'saved' ? 'btn-saved' : 'btn-secondary'}`}
                  onClick={() => handleSave(lang)}
                  disabled={saveStatuses[lang] === 'saving'}
                >
                  {saveStatuses[lang] === 'saving'
                    ? 'Saving...'
                    : saveStatuses[lang] === 'saved'
                    ? `Saved ${lang.toUpperCase()}`
                    : `Save ${lang.toUpperCase()}`}
                </button>
              ))}
              {translatedLangs.length > 1 && (
                <button className="btn btn-primary" onClick={handleSaveAll}>
                  Save All
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="translate-empty">
            {selectedSlug
              ? 'Select target languages and click Translate to see results here.'
              : 'Select an article to begin translating.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App component
// ---------------------------------------------------------------------------

function App() {
  // Tab state
  const [activeTab, setActiveTab] = useState('converter');

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
  const [bodyImageSeoName, setBodyImageSeoName] = useState('');
  const [bodyImageSeoManual, setBodyImageSeoManual] = useState(false);
  const [bodyImageLoading, setBodyImageLoading] = useState(false);
  const [draggedImage, setDraggedImage] = useState(null);

  // Collapsible section states
  const [seoOpen, setSeoOpen] = useState(false);
  const [catTagsOpen, setCatTagsOpen] = useState(false);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [bodyImagesOpen, setBodyImagesOpen] = useState(false);

  const pasteRef = useRef(null);
  const featuredPreviewRef = useRef(null);

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

  // Track whether there's unsaved work
  const hasUnsavedWork = !!(markdown || title || featuredPreview || bodyImages.length > 0);

  // Warn before closing/navigating away with unsaved content
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

  // Auto-generate body image SEO name when prompt changes (unless manually edited)
  useEffect(() => {
    if (!bodyImageSeoManual && bodyImagePrompt) {
      setBodyImageSeoName(promptToFilename(bodyImagePrompt));
    } else if (!bodyImageSeoManual && !bodyImagePrompt) {
      setBodyImageSeoName('');
    }
  }, [bodyImagePrompt, bodyImageSeoManual]);

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

  // Input handler - updates markdown when contenteditable is manually edited
  const handleInput = () => {
    if (pasteRef.current) {
      const currentHtml = pasteRef.current.innerHTML;
      setHtml(currentHtml);
      const converted = cleanupMarkdown(htmlToMarkdown(currentHtml));
      setMarkdown(converted);

      // Auto-extract title from first H1 or H2 if title is empty
      if (!title) {
        const match = converted.match(/^#{1,2} (.+)$/m);
        if (match) {
          setTitle(match[1].trim());
        }
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
    if (hasUnsavedWork && !window.confirm('You have unsaved content. Are you sure you want to reset everything?')) {
      return;
    }
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
    setBodyImageSeoName('');
    setBodyImageSeoManual(false);
    setBodyImageLoading(false);
    setDraggedImage(null);
    setSeoOpen(false);
    setCatTagsOpen(false);
    setFeaturedOpen(false);
    setBodyImagesOpen(false);
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
      setSeoOpen(true);
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
        setFeaturedOpen(true);
      }
      if (result.bodyImages && result.bodyImages.length > 0) {
        setSuggestedBodyImages(result.bodyImages);
        setBodyImagesOpen(true);
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
      // Scroll to the preview after a short delay to let the image render
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
        <h1>Teapot Content Tools</h1>
        <nav className="tab-nav">
          <button
            className={activeTab === 'converter' ? 'active' : ''}
            onClick={() => setActiveTab('converter')}
          >
            Converter
          </button>
          <button
            className={activeTab === 'translate' ? 'active' : ''}
            onClick={() => setActiveTab('translate')}
          >
            Translate
          </button>
        </nav>
      </header>

      {activeTab === 'translate' && <TranslateView />}

      {activeTab === 'converter' && <><div className="main-layout">
        {/* Left column: paste area */}
        <div className="column paste-column">
          <h2>Paste Rich Text</h2>
          <div
            className="paste-area"
            contentEditable
            onPaste={handlePaste}
            onInput={handleInput}
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
          <details className="collapsible" open={seoOpen} onToggle={(e) => setSeoOpen(e.currentTarget.open)}>
            <summary>SEO Meta Fields</summary>
            <div className="collapsible-content">
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
          </details>

          <details className="collapsible" open={catTagsOpen} onToggle={(e) => setCatTagsOpen(e.currentTarget.open)}>
            <summary>Categories & Tags</summary>
            <div className="collapsible-content two-col-row">
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
                      <button key={c.slug} className="chip" onClick={() => addCategory(c.slug)}>
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
          </details>

          {/* Featured Image Panel */}
          <details className="collapsible" open={featuredOpen} onToggle={(e) => setFeaturedOpen(e.currentTarget.open)}>
            <summary>Featured Image</summary>
            <div className="collapsible-content">
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
                  <a href={featuredPreview} target="_blank" rel="noopener noreferrer">
                    <img src={featuredPreview} alt="Featured image preview" />
                  </a>
                  <div className="featured-info">
                    <div className="featured-preview-label">Blog header / hero image</div>
                    {featuredImage && (
                      <div className="featured-path">{featuredImage}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Right column: body images + preview */}
        <div className="column preview-column">
          <h2>Output Preview</h2>

          {/* Body Image Toolbar */}
          <details className="collapsible" open={bodyImagesOpen} onToggle={(e) => setBodyImagesOpen(e.currentTarget.open)}>
            <summary>Body Images</summary>
            <div className="collapsible-content">

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
                          rows={2}
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
          </details>

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
      </>}
    </div>
  );
}

export default App;
