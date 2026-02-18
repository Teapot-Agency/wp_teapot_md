import { useState, useEffect } from 'react';
import {
  loadTranslation,
  getTranslationStatus,
  estimateTranslation,
  translateArticle,
  saveTranslation,
  getDeeplUsage,
} from '../lib/api';

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

export default function TranslateView() {
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

  const hasUnsavedTranslations = Object.keys(translations).length > 0 &&
    Object.keys(translations).some(lang => saveStatuses[lang] !== 'saved');

  useEffect(() => {
    fetch('/api/blog-files')
      .then((r) => r.json())
      .then((data) => setFiles(data.filter((f) => f.slug !== 'index')))
      .catch(() => setFiles([]));

    getDeeplUsage()
      .then(setDeeplUsage)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedTranslations) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedTranslations]);

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

        const defaults = {};
        for (const lang of data.defaultTargets || []) {
          if (!data.translations[lang]?.exists) {
            defaults[lang] = true;
          }
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

    const existingLangs = selectedTargets.filter(lang => translationStatus[lang]?.exists);
    if (existingLangs.length > 0) {
      const langNames = existingLangs.map(l => LANG_CONFIG[l]?.name || l.toUpperCase()).join(', ');
      if (!window.confirm(`Translations already exist for: ${langNames}. This will overwrite them. Continue?`)) {
        return;
      }
    }

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

      for (const t of result.translations) {
        try {
          await saveTranslation(selectedSlug, t.lang, t.content);
          setSaveStatuses((prev) => ({ ...prev, [t.lang]: 'saved' }));
        } catch {
          setSaveStatuses((prev) => ({ ...prev, [t.lang]: 'error' }));
        }
      }

      getDeeplUsage().then(setDeeplUsage).catch(() => {});
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
      getTranslationStatus(selectedSlug)
        .then((data) => setTranslationStatus(data.translations || {}))
        .catch(() => {});
    } catch {
      setSaveStatuses((prev) => ({ ...prev, [lang]: 'error' }));
    }
  };

  const handleSaveAll = async () => {
    for (const lang of Object.keys(translations)) {
      await handleSave(lang);
    }
  };

  const handleLoadExisting = async (lang) => {
    try {
      const { content } = await loadTranslation(selectedSlug, lang);
      setTranslations(prev => ({ ...prev, [lang]: { lang, content, billedChars: 0 } }));
      setActivePreviewLang(lang);
      setSaveStatuses(prev => ({ ...prev, [lang]: 'saved' }));
    } catch (err) {
      alert(`Failed to load ${lang.toUpperCase()} translation: ${err.message}`);
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
          onChange={(e) => {
            if (hasUnsavedTranslations && !window.confirm('You have unsaved translations that will be lost. Switch article?')) {
              return;
            }
            setSelectedSlug(e.target.value);
          }}
        >
          <option value="">-- Select an article --</option>
          {files.map((f) => {
            const dateStr = f.modified
              ? new Date(f.modified).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })
              : '';
            const langInfo = f.languages?.length
              ? ` [${f.languages.join(',')}]`
              : ' (not translated)';
            return (
              <option key={f.slug} value={f.slug}>
                {dateStr} | {f.title}{langInfo}
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
                    <span
                      className="status-dot status-exists status-clickable"
                      title="Click to load translation"
                      onClick={(e) => { e.preventDefault(); handleLoadExisting(lang); }}
                    />
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
                <textarea
                  className="preview-block preview-editable"
                  value={translations[activePreviewLang]?.content || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTranslations(prev => ({
                      ...prev,
                      [activePreviewLang]: { ...prev[activePreviewLang], content: val }
                    }));
                    setSaveStatuses(prev => ({ ...prev, [activePreviewLang]: 'unsaved' }));
                  }}
                />
              </div>
            )}

            <div className="save-row">
              {translatedLangs.map((lang) => (
                <button
                  key={lang}
                  className={`btn ${saveStatuses[lang] === 'saved' ? 'btn-saved' : saveStatuses[lang] === 'unsaved' ? 'btn-unsaved' : 'btn-secondary'}`}
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
