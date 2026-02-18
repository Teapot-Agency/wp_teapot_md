import { useMemo } from 'react';
import DropZone from './DropZone';

export default function PreviewPanel({
  fullOutput,
  previewMode,
  setPreviewMode,
  editText,
  setEditText,
  syncEditText,
  onInsertBodyImage,
}) {
  // Split fullOutput into blocks for interactive preview with drop zones
  const previewBlocks = useMemo(() => {
    const lines = fullOutput.split('\n');
    let fmEnd = 0;
    let dashCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '---') dashCount++;
      if (dashCount === 2) {
        fmEnd = i;
        break;
      }
    }
    const blocks = [];
    blocks.push({ type: 'frontmatter', text: lines.slice(0, fmEnd + 1).join('\n'), lineIndex: 0 });
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

  return (
    <>
      <div className="preview-header">
        <h2>Output Preview</h2>
        <button
          className="btn-tiny"
          onClick={() => {
            syncEditText();
            setPreviewMode(p => p === 'preview' ? 'edit' : 'preview');
          }}
        >
          {previewMode === 'preview' ? 'Edit' : 'Preview'}
        </button>
      </div>
      <div className="preview-scroll">
        {previewMode === 'edit' ? (
          <textarea
            className="preview-block preview-editable"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={syncEditText}
          />
        ) : (
          previewBlocks.map((block, i) => (
            <div key={i}>
              <pre className="preview-block">{block.text}</pre>
              {block.type === 'content' && (
                <DropZone
                  onDrop={(imageData) =>
                    onInsertBodyImage(
                      block.lineIndex + block.text.split('\n').length,
                      imageData
                    )
                  }
                />
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
