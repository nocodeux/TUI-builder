import React from 'react';
import { useDrop } from 'react-dnd';

function PictureBox({ width = 150, height = 100, stretch = false, border = true, borderColor = '', children, onAddChild, onMoveChild, id }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;
      if (item.type === 'Image' && onAddChild) onAddChild(item.type);
      else if (item.id && onMoveChild) onMoveChild(item);
      return { handled: true };
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver({ shallow: true }) })
  }), [onAddChild, onMoveChild]);

  return (
    <div ref={drop} className="retro-picturebox" style={{ 
      width: typeof width === 'string' && width.includes('%') ? width : `${width}px`, 
      minHeight: height ? (typeof height === 'string' && height.includes('%') ? height : `${height}px`) : 'auto',
      height: height ? (typeof height === 'string' && height.includes('%') ? height : `${height}px`) : 'auto',
      border: border ? `1px solid ${borderColor || 'var(--border)'}` : 'none' 
    }}>
      {children}
      {isOver && <div style={{ color: 'var(--accent)', fontSize: 10, textAlign: 'center' }}>[+ Drop Image +]</div>}
    </div>
  );
}

export default PictureBox;
