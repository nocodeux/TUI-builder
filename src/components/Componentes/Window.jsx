import React from 'react';
import { useDrop } from 'react-dnd';

function Window({ title = 'Window1', width = 400, height = '', bgColor = '', textColor = '', borderColor = '', children, onAddChild, id }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'COMPONENT',
    drop: (item) => {
      if (onAddChild) onAddChild(item.type);
      return { handled: true };
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() })
  }));

  return (
    <div ref={drop} className="retro-window" style={{
      width: `${width}px`,
      minHeight: height ? `${height}px` : '',
      height: height ? `${height}px` : 'auto',
      background: bgColor || 'var(--bg)',
      borderColor: borderColor || 'var(--border)'
    }}>
      <div className="retro-window-titlebar">
        <span className="retro-window-title" style={{ color: textColor || 'var(--accent)' }}>{title}</span>
      </div>
      <div className="retro-window-content" style={{ borderColor: isOver ? 'var(--accent)' : 'transparent' }}>
        {children}
        {isOver && <div className="drop-indicator">[+ drop here +]</div>}
      </div>
    </div>
  );
}

export default Window;
