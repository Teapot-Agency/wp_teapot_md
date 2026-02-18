import { generateSlug } from '../lib/slug';

export default function ContentTab({
  pasteRef,
  handlePaste,
  handleInput,
  handleClearPaste,
  title,
  setTitle,
  analyzing,
  markdown,
  handleAnalyze,
  slug,
  setSlug,
  slugManual,
  setSlugManual,
  existingFiles,
  status,
  setStatus,
  date,
  setDate,
  excerpt,
  setExcerpt,
}) {
  return (
    <>
      <h2>Paste Rich Text</h2>
      <div
        className="paste-area"
        contentEditable
        onPaste={handlePaste}
        onInput={handleInput}
        ref={pasteRef}
        data-placeholder="Paste rich text here..."
      />
      <button onClick={handleClearPaste} className="btn btn-secondary btn-sm">
        Clear
      </button>

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
      <span className="hint">Fills slug, SEO meta, image prompts, and language check</span>

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
      {existingFiles.some(f => f.slug === slug) && (
        <span className="warning">Slug already exists!</span>
      )}

      <div className="inline-row">
        <div className="inline-field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="publish">Publish</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="inline-field">
          <label>Date</label>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <label>Excerpt</label>
      <textarea
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        placeholder="Short description..."
      />
    </>
  );
}
