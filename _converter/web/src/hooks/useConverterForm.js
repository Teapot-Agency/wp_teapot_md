import { useState, useEffect, useMemo, useRef } from 'react';
import htmlToMarkdown from '../lib/turndown-config';
import { cleanupMarkdown } from '../lib/cleanup';
import { generateSlug } from '../lib/slug';
import { buildFrontmatter } from '../lib/frontmatter';

const DEFAULT_CATEGORIES = [
  { slug: 'ppc', label: 'PPC' },
  { slug: 'seo', label: 'SEO' },
  { slug: 'pharma', label: 'Pharma' },
  { slug: 'rx', label: 'Rx' },
  { slug: 'hcp', label: 'HCP' },
  { slug: 'ai', label: 'AI' },
  { slug: 'otc', label: 'OTC' },
  { slug: 'supplements', label: 'Supplements' },
  { slug: 'employer-branding', label: 'Employer Branding' },
  { slug: 'shoptet', label: 'Shoptet' },
];

export default function useConverterForm() {
  // Sub-tab state for left panel
  const [activeSubTab, setActiveSubTab] = useState('content');

  // Core form state
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

  // SEO meta fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  // Preview mode toggle
  const [previewMode, setPreviewMode] = useState('preview');
  const [editText, setEditText] = useState('');

  // Load article state
  const [loadSlug, setLoadSlug] = useState('');
  const [loadingArticle, setLoadingArticle] = useState(false);

  const pasteRef = useRef(null);

  // Merge default categories with fetched ones
  const allCategories = useMemo(() => {
    const defaultSlugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    const defaultLabels = DEFAULT_CATEGORIES.map((c) => c.label.toLowerCase());
    const extras = existingCategories
      .filter((s) => !defaultSlugs.includes(s.toLowerCase()) && !defaultLabels.includes(s.toLowerCase()))
      .map((s) => ({ slug: s.toLowerCase(), label: s }));
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

    if (pasteRef.current) {
      pasteRef.current.innerHTML = pastedHtml || e.clipboardData.getData('text/plain');
    }

    if (!title) {
      const match = converted.match(/^#{1,2} (.+)$/m);
      if (match) {
        setTitle(match[1].trim());
      }
    }
  };

  // Input handler
  const handleInput = () => {
    if (pasteRef.current) {
      const currentHtml = pasteRef.current.innerHTML;
      setHtml(currentHtml);
      const converted = cleanupMarkdown(htmlToMarkdown(currentHtml));
      setMarkdown(converted);

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

  // Sync edit buffer body back to markdown state
  const syncEditText = () => {
    if (previewMode !== 'edit') return;
    const match = editText.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    if (match) setMarkdown(match[1]);
  };

  // Initialize edit buffer when entering edit mode
  useEffect(() => {
    if (previewMode === 'edit') {
      setEditText(fullOutput);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

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
    const mdLineIndex = afterLine - fmEnd - 1;
    const mdLines = markdown.split('\n');
    const clampedIndex = Math.max(0, Math.min(mdLineIndex, mdLines.length));
    mdLines.splice(clampedIndex, 0, '', `![${imageData.alt}](${imageData.mdPath} "${imageData.title}")`, '');
    setMarkdown(mdLines.join('\n'));
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
    if (!current.some(c => c.toLowerCase() === cat.toLowerCase())) {
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

  return {
    // Sub-tab
    activeSubTab, setActiveSubTab,
    // Core form state
    html, setHtml,
    markdown, setMarkdown,
    title, setTitle,
    slug, setSlug,
    slugManual, setSlugManual,
    status, setStatus,
    date, setDate,
    excerpt, setExcerpt,
    categories, setCategories,
    tags, setTags,
    featuredImage, setFeaturedImage,
    existingFiles, setExistingFiles,
    existingCategories, setExistingCategories,
    existingTags, setExistingTags,
    saveStatus, setSaveStatus,
    saveMessage, setSaveMessage,
    copyFeedback,
    // SEO meta
    metaTitle, setMetaTitle,
    metaDescription, setMetaDescription,
    // Preview mode
    previewMode, setPreviewMode,
    editText, setEditText,
    // Load article
    loadSlug, setLoadSlug,
    loadingArticle, setLoadingArticle,
    // Refs
    pasteRef,
    // Computed
    allCategories,
    fullOutput,
    // Handlers
    handlePaste,
    handleInput,
    handleClearPaste,
    syncEditText,
    handleInsertBodyImage,
    addCategory,
    addTag,
    handleSave,
    handleCopy,
  };
}
