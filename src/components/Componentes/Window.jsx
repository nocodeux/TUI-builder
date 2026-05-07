import React from 'react';
import { useDrop } from 'react-dnd';

/**
 * Window.jsx — CORREGIDO
 *
 * Igual que Frame: retorna { handled: true }, verifica didDrop() para
 * evitar procesamiento doble, y usa isOver({ shallow: true }).
 */
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
  id
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      // Si ya fue manejado por un hijo (Frame anidado, etc), no hacer nada
      if (monitor.didDrop()) return;

      if (item.type !== undefined) {
        // Viene del Toolbox — agregar como hijo de este Window
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
      <div className="retro-window-titlebar">
        <span
          className="retro-window-title"
          style={{ color: textColor || 'var(--accent)' }}
        >
          {title}
        </span>
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
