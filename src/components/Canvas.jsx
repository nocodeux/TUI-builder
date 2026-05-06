/**
 * Canvas.jsx — Sistema de layout por filas con AutoLayout estilo Figma
 *
 * BUGS CORREGIDOS:
 * 1. Doble drop: Frame/Window ahora retornan { handled: true } y Canvas
 *    verifica monitor.didDrop() correctamente antes de agregar al root.
 * 2. Layout: Cada "row" es un flex-container independiente con direction,
 *    gap, alignment y justification controlables desde el Inspector.
 *
 * MODELO DE DATOS NUEVO:
 * components = [
 *   {
 *     id, type: 'ROW',
 *     layout: { direction: 'row'|'column', gap: 8, align: 'flex-start', justify: 'flex-start', wrap: false },
 *     children: [ { id, type, props, children } ]
 *   }
 * ]
 *
 * Un ROW es el contenedor de layout. Puede contener componentes o estar
 * dentro de un Window/Frame. Los componentes hoja NO tienen ROW propio.
 */

import React, { useCallback } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import Window from './Componentes/Window';
import Frame from './Componentes/Frame';
import Button from './Componentes/Button';
import Label from './Componentes/Label';
import TextBox from './Componentes/TextBox';
import CheckBox from './Componentes/CheckBox';
import RadioButton from './Componentes/RadioButton';
import ComboBox from './Componentes/ComboBox';
import ListBox from './Componentes/ListBox';
import PictureBox from './Componentes/PictureBox';
import Timer from './Componentes/Timer';
import Shape from './Componentes/Shape';
import Line from './Componentes/Line';
import Image from './Componentes/Image';
import ScrollBar from './Componentes/ScrollBar';
import Data from './Componentes/Data';

const componentMap = {
  Window, Frame, Button, Label, TextBox, CheckBox, RadioButton,
  ComboBox, ListBox, PictureBox, Timer, Shape, Line, Image,
  HScrollBar: ScrollBar, VScrollBar: ScrollBar, Data
};

const CONTAINER_TYPES = ['Window', 'Frame', 'PictureBox'];

// ─── Componente hoja draggable (para reordenar dentro del canvas) ───────────
function DraggableComponent({ comp, rowId, index, selectedId, onSelect, onDelete, onDuplicate, onAddComponent, activeWindow, onMoveComponent }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'EXISTING_COMPONENT',
    item: { id: comp.id, fromRowId: rowId, fromIndex: index },
    collect: monitor => ({ isDragging: !!monitor.isDragging() })
  }), [comp.id, rowId, index]);

  const Component = componentMap[comp.type];
  if (!Component) return null;

  // Ventanas inactivas se muestran semitransparentes
  if (comp.type === 'Window' && activeWindow && comp.id !== activeWindow) {
    return (
      <div
        ref={drag}
        className="component-wrapper window-hidden"
        style={{ opacity: 0.35, cursor: 'grab' }}
        title={comp.props.title}
        onClick={e => { e.stopPropagation(); onSelect(comp.id); }}
      >
        <Component {...comp.props} id={comp.id} />
      </div>
    );
  }

  const isContainer = CONTAINER_TYPES.includes(comp.type);

  const handleKeyDown = e => {
    if (e.key === 'Delete') { e.preventDefault(); onDelete(comp.id); }
    if ((e.key === 'd' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); onDuplicate(comp.id); }
  };

  return (
    <div
      ref={drag}
      className={`component-wrapper ${selectedId === comp.id ? 'selected' : ''}`}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab', display: 'inline-flex' }}
      onClick={e => { e.stopPropagation(); onSelect(comp.id); }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Component
        {...comp.props}
        id={comp.id}
        selected={selectedId === comp.id}
        onAddChild={isContainer ? type => onAddComponent(type, comp.id) : undefined}
      >
        {/* Hijos de containers (Window/Frame) — renderizados dentro */}
        {isContainer && comp.children && comp.children.length > 0 &&
          comp.children.map((child, ci) => (
            <DraggableComponent
              key={child.id}
              comp={child}
              rowId={comp.id}   // el parent es el container
              index={ci}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onAddComponent={onAddComponent}
              activeWindow={activeWindow}
              onMoveComponent={onMoveComponent}
            />
          ))
        }
      </Component>
    </div>
  );
}

