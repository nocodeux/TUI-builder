import React from 'react';
import { useDrop } from 'react-dnd';

function Row({
  layout = { direction: 'row', gap: 8, align: 'flex-start', justify: 'flex-start', wrap: false },
  children,
  onAddChild,
  onMoveChild,
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;
      if (item.type !== undefined) {
        if (onAddChild) onAddChild(item.type);
      } else if (item.id && onMoveChild) {
        onMoveChild(item);
      }
      return { handled: true };
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver({ shallow: true }) })
  }), [onAddChild, onMoveChild]);

  return (
    <div
      ref={drop}
      className="retro-row"
      style={{
        display: 'flex',
        flexDirection: layout.direction,
        gap: layout.gap,
        alignItems: layout.align,
        justifyContent: layout.justify,
        flexWrap: layout.wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
      {isOver && <div className="drop-indicator">[+ drop here +]</div>}
    </div>
  );
}

export default Row;
