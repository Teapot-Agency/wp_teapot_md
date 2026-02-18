import { useState } from 'react';

export default function DropZone({ onDrop }) {
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