// ─── Drop zone entre componentes (para reordenar) ────────────────────────────
function DropZone({ rowId, index, onDropExisting, onDropNew }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      if (item.type !== undefined) {
        // Viene del Toolbox (COMPONENT)
        onDropNew(item.type, rowId, index);
      } else {
        // Reordenar existente
        onDropExisting(item, rowId, index);
      }
      return { handled: true };
    },
    collect: monitor => ({ isOver: !!monitor.isOver() })
  }), [rowId, index]);

  return (
    <div
      ref={drop}
      className="drop-zone"
      style={{
        width: isOver ? 32 : 6,
        minWidth: isOver ? 32 : 6,
        height: '100%',
        minHeight: 24,
        background: isOver ? 'var(--accent)' : 'transparent',
        opacity: isOver ? 0.6 : 0,
        transition: 'all 0.15s ease',
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Fila de layout (ROW) ────────────────────────────────────────────────────
function LayoutRow({ row, rowIndex, selectedId, onSelect, onDelete, onDuplicate, onAddComponent, activeWindow, onMoveComponent, onDropToRow, onSelectRow }) {
  const layout = row.layout || { direction: 'row', gap: 8, align: 'flex-start', justify: 'flex-start', wrap: false };

  // Drop zone al final de la fila (para agregar desde toolbox)
  const [{ isOver: isOverRow }, dropRow] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return; // ya lo atrapó una drop zone interior
      if (item.type !== undefined) {
        onDropToRow(item.type, row.id, row.children.length);
      } else {
        onMoveComponent(item, row.id, row.children.length);
      }
      return { handled: true };
    },
    collect: monitor => ({ isOver: !!monitor.isOver({ shallow: true }) })
  }), [row.id, row.children.length]);

  const isRowSelected = selectedId === row.id;

  return (
    <div
      ref={dropRow}
      className={`layout-row ${isRowSelected ? 'row-selected' : ''}`}
      style={{
        display: 'flex',
        flexDirection: layout.direction,
        gap: layout.gap,
        alignItems: layout.align,
        justifyContent: layout.justify,
        flexWrap: layout.wrap ? 'wrap' : 'nowrap',
        minHeight: 32,
        padding: '4px 2px',
        border: isRowSelected ? '1px dashed var(--accent)' : '1px dashed transparent',
        borderRadius: 2,
        position: 'relative',
        background: isOver => isOver ? 'rgba(0,255,0,0.03)' : 'transparent',
        transition: 'border-color 0.15s',
        cursor: 'default',
      }}
      onClick={e => { e.stopPropagation(); onSelectRow(row.id); }}
    >
      {/* Etiqueta de fila */}
      {isRowSelected && (
        <div style={{
          position: 'absolute', top: -16, left: 0,
          fontSize: 9, color: 'var(--accent)', background: 'var(--bg)',
          padding: '1px 4px', pointerEvents: 'none', zIndex: 10,
          border: '1px solid var(--accent)'
        }}>
          ROW {rowIndex + 1} · {layout.direction === 'row' ? '→' : '↓'} gap:{layout.gap}
        </div>
      )}

      {/* Drop zone inicial */}
      <DropZone
        rowId={row.id} index={0}
        onDropExisting={onMoveComponent}
        onDropNew={onDropToRow}
      />

      {row.children.map((comp, ci) => (
        <React.Fragment key={comp.id}>
          <DraggableComponent
            comp={comp}
            rowId={row.id}
            index={ci}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onAddComponent={onAddComponent}
            activeWindow={activeWindow}
            onMoveComponent={onMoveComponent}
          />
          {/* Drop zone después de cada componente */}
          <DropZone
            rowId={row.id} index={ci + 1}
            onDropExisting={onMoveComponent}
            onDropNew={onDropToRow}
          />
        </React.Fragment>
      ))}

      {row.children.length === 0 && (
        <div style={{
          color: 'var(--text-dim)', fontSize: 10, padding: '4px 8px',
          pointerEvents: 'none', opacity: isOverRow ? 0 : 0.6
        }}>
          [ drop here ]
        </div>
      )}
    </div>
  );
}

// ─── Drop zone para nueva fila ────────────────────────────────────────────────
function NewRowDropZone({ onDropNewRow }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT', 'EXISTING_COMPONENT'],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;
      const type = item.type !== undefined ? item.type : null;
      onDropNewRow(type, item);
      return { handled: true };
    },
    collect: monitor => ({ isOver: !!monitor.isOver({ shallow: true }) })
  }), []);

  return (
    <div
      ref={drop}
      style={{
        height: isOver ? 40 : 16,
        border: isOver ? '1px dashed var(--accent)' : '1px dashed transparent',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        color: 'var(--accent)',
        fontSize: 10,
        marginTop: 2,
      }}
    >
      {isOver && '+ Nueva fila'}
    </div>
  );
}

// ─── Canvas principal ─────────────────────────────────────────────────────────
function Canvas({
  rows,           // [ { id, layout, children: [comp, ...] } ]
  selectedId,
  onSelect,
  onDelete,
  onDuplicate,
  viewMode,
  onAddToRow,     // (type, rowId, index) => void
  onAddNewRow,    // (type, existingItem?) => void
  onMoveComponent,// (item, toRowId, toIndex) => void
  onSelectRow,    // (rowId) => void
  activeWindow,
}) {
  // Drop sobre el canvas vacío → nueva fila
  const [{ isOver }, drop] = useDrop(() => ({
    accept: ['COMPONENT'],
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;
      onAddNewRow(item.type, null);
      return { handled: true };
    },
    collect: monitor => ({ isOver: !!monitor.isOver({ shallow: true }) })
  }), []);

  return (
    <div className={`canvas ${viewMode}`}>
      <div
        ref={drop}
        className="preview-area"
        style={{ background: isOver ? 'rgba(0,255,0,0.02)' : undefined }}
        onClick={() => onSelect(null)}
      >
        {rows.length === 0 && !isOver && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40, pointerEvents: 'none' }}>
            [ Arrastra componentes del toolbox al canvas ]<br />
            [ Cada drop crea una nueva fila ]<br />
            [ Selecciona una fila para controlar su layout ]<br />
            [ Delete elimina · Ctrl+D duplica ]
          </div>
        )}

        {rows.map((row, ri) => (
          <React.Fragment key={row.id}>
            <LayoutRow
              row={row}
              rowIndex={ri}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onAddComponent={(type, parentId) => onAddToRow(type, row.id, row.children.length, parentId)}
              activeWindow={activeWindow}
              onMoveComponent={onMoveComponent}
              onDropToRow={onAddToRow}
              onSelectRow={onSelectRow}
            />
            {/* Drop zone para nueva fila entre filas existentes */}
            <NewRowDropZone onDropNewRow={(type, item) => {
              if (type) onAddNewRow(type, null, ri + 1);
              else if (item?.id) onMoveComponent(item, '__newrow__', 0, ri + 1);
            }} />
          </React.Fragment>
        ))}

        {/* Drop zone final siempre visible */}
        {rows.length > 0 && (
          <div style={{ height: 32 }} />
        )}
      </div>
    </div>
  );
}

export default Canvas;
