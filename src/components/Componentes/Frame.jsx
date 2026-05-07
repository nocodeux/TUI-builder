import React from 'react';
import { useDrop } from 'react-dnd';

/**
 * Frame.jsx — CORREGIDO
 *
 * El drop retorna { handled: true } (nombre consistente con el resto del sistema).
 * El `canDrop` verifica que no sea un drop que ya fue procesado.
 * Se usa `monitor.isOver({ shallow: true })` para que el highlight solo
 * aparezca cuando el cursor está directamente sobre el Frame, no sobre sus hijos.
 */
function Frame({
  title = 'Frame1',
  width = 300,
  height = '',
  borderStyle = 'single',
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
      // Si el drop ya fue manejado por un hijo (otro container anidado), ignorar
      if (monitor.didDrop()) return;

      if (item.type !== undefined) {
        // Viene del Toolbox — agregar como hijo del Frame
        if (onAddChild) onAddChild(item.type);
      } else if (item.id && onMoveChild) {
        onMoveChild(item);
      }
      // Si es EXISTING_COMPONENT (reordenar) no hacemos nada aquí —
      // el reordenamiento entre filas lo maneja el Canvas
      return { handled: true };
    },
    // Solo mostrar como drop target cuando el cursor está directamente aquí
    collect: (monitor) => ({
      isOver: !!monitor.isOver({ shallow: true })
    })
  }), [onAddChild, onMoveChild]);

  const borderValue =
    borderStyle === 'double' ? '3px double' :
    borderStyle === 'dashed' ? '1px dashed' :
    '1px solid';

  return (
    <div className="retro-frame-wrapper" style={{ width: typeof width === 'string' && width.includes('%') ? width : `${width}px` }}>
      <fieldset
        ref={drop}
        className="retro-frame"
        style={{
          border: `${borderValue} ${borderColor || 'var(--border)'}`,
          background: bgColor || 'transparent',
          minHeight: height ? (typeof height === 'string' && height.includes('%') ? height : `${height}px`) : 'auto',
          height: height ? (typeof height === 'string' && height.includes('%') ? height : `${height}px`) : 'auto',
          outline: isOver ? `2px dashed var(--accent)` : 'none',
          outlineOffset: -2,
          transition: 'outline 0.1s',
        }}
      >
        <legend style={{ color: textColor || 'var(--accent)' }}>{title}</legend>
        <div
          className="retro-frame-content"
          style={{
            display: 'flex',
            flexDirection: layout.direction,
            gap: layout.gap,
            alignItems: layout.align,
            justifyContent: layout.justify,
            flexWrap: layout.wrap ? 'wrap' : 'nowrap',
            paddingTop: layout.paddingTop ?? 0,
            paddingRight: layout.paddingRight ?? 0,
            paddingBottom: layout.paddingBottom ?? 0,
            paddingLeft: layout.paddingLeft ?? 0,
          }}
        >
          {children}
          {isOver && (
            <div className="drop-indicator">[+ drop here +]</div>
          )}
        </div>
      </fieldset>
    </div>
  );
}

export default Frame;
