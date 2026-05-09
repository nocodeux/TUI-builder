import React, { useContext } from 'react';
import { useDrop } from 'react-dnd';
import { DataContext } from './DataRepeater';

function Window({
  title = 'Window1',
  width = 400,
  height = '',
  bgColor = '',
  textColor = '',
  borderColor = '',
  layout = { direction: 'row', gap: 8, align: 'flex-start', justify: 'flex-start', wrap: false },
  children,
  onAddChild,
  onMoveChild,
  id,
  showClose = false,
  closeNextScreenId = null,
  onNavigate,
  staggered = false,
  dataSourceType = 'manual',
  dataField = ''
}) {
  const data = useContext(DataContext);
  
  const resolvedTitle = (dataSourceType === 'database' && data && dataField)
    ? String(data[dataField] ?? title)
    : title;

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;

      if (item.id === undefined) {
        if (onAddChild) onAddChild(item.type);
      } else if (item.id && onMoveChild) {
        onMoveChild(item);
      }
      return { handled: true };
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver({ shallow: true })
    })
  }), [onAddChild, onMoveChild]);

  return (
    <div
      ref={drop}
      className="retro-window"
      style={{
        width: typeof width === 'string' && width.includes('%') ? width : `${width}px`,
        minHeight: height ? (typeof height === 'string' && height.includes('%') ? height : `${height}px`) : '',
        height: height ? (typeof height === 'string' && height.includes('%') ? height : `${height}px`) : 'auto',
        background: bgColor || 'var(--bg)',
        borderColor: borderColor || 'var(--border)',
      }}
    >
      <div className="retro-window-titlebar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          className="retro-window-title"
          style={{ color: textColor || 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
        >
          {resolvedTitle}
        </span>
        {showClose && (
          <button 
            className="retro-window-close"
            onClick={(e) => {
              if ((e.metaKey || e.ctrlKey) && onNavigate && closeNextScreenId) {
                e.stopPropagation();
                onNavigate({ props: { action: 'screen', targetScreenId: closeNextScreenId } });
              }
            }}
          >
            X
          </button>
        )}
      </div>
      <div
        className="retro-window-content"
        style={{
          display: 'flex',
          flexDirection: layout.direction,
          gap: layout.gap,
          alignItems: layout.align,
          justifyContent: layout.justify,
          flexWrap: layout.wrap ? 'wrap' : 'nowrap',
          paddingTop: (layout.paddingTop ?? 0) + 12,
          paddingRight: (layout.paddingRight ?? 0) + 12,
          paddingBottom: (layout.paddingBottom ?? 0) + 12,
          paddingLeft: (layout.paddingLeft ?? 0) + 12,
          outline: isOver ? '2px dashed var(--accent)' : 'none',
          outlineOffset: -4,
          transition: 'outline 0.1s',
          minHeight: 40,
        }}
      >
        {children}
        {isOver && (
          <div className="drop-indicator">[+ drop here +]</div>
        )}
      </div>
    </div>
  );
}

export default Window;
