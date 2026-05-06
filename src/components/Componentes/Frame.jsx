import React from 'react';
import { useDrop } from 'react-dnd';

function Frame({ title = 'Frame1', width = 300, height = '', borderStyle = 'single', bgColor = '', textColor = '', borderColor = '', children, onAddChild, id }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'COMPONENT',
    drop: (item) => {
      if (onAddChild) onAddChild(item.type);
      return { alreadyDropped: true };
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() })
  }));

  const borderValue = borderStyle === 'double' ? '3px double' : borderStyle === 'dashed' ? '1px dashed' : '1px solid';

  return (
    <div className="retro-frame-wrapper" style={{ width: `${width}px` }}>
      <fieldset ref={drop} className="retro-frame" style={{
        border: `${borderValue} ${borderColor || 'var(--border)'}`,
        background: bgColor || 'transparent',
        minHeight: height ? `${height}px` : 'auto'
      }}>
        <legend style={{ color: textColor || 'var(--accent)' }}>{title}</legend>
        <div className="retro-frame-content">
          {children}
          {isOver && <div className="drop-indicator">[+ drop here +]</div>}
        </div>
      </fieldset>
    </div>
  );
}

export default Frame;
