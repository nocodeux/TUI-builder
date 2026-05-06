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
  children,
  onAddChild,
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
      }
      return { handled: true };
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver({ shallow: true })
    })
  }), [onAddChild]);

  return (
    <div
      ref={drop}
      className="retro-window"
      style={{
        width: `${width}px`,
        minHeight: height ? `${height}px` : '',
        height: height ? `${height}px` : 'auto',
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
          outline: isOver ? '2px dashed var(--accent)' : 'none',
          outlineOffset: -4,
          transition: 'outline 0.1s',
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
