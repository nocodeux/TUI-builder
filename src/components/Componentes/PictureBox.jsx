import React from 'react';
import { useDrop } from 'react-dnd';

function PictureBox({ width = 150, height = 100, stretch = false, border = true, borderColor = '', children, onAddChild, id }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'COMPONENT',
    drop: (item) => {
      if (item.type === 'Image' && onAddChild) onAddChild(item.type);
      return { alreadyDropped: true };
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() })
  }));

  return (
    <div ref={drop} className="retro-picturebox" style={{ width: `${width}px`, minHeight: `${height}px`, border: border ? `1px solid ${borderColor || 'var(--border)'}` : 'none' }}>
      {children}
      {isOver && <div style={{ color: 'var(--accent)', fontSize: 10, textAlign: 'center' }}>[+ Drop Image +]</div>}
    </div>
  );
}

export default PictureBox;
